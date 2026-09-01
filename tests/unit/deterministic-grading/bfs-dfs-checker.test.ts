import test from "node:test";
import assert from "node:assert/strict";
import { checkTraversal } from "../../../src/features/deterministic-grading/checkers/bfs-dfs-checker.ts";
import type { GraphInput } from "../../../src/features/deterministic-grading/checkers/bfs-dfs-checker.ts";

// A -> B, A -> C, B -> D, C -> D (undirected for simplicity in most tests)
const DIAMOND: GraphInput = {
  nodeIds: ["A", "B", "C", "D"],
  edges: [
    ["A", "B"],
    ["A", "C"],
    ["B", "D"],
    ["C", "D"],
  ],
  directed: false,
};

test("BFS: a claimed order consistent with real distance layers validates, even under different tie-breaking", () => {
  const resultBC = checkTraversal({ graph: DIAMOND, algorithm: "bfs", startNodeId: "A", claimedOrder: ["A", "B", "C", "D"] });
  assert.equal(resultBC.outcome, "correct");

  const resultCB = checkTraversal({ graph: DIAMOND, algorithm: "bfs", startNodeId: "A", claimedOrder: ["A", "C", "B", "D"] });
  assert.equal(resultCB.outcome, "correct");
});

test("BFS: a claimed order violating a real distance constraint is incorrect with the exact divergence index", () => {
  // D (distance 2) placed before C (distance 1) -- violates the layer constraint.
  const result = checkTraversal({ graph: DIAMOND, algorithm: "bfs", startNodeId: "A", claimedOrder: ["A", "B", "D", "C"] });
  assert.equal(result.outcome, "incorrect");
  if (result.outcome === "incorrect") {
    assert.equal(result.firstDivergenceIndex, 2);
    assert.deepEqual(new Set(result.expectedAtThatIndex), new Set(["C"]));
  }
});

test("BFS: a startNodeId not present in the graph is invalid_input", () => {
  const result = checkTraversal({ graph: DIAMOND, algorithm: "bfs", startNodeId: "Z", claimedOrder: ["Z"] });
  assert.equal(result.outcome, "invalid_input");
});

test("BFS: a claimedOrder that isn't a permutation of the reachable nodes is invalid_input", () => {
  const missingNode = checkTraversal({ graph: DIAMOND, algorithm: "bfs", startNodeId: "A", claimedOrder: ["A", "B", "C"] });
  assert.equal(missingNode.outcome, "invalid_input");

  const extraNode = checkTraversal({
    graph: DIAMOND,
    algorithm: "bfs",
    startNodeId: "A",
    claimedOrder: ["A", "B", "C", "D", "E"],
  });
  assert.equal(extraNode.outcome, "invalid_input");
});

const LINE: GraphInput = {
  nodeIds: ["A", "B", "C"],
  edges: [
    ["A", "B"],
    ["B", "C"],
  ],
  directed: false,
};

test("DFS: a correct pre-order traversal validates", () => {
  const result = checkTraversal({ graph: LINE, algorithm: "dfs", startNodeId: "A", claimedOrder: ["A", "B", "C"] });
  assert.equal(result.outcome, "correct");
});

test("DFS: an order that isn't reachable via any real backtracking path is incorrect", () => {
  // A DAG where jumping straight from A to C skips the only path (A->B->C)
  const disconnectedJump: GraphInput = {
    nodeIds: ["A", "B", "C", "D"],
    edges: [
      ["A", "B"],
      ["A", "D"],
      ["B", "C"],
    ],
    directed: false,
  };
  // Valid DFS orders from A: A,B,C,D or A,D,B,C (D has no children) -- A,C,... is never valid since C is only reachable via B.
  const result = checkTraversal({
    graph: disconnectedJump,
    algorithm: "dfs",
    startNodeId: "A",
    claimedOrder: ["A", "C", "B", "D"],
  });
  assert.equal(result.outcome, "incorrect");
});

test("BFS/DFS: an edge-case single-node graph validates trivially", () => {
  const single: GraphInput = { nodeIds: ["A"], edges: [], directed: false };
  const result = checkTraversal({ graph: single, algorithm: "bfs", startNodeId: "A", claimedOrder: ["A"] });
  assert.equal(result.outcome, "correct");
});
