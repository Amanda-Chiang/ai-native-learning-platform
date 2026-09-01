import test from "node:test";
import assert from "node:assert/strict";
import {
  computeIsLowConfidence,
  DEFAULT_RUBRIC_GRADING_CONFIDENCE_THRESHOLD,
} from "../../../src/features/deterministic-grading/rubric-grader.ts";

test("a confidence at or above the threshold resolves isLowConfidence:false", () => {
  assert.equal(computeIsLowConfidence(DEFAULT_RUBRIC_GRADING_CONFIDENCE_THRESHOLD), false);
  assert.equal(computeIsLowConfidence(1.0), false);
});

test("a confidence below the threshold resolves isLowConfidence:true", () => {
  assert.equal(computeIsLowConfidence(DEFAULT_RUBRIC_GRADING_CONFIDENCE_THRESHOLD - 0.01), true);
  assert.equal(computeIsLowConfidence(0), true);
});
