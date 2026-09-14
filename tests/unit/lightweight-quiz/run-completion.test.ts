import test from "node:test";
import assert from "node:assert/strict";
import { isExtractionRunFullyReviewed } from "../../../src/features/lightweight-quiz/run-completion.ts";

test("a run with proposed concepts remaining is not fully reviewed", () => {
  assert.equal(isExtractionRunFullyReviewed(2, 0), false);
});

test("a run with proposed units remaining is not fully reviewed", () => {
  assert.equal(isExtractionRunFullyReviewed(0, 1), false);
});

test("a run with zero proposed concepts and units is fully reviewed", () => {
  assert.equal(isExtractionRunFullyReviewed(0, 0), true);
});

test("a run with both proposed concepts and units remaining is not fully reviewed", () => {
  assert.equal(isExtractionRunFullyReviewed(3, 2), false);
});
