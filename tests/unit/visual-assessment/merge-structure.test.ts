import test from "node:test";
import assert from "node:assert/strict";
import { mergeStructure } from "../../../src/features/visual-assessment/merge-structure.ts";
import { extractProblemSetup } from "../../../src/features/visual-assessment/problem-setup.ts";

test("merging a problem setup with confirmed claim fields reproduces a real, full checkerInput", () => {
  const fullCheckerInput = {
    graph: { nodeIds: ["a", "b"], edges: [["a", "b"]], directed: false },
    algorithm: "bfs",
    startNodeId: "a",
    claimedOrder: ["a", "b"],
  };
  const problemSetup = extractProblemSetup(fullCheckerInput);
  const confirmedClaimFields = { claimedOrder: ["a", "b"] };
  const merged = mergeStructure(problemSetup, confirmedClaimFields);
  assert.deepEqual(merged, fullCheckerInput);
});

test("a corrected claim field overrides the problem setup's own keys on overlap", () => {
  const problemSetup = { tree: { value: 1, left: null, right: null }, insertValue: 5 };
  const merged = mergeStructure(problemSetup, { insertValue: 7 });
  assert.equal(merged.insertValue, 7);
});
