import type { Node, Edge } from "@xyflow/react";
import type { CourseGraph } from "@/types/graph/course-graph.ts";

/** Visual weight for a node/edge not connected to the currently-focused
 * concept -- de-emphasized, never hidden (spec FR-009). */
export const DIMMED_OPACITY = 0.2;

/** Which node/edge ids are "related" to a focused concept -- itself, its
 * directly connected concepts, and the relationships between them. */
export function computeRelatedIds(
  graph: CourseGraph,
  focusedConceptId: string,
): { nodeIds: Set<string>; edgeIds: Set<string> } {
  const nodeIds = new Set<string>([focusedConceptId]);
  const edgeIds = new Set<string>();
  for (const r of graph.relationships) {
    if (r.fromConceptId === focusedConceptId || r.toConceptId === focusedConceptId) {
      edgeIds.add(r.id);
      nodeIds.add(r.fromConceptId);
      nodeIds.add(r.toConceptId);
    }
  }
  return { nodeIds, edgeIds };
}

export function applyFocusDimming(
  nodes: Node[],
  edges: Edge[],
  focusedConceptId: string | null,
  graph: CourseGraph,
): { nodes: Node[]; edges: Edge[] } {
  if (!focusedConceptId) {
    return { nodes, edges };
  }
  const { nodeIds, edgeIds } = computeRelatedIds(graph, focusedConceptId);

  return {
    nodes: nodes.map((node) => {
      if (node.type !== "conceptNode" || nodeIds.has(node.id)) {
        return node;
      }
      return { ...node, style: { ...node.style, opacity: DIMMED_OPACITY } };
    }),
    edges: edges.map((edge) => {
      if (edgeIds.has(edge.id)) {
        return edge;
      }
      return { ...edge, style: { ...edge.style, opacity: DIMMED_OPACITY } };
    }),
  };
}
