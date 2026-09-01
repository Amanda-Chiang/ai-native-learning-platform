import test from "node:test";
import assert from "node:assert/strict";
import { checkShortestPath } from "../../../src/features/deterministic-grading/checkers/shortest-path-checker.ts";
import type { WeightedGraphInput } from "../../../src/features/deterministic-grading/checkers/shortest-path-checker.ts";

// A -(1)-> B -(1)-> D  and  A -(1)-> C -(1)-> D : two equally-short paths, length 2.
const GRAPH: WeightedGraphInput = {
  nodeIds: ["A", "B", "C", "D"],
  edges: [
    ["A", "B", 1],
    ["A", "C", 1],
    ["B", "D", 1],
    ["C", "D", 1],
  ],
  directed: true,
};

test("a claimed path that's real and actually shortest validates, even when another equally-short path exists", () => {
  const viaB = checkShortestPath({ graph: GRAPH, sourceNodeId: "A", targetNodeId: "D", claimedPath: ["A", "B", "D"], claimedTotalDistance: 2 });
  assert.equal(viaB.outcome, "correct");

  const viaC = checkShortestPath({ graph: GRAPH, sourceNodeId: "A", targetNodeId: "D", claimedPath: ["A", "C", "D"], claimedTotalDistance: 2 });
  assert.equal(viaC.outcome, "correct");
});

test("a claimed path with the wrong total distance is incorrect with the real shortest distance", () => {
  const result = checkShortestPath({
    graph: GRAPH,
    sourceNodeId: "A",
    targetNodeId: "D",
    claimedPath: ["A", "B", "D"],
    claimedTotalDistance: 5,
  });
  assert.equal(result.outcome, "incorrect");
  if (result.outcome === "incorrect") {
    assert.equal(result.actualShortestDistance, 2);
  }
});

test("a claimed path that isn't actually connected is incorrect and flagged as an invalid path", () => {
  const result = checkShortestPath({
    graph: GRAPH,
    sourceNodeId: "A",
    targetNodeId: "D",
    claimedPath: ["A", "D"],
    claimedTotalDistance: 1,
  });
  assert.equal(result.outcome, "incorrect");
  if (result.outcome === "incorrect") {
    assert.equal(result.pathIsValid, false);
  }
});

test("an unreachable target is invalid_input", () => {
  const disconnected: WeightedGraphInput = { nodeIds: ["A", "B"], edges: [], directed: true };
  const result = checkShortestPath({
    graph: disconnected,
    sourceNodeId: "A",
    targetNodeId: "B",
    claimedPath: [],
    claimedTotalDistance: 0,
  });
  assert.equal(result.outcome, "invalid_input");
});

test("a nonexistent source/target node is invalid_input", () => {
  const result = checkShortestPath({
    graph: GRAPH,
    sourceNodeId: "Z",
    targetNodeId: "D",
    claimedPath: [],
    claimedTotalDistance: 0,
  });
  assert.equal(result.outcome, "invalid_input");
});
