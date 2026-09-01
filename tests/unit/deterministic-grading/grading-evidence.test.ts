import test from "node:test";
import assert from "node:assert/strict";
import { toCommitEvidenceInput } from "../../../src/features/deterministic-grading/grading-evidence.ts";

const studentContext = {
  courseId: "course-1",
  conceptIds: ["concept-1"],
  edgeIds: [],
  assessmentAttemptId: "attempt-1",
};

const responseMeta = {
  evidenceType: "retrieval" as const,
  assistanceLevel: 0,
  difficulty: 0.5,
  transferDistance: 0,
};

test("a 'correct' checker result maps to correctness:true, graderConfidence:1.0", () => {
  const input = toCommitEvidenceInput(studentContext, { outcome: "correct" }, responseMeta);
  assert.ok(input);
  assert.equal(input!.correctness, true);
  assert.equal(input!.graderConfidence, 1.0);
  assert.equal(input!.assessmentAttemptId, "attempt-1");
});

test("an 'incorrect' checker result maps to correctness:false, graderConfidence:1.0", () => {
  const input = toCommitEvidenceInput(
    studentContext,
    { outcome: "incorrect", firstDivergenceIndex: 1, expectedAtThatIndex: ["X"] },
    responseMeta,
  );
  assert.ok(input);
  assert.equal(input!.correctness, false);
  assert.equal(input!.graderConfidence, 1.0);
});

test("an 'invalid_input' result produces no CommitEvidenceInput at all", () => {
  const input = toCommitEvidenceInput(studentContext, { outcome: "invalid_input", reason: "bad input" }, responseMeta);
  assert.equal(input, null);
});

test("a 'did_not_complete' code result produces no CommitEvidenceInput at all", () => {
  const input = toCommitEvidenceInput(
    studentContext,
    { outcome: "did_not_complete", reason: "timeout", detail: "exceeded 10s" },
    responseMeta,
  );
  assert.equal(input, null);
});

test("a 'graded' code result maps correctness from allPassed", () => {
  const passed = toCommitEvidenceInput(
    studentContext,
    { outcome: "graded", allPassed: true, tests: [{ name: "t1", passed: true, output: "" }] },
    responseMeta,
  );
  assert.equal(passed!.correctness, true);

  const failed = toCommitEvidenceInput(
    studentContext,
    { outcome: "graded", allPassed: false, tests: [{ name: "t1", passed: false, output: "" }] },
    responseMeta,
  );
  assert.equal(failed!.correctness, false);
});

test("a rubric grading result uses its own real confidence, never inflated", () => {
  const lowConfidence = toCommitEvidenceInput(
    studentContext,
    { outcome: "correct", satisfiedCriteria: ["idea1"], matchedMisconception: null, confidence: 0.4, isLowConfidence: true },
    responseMeta,
  );
  assert.equal(lowConfidence!.graderConfidence, 0.4);
  assert.equal(lowConfidence!.correctness, true);
});

test("a 'partial' rubric outcome maps to correctness:false (not fully correct, but still real evidence)", () => {
  const partial = toCommitEvidenceInput(
    studentContext,
    { outcome: "partial", satisfiedCriteria: ["idea1"], matchedMisconception: null, confidence: 0.9, isLowConfidence: false },
    responseMeta,
  );
  assert.equal(partial!.correctness, false);
});
