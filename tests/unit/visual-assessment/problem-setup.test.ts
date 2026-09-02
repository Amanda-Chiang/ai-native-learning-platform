import test from "node:test";
import assert from "node:assert/strict";
import { extractProblemSetup } from "../../../src/features/visual-assessment/problem-setup.ts";

test("a real bfs-dfs checkerInput has claimedOrder stripped, everything else kept", () => {
  const checkerInput = {
    graph: { nodeIds: ["a", "b"], edges: [["a", "b"]], directed: false },
    algorithm: "bfs",
    startNodeId: "a",
    claimedOrder: ["a", "b"],
  };
  const setup = extractProblemSetup(checkerInput);
  assert.deepEqual(setup, {
    graph: { nodeIds: ["a", "b"], edges: [["a", "b"]], directed: false },
    algorithm: "bfs",
    startNodeId: "a",
  });
  assert.ok(!("claimedOrder" in setup));
});

test("a real shortest-path checkerInput has both claimedPath and claimedTotalDistance stripped", () => {
  const checkerInput = {
    graph: { nodeIds: ["a", "b"], edges: [["a", "b", 1]], directed: false },
    sourceNodeId: "a",
    targetNodeId: "b",
    claimedPath: ["a", "b"],
    claimedTotalDistance: 1,
  };
  const setup = extractProblemSetup(checkerInput);
  assert.deepEqual(setup, {
    graph: { nodeIds: ["a", "b"], edges: [["a", "b", 1]], directed: false },
    sourceNodeId: "a",
    targetNodeId: "b",
  });
  assert.ok(!("claimedPath" in setup));
  assert.ok(!("claimedTotalDistance" in setup));
});

test("a checkerInput with no claimed fields is returned unchanged", () => {
  const checkerInput = { tree: null, insertValue: 5 };
  assert.deepEqual(extractProblemSetup(checkerInput), checkerInput);
});
