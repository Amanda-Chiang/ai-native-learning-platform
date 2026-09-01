import type { Node, Edge } from "@xyflow/react";
// elkjs's default entry point (`elkjs`) auto-detects its environment and
// tries to `require('web-worker')` when it thinks it's in a worker-capable
// context -- that require is unresolvable in Next.js's client webpack
// bundle (no such dependency is installed, nor should it be). The
// `elk.bundled.js` build is elkjs's own documented browser-safe entry
// point: it runs synchronously on the main thread instead, which is fine
// here since layout for a 20-40 concept graph is fast enough not to
// need worker offloading in practice.
import ELK from "elkjs/lib/elk.bundled.js";
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

export type LayoutPosition = { x: number; y: number; width?: number; height?: number };

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
  const positions = new Map<string, LayoutPosition>();

  for (const unitNode of layouted.children ?? []) {
    // elkjs's TS types mark x/y/width/height optional (they're unset on
    // the *input* graph), but elk.layout() always fills them in on the
    // *output* graph for every node it laid out -- so `?? 0` here would
    // silently mask a real bug (ELK failing to place a node) as a
    // plausible-looking coordinate, indistinguishable from a real one.
    // Per the no-silent-placeholders rule: if this ever fires, that's a
    // genuine layout failure and must be loud, not quietly zeroed.
    if (unitNode.x === undefined || unitNode.y === undefined) {
      throw new Error(`ELK did not compute a position for unit "${unitNode.id}"`);
    }
    // ELK auto-sizes a container node (no explicit width/height was set
    // on units above) to fit its children plus the configured padding --
    // that computed size is what makes the unit render as a bounded
    // region rather than an arbitrary box (spec FR-001).
    positions.set(unitNode.id, {
      x: unitNode.x,
      y: unitNode.y,
      width: unitNode.width ?? CONCEPT_NODE_WIDTH + 32,
      height: unitNode.height ?? CONCEPT_NODE_HEIGHT + UNIT_HEADER_HEIGHT + 32,
    });
    for (const conceptNode of unitNode.children ?? []) {
      if (conceptNode.x === undefined || conceptNode.y === undefined) {
        throw new Error(`ELK did not compute a position for concept "${conceptNode.id}"`);
      }
      // Concept positions from ELK are relative to their parent unit --
      // React Flow's parentId/extent mechanism expects the same
      // convention, so no re-basing is needed here.
      positions.set(conceptNode.id, { x: conceptNode.x, y: conceptNode.y });
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
  positions: Map<string, LayoutPosition>,
  collapsedUnitIds: Set<string>,
): { nodes: Node[]; edges: Edge[] } {
  const conceptToUnit = new Map<string, string>();
  for (const unit of graph.units) {
    for (const conceptId of unit.conceptIds) {
      conceptToUnit.set(conceptId, unit.id);
    }
  }

  const unitNodes: Node[] = graph.units.map((unit) => {
    const pos = positions.get(unit.id);
    if (!pos) {
      // Every unit passed to computeElkLayout gets a position back --
      // reaching this means positions came from somewhere other than
      // that function (or a mismatched graph/positions pair). Silently
      // falling back to (0, 0) would stack this unit invisibly on top
      // of whatever else sits at the origin, indistinguishable from a
      // real layout; loud and explicit instead, per no-silent-placeholders.
      throw new Error(`No layout position found for unit "${unit.id}"`);
    }
    const isCollapsed = collapsedUnitIds.has(unit.id);
    const width = pos.width ?? CONCEPT_NODE_WIDTH + 32;
    // A collapsed unit shrinks to just its header -- hiding the concept
    // nodes inside (below) without also shrinking the box left an empty,
    // confusing blank region rather than an actual "collapsed" look.
    const height = isCollapsed
      ? UNIT_HEADER_HEIGHT
      : (pos.height ?? CONCEPT_NODE_HEIGHT + UNIT_HEADER_HEIGHT + 32);
    return {
      id: unit.id,
      type: "unitGroup",
      position: { x: pos.x, y: pos.y },
      data: { title: unit.title, collapsed: isCollapsed },
      // Both style (visual CSS sizing) AND top-level width/height (what
      // fitView's bounds calculation reads) must be set -- setting only
      // style left fitView computing bounds from unmeasured, effectively
      // zero-size nodes on its first pass, which is what caused clipped
      // unit regions in the initial screenshot attempt.
      style: { width, height },
      // An edge's path can legitimately cross directly over a unit's
      // header (found while testing unit-collapse clicks: a
      // cross-unit edge routed straight through "Dynamic Programming"'s
      // header and swallowed the click even after narrowing the edge's
      // interaction hitbox). A node's own zIndex always wins over an
      // edge's default stacking in React Flow, so this guarantees the
      // header stays clickable regardless of what routes beneath it.
      zIndex: 10,
      width,
      height,
    };
  });

  // computeElkLayout only assigns a position to concepts reachable from
  // some unit's conceptIds -- a concept that isn't listed under any unit
  // (a real, not-yet-forbidden CourseGraph shape) has no ELK position at
  // all. Silently placing it at (0, 0) would render it stacked invisibly
  // under whatever else sits there, indistinguishable from a real,
  // intentional position. Per no-silent-placeholders: surface it loudly
  // and drop it from the render rather than fabricate a coordinate --
  // an orphaned concept is a data problem for ingestion/reconciliation
  // to fix, not something this renderer should paper over.
  const conceptNodes: Node[] = graph.concepts.flatMap((concept) => {
    const unitId = conceptToUnit.get(concept.id);
    const pos = positions.get(concept.id);
    if (!pos) {
      console.error(
        `concept-atlas: concept "${concept.id}" has no layout position (not listed under any unit's conceptIds) -- omitted from render`,
      );
      return [];
    }
    const inCollapsedUnit = unitId !== undefined && collapsedUnitIds.has(unitId);
    return [
      {
        id: concept.id,
        type: "conceptNode",
        position: pos,
        parentId: unitId,
        extent: unitId ? ("parent" as const) : undefined,
        hidden: inCollapsedUnit,
        width: CONCEPT_NODE_WIDTH,
        height: CONCEPT_NODE_HEIGHT,
        data: {
          canonicalLabel: concept.canonicalLabel,
          aliases: concept.aliases,
          masteryState: concept.masteryState,
        },
      },
    ];
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
