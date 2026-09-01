import type { GraphInput } from "./bfs-dfs-checker.ts";

/**
 * Pure topological-sort checker (data-model.md). Validates that the
 * claimed order is *a* valid topological order (respects every edge's
 * precedence constraint), not exact-match against one canonical order
 * -- a DAG generally has many valid topological orders. A cyclic input
 * graph is reported as invalid_input ("no valid order exists"), never
 * graded as an incorrect answer -- the question itself would be
 * malformed, not the student's response.
 */

export type TopoSortCheckInput = { graph: GraphInput; claimedOrder: string[] };

export type TopoSortCheckResult =
  | { outcome: "correct" }
  | { outcome: "incorrect"; violatedEdge: [string, string] }
  | { outcome: "invalid_input"; reason: string };

function hasCycle(graph: GraphInput): boolean {
  const adjacency = new Map<string, string[]>(graph.nodeIds.map((id) => [id, []]));
  for (const [a, b] of graph.edges) {
    adjacency.get(a)?.push(b);
  }
  const state = new Map<string, "visiting" | "done">();

  function visit(node: string): boolean {
    if (state.get(node) === "done") return false;
    if (state.get(node) === "visiting") return true;
    state.set(node, "visiting");
    for (const next of adjacency.get(node) ?? []) {
      if (visit(next)) return true;
    }
    state.set(node, "done");
    return false;
  }

  return graph.nodeIds.some((node) => !state.has(node) && visit(node));
}

export function checkTopologicalSort(input: TopoSortCheckInput): TopoSortCheckResult {
  const { graph, claimedOrder } = input;

  if (hasCycle(graph)) {
    return { outcome: "invalid_input", reason: "The graph has a cycle -- no valid topological order exists." };
  }

  const nodeSet = new Set(graph.nodeIds);
  if (claimedOrder.length !== graph.nodeIds.length || !claimedOrder.every((n) => nodeSet.has(n))) {
    return { outcome: "invalid_input", reason: "claimedOrder is not a permutation of all nodes in the graph." };
  }
  if (new Set(claimedOrder).size !== claimedOrder.length) {
    return { outcome: "invalid_input", reason: "claimedOrder contains a duplicate node." };
  }

  const position = new Map(claimedOrder.map((node, i) => [node, i]));
  for (const [source, target] of graph.edges) {
    if (position.get(source)! > position.get(target)!) {
      return { outcome: "incorrect", violatedEdge: [source, target] };
    }
  }

  return { outcome: "correct" };
}
