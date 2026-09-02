import test from "node:test";
import assert from "node:assert/strict";
import { needsConfirmation, LOW_CONFIDENCE_THRESHOLD, isImplausibleExtraction } from "../../../src/features/visual-assessment/vision-extraction.ts";

test("a confidence at or above the threshold does not need confirmation", () => {
  assert.equal(needsConfirmation(LOW_CONFIDENCE_THRESHOLD), false);
  assert.equal(needsConfirmation(1.0), false);
});

test("a confidence below the threshold needs confirmation", () => {
  assert.equal(needsConfirmation(LOW_CONFIDENCE_THRESHOLD - 0.01), true);
  assert.equal(needsConfirmation(0), true);
});

test("isImplausibleExtraction: an empty bfs-dfs order for a real 3-node graph is implausible regardless of confidence (found live, quickstart.md B5)", () => {
  const problemSetup = { graph: { nodeIds: ["a", "b", "c"] }, algorithm: "bfs", startNodeId: "a" };
  assert.equal(isImplausibleExtraction("bfs-dfs", { claimedOrder: [] }, problemSetup), true);
  assert.equal(isImplausibleExtraction("bfs-dfs", { claimedOrder: ["a", "b", "c"] }, problemSetup), false);
});

test("isImplausibleExtraction: a null claimedResultTree is plausible (a legitimate empty-tree result)", () => {
  assert.equal(isImplausibleExtraction("tree-insertion", { claimedResultTree: null }, { tree: null, insertValue: 5 }), false);
});

test("isImplausibleExtraction: a missing claimedResultTree is implausible", () => {
  assert.equal(isImplausibleExtraction("tree-insertion", {}, { tree: null, insertValue: 5 }), true);
});
