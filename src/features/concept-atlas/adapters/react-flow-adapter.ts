import type { Node, Edge } from "@xyflow/react";
import ELK from "elkjs";
import type { CourseGraph } from "@/types/graph/course-graph.ts";

/**
 * This module is the ONLY place in the codebase where a CourseGraph
 * concept/relationship gets a coordinate attached (Constitution
 * Principle I) -- the DTO in src/types/graph/ never carries one.
 */

const UNIT_HEADER_HEIGHT = 40;
const CONCEPT_NODE_WIDTH = 160;
const CONCEPT_NODE_HEIGHT = 48;
const CONCEPT_GAP = 24;
const UNIT_GAP = 80;

/**
 * Computes a two-level layout with ELK: units are laid out relative to
 * each other, and each unit's concepts are laid out within it, using
 * ELK's nested-children support (hierarchyHandling: INCLUDE_CHILDREN) so
 * both levels are solved together rather than as two independent passes
 * that could disagree with each other.
 */
export async function computeElkLayout(
  graph: CourseGraph,
): Promise<Map<string, { x: number; y: number }>> {
  const elk = new ELK();

  const elkGraph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.spacing.nodeNode": String(UNIT_GAP),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(UNIT_GAP),
    },
    children: graph.units.map((unit) => ({
      id: unit.id,
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.spacing.nodeNode": String(CONCEPT_GAP),
        "elk.padding": `[top=${UNIT_HEADER_HEIGHT},left=16,right=16,bottom=16]`,
      },
      children: unit.conceptIds.map((conceptId) => ({
        id: conceptId,
        width: CONCEPT_NODE_WIDTH,
        height: CONCEPT_NODE_HEIGHT,
      })),
      edges: graph.relationships
        .filter((r) => unit.conceptIds.includes(r.fromConceptId) && unit.conceptIds.includes(r.toConceptId))
        .map((r) => ({ id: r.id, sources: [r.fromConceptId], targets: [r.toConceptId] })),
    })),
    edges: graph.relationships
      .filter((r) => {
        const fromUnit = graph.units.find((u) => u.conceptIds.includes(r.fromConceptId));
        const toUnit = graph.units.find((u) => u.conceptIds.includes(r.toConceptId));
        return fromUnit && toUnit && fromUnit.id !== toUnit.id;
      })
      .map((r) => ({ id: r.id, sources: [r.fromConceptId], targets: [r.toConceptId] })),
  };

  const layouted = await elk.layout(elkGraph);
  const positions = new Map<string, { x: number; y: number }>();

  for (const unitNode of layouted.children ?? []) {
    positions.set(unitNode.id, { x: unitNode.x ?? 0, y: unitNode.y ?? 0 });
    for (const conceptNode of unitNode.children ?? []) {
      // Concept positions from ELK are relative to their parent unit --
      // React Flow's parentId/extent mechanism expects the same
      // convention, so no re-basing is needed here.
      positions.set(conceptNode.id, { x: conceptNode.x ?? 0, y: conceptNode.y ?? 0 });
    }
  }

  return positions;
}

/**
 * Pure conversion: CourseGraph + already-computed positions -> React
 * Flow nodes/edges. Deliberately separate from computeElkLayout so this
 * half is unit-testable without a browser or worker (tests/unit/concept-atlas/react-flow-adapter.test.ts).
 */
export function courseGraphToReactFlowElements(
  graph: CourseGraph,
  positions: Map<string, { x: number; y: number }>,
  collapsedUnitIds: Set<string>,
): { nodes: Node[]; edges: Edge[] } {
  const conceptToUnit = new Map<string, string>();
  for (const unit of graph.units) {
    for (const conceptId of unit.conceptIds) {
      conceptToUnit.set(conceptId, unit.id);
    }
  }

  const unitNodes: Node[] = graph.units.map((unit) => {
    const pos = positions.get(unit.id) ?? { x: 0, y: 0 };
    return {
      id: unit.id,
      type: "unitGroup",
      position: pos,
      data: { title: unit.title, collapsed: collapsedUnitIds.has(unit.id) },
      style: { width: undefined, height: undefined },
    };
  });

  const conceptNodes: Node[] = graph.concepts.map((concept) => {
    const unitId = conceptToUnit.get(concept.id);
    const pos = positions.get(concept.id) ?? { x: 0, y: 0 };
    const inCollapsedUnit = unitId !== undefined && collapsedUnitIds.has(unitId);
    return {
      id: concept.id,
      type: "conceptNode",
      position: pos,
      parentId: unitId,
      extent: unitId ? ("parent" as const) : undefined,
      hidden: inCollapsedUnit,
      data: {
        canonicalLabel: concept.canonicalLabel,
        aliases: concept.aliases,
        masteryState: concept.masteryState,
      },
    };
  });

  const edges: Edge[] = graph.relationships.map((relationship) => ({
    id: relationship.id,
    source: relationship.fromConceptId,
    target: relationship.toConceptId,
    type: "relationshipEdge",
    label: relationship.type,
    data: {
      type: relationship.type,
      learnerState: relationship.learnerState,
      crossUnit: relationship.crossUnit,
    },
  }));

  return { nodes: [...unitNodes, ...conceptNodes], edges };
}
