import test from "node:test";
import assert from "node:assert/strict";
import { validateHasTarget } from "../../../src/features/learner-graph-evidence/commit-evidence-validation.ts";

test("rejects input targeting zero concepts and zero edges", () => {
  const result = validateHasTarget([], []);
  assert.equal(result.valid, false);
});

test("accepts input targeting at least one concept", () => {
  assert.equal(validateHasTarget(["concept-1"], []).valid, true);
});

test("accepts input targeting at least one edge", () => {
  assert.equal(validateHasTarget([], ["edge-1"]).valid, true);
});
