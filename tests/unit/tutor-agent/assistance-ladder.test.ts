import test from "node:test";
import assert from "node:assert/strict";
import {
  computeLadderStep,
  DEFAULT_LADDER_WEIGHTS,
  detectsDirectAnswerRequest,
} from "../../../src/features/tutor-agent/assistance-ladder.ts";

test("no prior attempts resolves to step 0", () => {
  assert.equal(computeLadderStep([], DEFAULT_LADDER_WEIGHTS), 0);
});

test("unresolved attempts escalate one step at a time per weights.attemptsPerStep", () => {
  const weights = { attemptsPerStep: 1 };
  assert.equal(computeLadderStep([{ resolved: false, requestedDirectAnswer: false }], weights), 1);
  assert.equal(
    computeLadderStep(
      [
        { resolved: false, requestedDirectAnswer: false },
        { resolved: false, requestedDirectAnswer: false },
      ],
      weights,
    ),
    2,
  );
  assert.equal(
    computeLadderStep(
      [
        { resolved: false, requestedDirectAnswer: false },
        { resolved: false, requestedDirectAnswer: false },
        { resolved: false, requestedDirectAnswer: false },
      ],
      weights,
    ),
    3,
  );
});

test("escalation never skips steps and caps at 6", () => {
  const weights = { attemptsPerStep: 1 };
  const manyAttempts = Array.from({ length: 20 }, () => ({ resolved: false, requestedDirectAnswer: false }));
  assert.equal(computeLadderStep(manyAttempts, weights), 6);
});

test("any attempt with requestedDirectAnswer:true resolves to step 6 immediately, regardless of prior attempt count", () => {
  const weights = { attemptsPerStep: 5 };
  assert.equal(computeLadderStep([{ resolved: false, requestedDirectAnswer: true }], weights), 6);
  assert.equal(
    computeLadderStep(
      [
        { resolved: false, requestedDirectAnswer: false },
        { resolved: false, requestedDirectAnswer: true },
      ],
      weights,
    ),
    6,
  );
});

test("a resolved attempt passed for one question doesn't leak into a separately-scoped call for a different question", () => {
  // computeLadderStep only ever sees what the caller passes for the
  // specific exchange being computed -- a fresh, empty array for a
  // different question resolves to step 0 regardless of another
  // question's history.
  assert.equal(computeLadderStep([{ resolved: true, requestedDirectAnswer: false }], DEFAULT_LADDER_WEIGHTS), 0);
});

test("detectsDirectAnswerRequest recognizes an explicit escape-hatch phrase", () => {
  assert.equal(detectsDirectAnswerRequest("can you just explain it to me"), true);
  assert.equal(detectsDirectAnswerRequest("Just give me the answer already"), true);
  assert.equal(detectsDirectAnswerRequest("what is a binary search tree"), false);
});
