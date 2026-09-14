import test from "node:test";
import assert from "node:assert/strict";
import { gradeMultipleChoiceAnswer } from "../../../src/features/lightweight-quiz/grade-mcq-answer.ts";

test("selecting the correct option grades as correct", () => {
  const result = gradeMultipleChoiceAnswer({ options: ["a", "b", "c", "d"], correctOptionIndex: 2 }, 2);
  assert.deepEqual(result, { outcome: "correct", selectedIndex: 2, correctOptionIndex: 2 });
});

test("selecting a wrong option grades as incorrect", () => {
  const result = gradeMultipleChoiceAnswer({ options: ["a", "b", "c", "d"], correctOptionIndex: 2 }, 0);
  assert.deepEqual(result, { outcome: "incorrect", selectedIndex: 0, correctOptionIndex: 2 });
});

test("a rubric missing correctOptionIndex is a real error, not a silent incorrect", () => {
  const result = gradeMultipleChoiceAnswer({ options: ["a", "b", "c", "d"] }, 0);
  assert.equal(result.outcome, "incorrect");
  assert.equal(result.correctOptionIndex, -1);
  assert.ok("error" in result && result.error.length > 0);
});
