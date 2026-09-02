import type { GraphInput } from "../deterministic-grading/checkers/bfs-dfs-checker.ts";
import type { WeightedGraphInput } from "../deterministic-grading/checkers/shortest-path-checker.ts";

export type LayoutNode = { id: string; x: number; y: number; label: string };
export type LayoutEdge = { sourceId: string; targetId: string };
export type GraphLayout = { nodes: LayoutNode[]; edges: LayoutEdge[] };

/**
 * Simple deterministic circular placement -- no elkjs (research.md
 * "Custom, small layout functions"). These are bounded, dozens-of-
 * nodes question graphs, not the course concept graph elkjs already
 * lays out; reusing elkjs here would also cross Constitution Principle
 * I's separation between canonical course-graph rendering and this
 * feature's own ephemeral, one-question view state.
 */
export function layoutGraph(graph: GraphInput | WeightedGraphInput): GraphLayout {
  const radius = 200;
  const centerX = 250;
  const centerY = 250;
  const nodes: LayoutNode[] = graph.nodeIds.map((id, i) => {
    const angle = (2 * Math.PI * i) / Math.max(1, graph.nodeIds.length);
    return {
      id,
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
      label: id,
    };
  });

  const edges: LayoutEdge[] = graph.edges.map((edge) => ({ sourceId: edge[0], targetId: edge[1] }));

  return { nodes, edges };
}
