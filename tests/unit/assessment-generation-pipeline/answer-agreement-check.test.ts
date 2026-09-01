import test from "node:test";
import assert from "node:assert/strict";
import { checkAnswerAgreementFromChecker } from "../../../src/features/assessment-generation-pipeline/answer-agreement-check.ts";

test("a candidate's stated answer matching the independent checker's result passes", () => {
  const result = checkAnswerAgreementFromChecker({ outcome: "correct" });
  assert.equal(result.passed, true);
});

test("a mismatch fails with the real checker result shown, not just \"disagreement\"", () => {
  const checkerResult = { outcome: "incorrect", firstDivergenceIndex: 2, expectedAtThatIndex: ["b", "c"] };
  const result = checkAnswerAgreementFromChecker(checkerResult);
  assert.equal(result.passed, false);
  assert.match(result.detail, /incorrect/);
  assert.match(result.detail, /firstDivergenceIndex/);
});
