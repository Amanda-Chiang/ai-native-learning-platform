import test from "node:test";
import assert from "node:assert/strict";
import { checkTopologicalSort } from "../../../src/features/deterministic-grading/checkers/topological-sort-checker.ts";
import type { GraphInput } from "../../../src/features/deterministic-grading/checkers/bfs-dfs-checker.ts";

// A -> B -> D, A -> C -> D (a DAG with two valid topo orders: A,B,C,D and A,C,B,D)
const DAG: GraphInput = {
  nodeIds: ["A", "B", "C", "D"],
  edges: [
    ["A", "B"],
    ["A", "C"],
    ["B", "D"],
    ["C", "D"],
  ],
  directed: true,
};

test("any claimed order respecting every edge's precedence validates, not just one canonical order", () => {
  assert.equal(checkTopologicalSort({ graph: DAG, claimedOrder: ["A", "B", "C", "D"] }).outcome, "correct");
  assert.equal(checkTopologicalSort({ graph: DAG, claimedOrder: ["A", "C", "B", "D"] }).outcome, "correct");
});

test("a claimed order violating an edge's precedence is incorrect with that specific violated edge", () => {
  const result = checkTopologicalSort({ graph: DAG, claimedOrder: ["A", "D", "B", "C"] });
  assert.equal(result.outcome, "incorrect");
  if (result.outcome === "incorrect") {
    assert.deepEqual(result.violatedEdge, ["B", "D"]);
  }
});

test("a cyclic input graph is invalid_input, never graded as an incorrect answer", () => {
  const cyclic: GraphInput = {
    nodeIds: ["A", "B", "C"],
    edges: [
      ["A", "B"],
      ["B", "C"],
      ["C", "A"],
    ],
    directed: true,
  };
  const result = checkTopologicalSort({ graph: cyclic, claimedOrder: ["A", "B", "C"] });
  assert.equal(result.outcome, "invalid_input");
});

test("a claimedOrder that isn't a permutation of all nodes is invalid_input", () => {
  const result = checkTopologicalSort({ graph: DAG, claimedOrder: ["A", "B", "C"] });
  assert.equal(result.outcome, "invalid_input");
});
