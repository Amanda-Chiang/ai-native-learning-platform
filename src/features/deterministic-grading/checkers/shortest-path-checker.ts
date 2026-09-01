/**
 * Pure bounded shortest-path checker (data-model.md). Validates that
 * the claimed path is real (every consecutive pair is a real edge) and
 * that its summed weight equals the graph's real shortest distance --
 * a claimed path can differ from another equally-short path and still
 * be correct, so this is never an exact-match-against-one-path check.
 */

export type WeightedGraphInput = {
  nodeIds: string[];
  edges: [string, string, number][];
  directed: boolean;
};

export type ShortestPathCheckInput = {
  graph: WeightedGraphInput;
  sourceNodeId: string;
  targetNodeId: string;
  claimedPath: string[];
  claimedTotalDistance: number;
};

export type ShortestPathCheckResult =
  | { outcome: "correct" }
  | { outcome: "incorrect"; actualShortestDistance: number; pathIsValid: boolean }
  | { outcome: "invalid_input"; reason: string };

function buildWeightedAdjacency(graph: WeightedGraphInput): Map<string, Map<string, number>> {
  const adjacency = new Map<string, Map<string, number>>(graph.nodeIds.map((id) => [id, new Map()]));
  for (const [a, b, weight] of graph.edges) {
    adjacency.get(a)?.set(b, weight);
    if (!graph.directed) {
      adjacency.get(b)?.set(a, weight);
    }
  }
  return adjacency;
}

function dijkstra(adjacency: Map<string, Map<string, number>>, sourceNodeId: string): Map<string, number> {
  const distances = new Map<string, number>([[sourceNodeId, 0]]);
  const visited = new Set<string>();

  for (;;) {
    let current: string | null = null;
    let currentDistance = Infinity;
    for (const [node, distance] of distances) {
      if (!visited.has(node) && distance < currentDistance) {
        current = node;
        currentDistance = distance;
      }
    }
    if (current === null) break;
    visited.add(current);

    for (const [neighbor, weight] of adjacency.get(current) ?? []) {
      const candidate = currentDistance + weight;
      if (candidate < (distances.get(neighbor) ?? Infinity)) {
        distances.set(neighbor, candidate);
      }
    }
  }

  return distances;
}

function isRealPath(adjacency: Map<string, Map<string, number>>, path: string[]): boolean {
  if (path.length === 0) return false;
  for (let i = 0; i < path.length - 1; i++) {
    if (!adjacency.get(path[i])?.has(path[i + 1])) return false;
  }
  return true;
}

export function checkShortestPath(input: ShortestPathCheckInput): ShortestPathCheckResult {
  const { graph, sourceNodeId, targetNodeId, claimedPath, claimedTotalDistance } = input;

  if (!graph.nodeIds.includes(sourceNodeId) || !graph.nodeIds.includes(targetNodeId)) {
    return { outcome: "invalid_input", reason: "sourceNodeId/targetNodeId is not in the graph." };
  }

  const adjacency = buildWeightedAdjacency(graph);
  const distances = dijkstra(adjacency, sourceNodeId);
  const actualShortestDistance = distances.get(targetNodeId);

  if (actualShortestDistance === undefined) {
    return { outcome: "invalid_input", reason: `"${targetNodeId}" is not reachable from "${sourceNodeId}".` };
  }

  const pathIsValid = isRealPath(adjacency, claimedPath) && claimedPath[0] === sourceNodeId && claimedPath[claimedPath.length - 1] === targetNodeId;

  if (pathIsValid && claimedTotalDistance === actualShortestDistance) {
    return { outcome: "correct" };
  }

  return { outcome: "incorrect", actualShortestDistance, pathIsValid };
}
