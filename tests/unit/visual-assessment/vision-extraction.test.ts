import test from "node:test";
import assert from "node:assert/strict";
import { needsConfirmation, LOW_CONFIDENCE_THRESHOLD } from "../../../src/features/visual-assessment/vision-extraction.ts";

test("a confidence at or above the threshold does not need confirmation", () => {
  assert.equal(needsConfirmation(LOW_CONFIDENCE_THRESHOLD), false);
  assert.equal(needsConfirmation(1.0), false);
});

test("a confidence below the threshold needs confirmation", () => {
  assert.equal(needsConfirmation(LOW_CONFIDENCE_THRESHOLD - 0.01), true);
  assert.equal(needsConfirmation(0), true);
});
