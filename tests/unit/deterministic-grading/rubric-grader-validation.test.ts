import test from "node:test";
import assert from "node:assert/strict";
import {
  computeIsLowConfidence,
  DEFAULT_RUBRIC_GRADING_CONFIDENCE_THRESHOLD,
  gradeTextResponse,
} from "../../../src/features/deterministic-grading/rubric-grader.ts";

test("a confidence at or above the threshold resolves isLowConfidence:false", () => {
  assert.equal(computeIsLowConfidence(DEFAULT_RUBRIC_GRADING_CONFIDENCE_THRESHOLD), false);
  assert.equal(computeIsLowConfidence(1.0), false);
});

test("a confidence below the threshold resolves isLowConfidence:true", () => {
  assert.equal(computeIsLowConfidence(DEFAULT_RUBRIC_GRADING_CONFIDENCE_THRESHOLD - 0.01), true);
  assert.equal(computeIsLowConfidence(0), true);
});

test("a failed model call resolves a real did_not_complete outcome, never an unhandled throw (hardening-pass finding)", async () => {
  const fakeOpenai = {
    responses: {
      create: async () => {
        throw new Error("simulated network failure");
      },
    },
  } as unknown as import("openai").default;

  const result = await gradeTextResponse(fakeOpenai, "some response", {
    requiredIdeas: [],
    acceptableAlternatives: [],
    knownMisconceptions: [],
    partialCreditCriteria: [],
  });

  assert.equal(result.outcome, "did_not_complete");
  if (result.outcome === "did_not_complete") {
    assert.equal(result.reason, "model_call_failed");
    assert.match(result.detail, /simulated network failure/);
  }
});
