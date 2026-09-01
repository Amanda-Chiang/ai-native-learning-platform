import test from "node:test";
import assert from "node:assert/strict";
import { runValidationLayers, MAX_GENERATION_ATTEMPTS, type LayerRunners } from "../../../src/features/assessment-generation-pipeline/validation-pipeline.ts";

const PASS = { passed: true, detail: "ok" };

function passingRunners(): LayerRunners {
  return {
    schema: () => PASS,
    sourceAlignment: () => PASS,
    independentSolve: () => PASS,
    answerAgreement: () => PASS,
    ambiguity: () => PASS,
    similarity: () => PASS,
  };
}

test("MAX_GENERATION_ATTEMPTS is a small, exported, testable bound", () => {
  assert.equal(MAX_GENERATION_ATTEMPTS, 3);
});

test("all six layers passing produces a fully-passed report", async () => {
  const report = await runValidationLayers(passingRunners());
  assert.equal(report.schema.passed, true);
  assert.equal(report.similarity.passed, true);
});

test("a failure at sourceAlignment short-circuits every later layer as 'not reached'", async () => {
  const runners = passingRunners();
  runners.sourceAlignment = () => ({ passed: false, detail: "misaligned" });
  const report = await runValidationLayers(runners);
  assert.equal(report.sourceAlignment.passed, false);
  assert.deepEqual(report.independentSolve, { passed: false, detail: "not reached" });
  assert.deepEqual(report.answerAgreement, { passed: false, detail: "not reached" });
  assert.deepEqual(report.ambiguity, { passed: false, detail: "not reached" });
  assert.deepEqual(report.similarity, { passed: false, detail: "not reached" });
});

test("a failure at independentSolve never lets answerAgreement run", async () => {
  const runners = passingRunners();
  runners.independentSolve = () => ({ passed: false, detail: "checker disagrees" });
  let answerAgreementCalled = false;
  runners.answerAgreement = () => {
    answerAgreementCalled = true;
    return PASS;
  };
  const report = await runValidationLayers(runners);
  assert.equal(report.independentSolve.passed, false);
  assert.equal(answerAgreementCalled, false);
  assert.deepEqual(report.answerAgreement, { passed: false, detail: "not reached" });
});

test("the first passing attempt stops a bounded regeneration loop, never exceeding MAX_GENERATION_ATTEMPTS retries", async () => {
  let attempts = 0;
  let succeededOnAttempt: number | null = null;

  for (let attemptNumber = 1; attemptNumber <= MAX_GENERATION_ATTEMPTS; attemptNumber += 1) {
    attempts += 1;
    const runners = passingRunners();
    if (attemptNumber < 2) {
      runners.schema = () => ({ passed: false, detail: "malformed" });
    }
    const report = await runValidationLayers(runners);
    const outcome = Object.values(report).every((layer) => layer.passed) ? "passed" : "failed";
    if (outcome === "passed") {
      succeededOnAttempt = attemptNumber;
      break;
    }
  }

  assert.equal(succeededOnAttempt, 2);
  assert.equal(attempts, 2);
  assert.ok(attempts <= MAX_GENERATION_ATTEMPTS);
});

test("a bound reached with every attempt failing never exceeds MAX_GENERATION_ATTEMPTS retries", async () => {
  let attempts = 0;
  let succeeded = false;

  for (let attemptNumber = 1; attemptNumber <= MAX_GENERATION_ATTEMPTS; attemptNumber += 1) {
    attempts += 1;
    const runners = passingRunners();
    runners.schema = () => ({ passed: false, detail: "always malformed" });
    const report = await runValidationLayers(runners);
    const outcome = Object.values(report).every((layer) => layer.passed) ? "passed" : "failed";
    if (outcome === "passed") succeeded = true;
  }

  assert.equal(succeeded, false);
  assert.equal(attempts, MAX_GENERATION_ATTEMPTS);
});
