/**
 * Pure BFS/DFS traversal checker (data-model.md). Validates a claimed
 * traversal order against the algorithm's real structural constraints,
 * not exact-match against one arbitrarily-chosen reference order --
 * both BFS and DFS genuinely admit multiple valid orders under
 * different neighbor tie-breaking.
 */

export type GraphInput = {
  nodeIds: string[];
  edges: [string, string][];
  directed: boolean;
};

export type TraversalCheckInput = {
  graph: GraphInput;
  algorithm: "bfs" | "dfs";
  startNodeId: string;
  claimedOrder: string[];
};

export type TraversalCheckResult =
  | { outcome: "correct" }
  | { outcome: "incorrect"; firstDivergenceIndex: number; expectedAtThatIndex: string[] }
  | { outcome: "invalid_input"; reason: string };

function buildAdjacency(graph: GraphInput): Map<string, string[]> {
  const adjacency = new Map<string, string[]>(graph.nodeIds.map((id) => [id, []]));
  for (const [a, b] of graph.edges) {
    adjacency.get(a)?.push(b);
    if (!graph.directed) {
      adjacency.get(b)?.push(a);
    }
  }
  return adjacency;
}

function computeDistances(adjacency: Map<string, string[]>, startNodeId: string): Map<string, number> {
  const distances = new Map<string, number>([[startNodeId, 0]]);
  const queue = [startNodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDistance = distances.get(current)!;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (!distances.has(neighbor)) {
        distances.set(neighbor, currentDistance + 1);
        queue.push(neighbor);
      }
    }
  }
  return distances;
}

function checkPermutationOfReachable(
  claimedOrder: string[],
  reachable: Set<string>,
): { valid: true } | { valid: false; reason: string } {
  if (claimedOrder.length !== reachable.size) {
    return { valid: false, reason: `Expected ${reachable.size} reachable nodes, got ${claimedOrder.length}.` };
  }
  const seen = new Set<string>();
  for (const node of claimedOrder) {
    if (!reachable.has(node)) {
      return { valid: false, reason: `"${node}" is not reachable from the start node.` };
    }
    if (seen.has(node)) {
      return { valid: false, reason: `"${node}" appears more than once in claimedOrder.` };
    }
    seen.add(node);
  }
  return { valid: true };
}

function checkBfsOrder(
  distances: Map<string, number>,
  claimedOrder: string[],
): TraversalCheckResult {
  // At each step, the next node's distance must equal the minimum
  // distance among all nodes not yet placed -- BFS can never revisit an
  // earlier layer once a later one has begun, so every same-layer node
  // must be exhausted before any node from the next layer appears
  // (data-model.md).
  for (let i = 1; i < claimedOrder.length; i++) {
    const stillRemaining = claimedOrder.slice(i);
    const minRemainingDistance = Math.min(...stillRemaining.map((n) => distances.get(n)!));
    if (distances.get(claimedOrder[i])! !== minRemainingDistance) {
      const expected = stillRemaining.filter((n) => distances.get(n) === minRemainingDistance);
      return { outcome: "incorrect", firstDivergenceIndex: i, expectedAtThatIndex: expected };
    }
  }
  return { outcome: "correct" };
}

function checkDfsOrder(
  adjacency: Map<string, string[]>,
  claimedOrder: string[],
): TraversalCheckResult {
  const visited = new Set<string>([claimedOrder[0]]);
  const stack: string[] = [claimedOrder[0]];

  for (let i = 1; i < claimedOrder.length; i++) {
    const node = claimedOrder[i];

    // Backtrack past any ancestor that has no path forward to `node`.
    while (stack.length > 0 && !(adjacency.get(stack[stack.length - 1]) ?? []).includes(node)) {
      stack.pop();
    }

    const top = stack[stack.length - 1];
    if (top === undefined || !(adjacency.get(top) ?? []).includes(node)) {
      // Report the unvisited neighbors of the deepest still-open
      // ancestor with any unvisited neighbor at all, as "what could
      // legitimately have come next" from this traversal position.
      const reopened = [...claimedOrder.slice(0, i)];
      let expected: string[] = [];
      for (let j = reopened.length - 1; j >= 0; j--) {
        const candidates = (adjacency.get(reopened[j]) ?? []).filter((n) => !visited.has(n));
        if (candidates.length > 0) {
          expected = candidates;
          break;
        }
      }
      return { outcome: "incorrect", firstDivergenceIndex: i, expectedAtThatIndex: expected };
    }

    visited.add(node);
    stack.push(node);
  }

  return { outcome: "correct" };
}

export function checkTraversal(input: TraversalCheckInput): TraversalCheckResult {
  const { graph, algorithm, startNodeId, claimedOrder } = input;

  if (!graph.nodeIds.includes(startNodeId)) {
    return { outcome: "invalid_input", reason: `startNodeId "${startNodeId}" is not in the graph.` };
  }

  const adjacency = buildAdjacency(graph);
  const distances = computeDistances(adjacency, startNodeId);
  const reachable = new Set(distances.keys());

  const permutationCheck = checkPermutationOfReachable(claimedOrder, reachable);
  if (!permutationCheck.valid) {
    return { outcome: "invalid_input", reason: permutationCheck.reason };
  }

  if (claimedOrder[0] !== startNodeId) {
    return { outcome: "incorrect", firstDivergenceIndex: 0, expectedAtThatIndex: [startNodeId] };
  }

  return algorithm === "bfs" ? checkBfsOrder(distances, claimedOrder) : checkDfsOrder(adjacency, claimedOrder);
}
