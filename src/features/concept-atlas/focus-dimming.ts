import type { Node, Edge } from "@xyflow/react";
import type { CourseGraph } from "@/types/graph/course-graph.ts";

/** Visual weight for a node/edge not connected to the currently-focused
 * concept/relationship -- de-emphasized, never hidden (spec FR-009). */
export const DIMMED_OPACITY = 0.2;

export type FocusTarget = { kind: "concept"; id: string } | { kind: "relationship"; id: string };

/** Which node/edge ids are "related" to the current focus target.
 * Concept focus: itself, its directly connected concepts, and the
 * relationships between them. Relationship focus: just its own two
 * endpoint concepts and itself. */
export function computeRelatedIds(
  graph: CourseGraph,
  target: FocusTarget,
): { nodeIds: Set<string>; edgeIds: Set<string> } {
  if (target.kind === "relationship") {
    const relationship = graph.relationships.find((r) => r.id === target.id);
    if (!relationship) {
      return { nodeIds: new Set(), edgeIds: new Set() };
    }
    return {
      nodeIds: new Set([relationship.fromConceptId, relationship.toConceptId]),
      edgeIds: new Set([relationship.id]),
    };
  }

  const nodeIds = new Set<string>([target.id]);
  const edgeIds = new Set<string>();
  for (const r of graph.relationships) {
    if (r.fromConceptId === target.id || r.toConceptId === target.id) {
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
  target: FocusTarget | null,
  graph: CourseGraph,
): { nodes: Node[]; edges: Edge[] } {
  if (!target) {
    return { nodes, edges };
  }
  const { nodeIds, edgeIds } = computeRelatedIds(graph, target);

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
