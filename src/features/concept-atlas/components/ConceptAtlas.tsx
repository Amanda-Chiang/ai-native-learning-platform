"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReactFlow, Background, Controls, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { CourseGraph } from "@/types/graph/course-graph.ts";
import {
  computeElkLayout,
  courseGraphToReactFlowElements,
  type LayoutPosition,
} from "@/features/concept-atlas/adapters/react-flow-adapter.ts";
import {
  getLayoutPreference,
  saveLayoutPreference,
} from "@/features/concept-atlas/actions.ts";
import {
  mergeCollapsedUnitIds,
  mergePositionOverrides,
  toLayoutPreferenceEntry,
  type LayoutPreference,
} from "@/features/concept-atlas/layout-preference.ts";
import { applyFocusDimming, type FocusTarget } from "@/features/concept-atlas/focus-dimming.ts";
import { ConceptNode } from "@/features/concept-atlas/components/ConceptNode.tsx";
import { RelationshipEdge } from "@/features/concept-atlas/components/RelationshipEdge.tsx";
import { UnitGroupNode } from "@/features/concept-atlas/components/UnitGroupNode.tsx";
import {
  ConceptDetailPanel,
  type Focused,
} from "@/features/concept-atlas/components/ConceptDetailPanel.tsx";

const nodeTypes = { conceptNode: ConceptNode, unitGroup: UnitGroupNode };
const edgeTypes = { relationshipEdge: RelationshipEdge };

// React Flow paints .react-flow__edges (the SVG path layer) above
// .react-flow__edgelabel-renderer (the label portal) in DOM order. A
// label sits at a point derived directly from its own edge's path, so
// the edge's invisible interaction hitbox is always colocated with --
// and by default stacks over -- its own label, swallowing clicks meant
// for the label (found while making relationship edges clickable).
const EDGE_LABEL_STACKING_FIX = `
  .react-flow__edgelabel-renderer {
    z-index: 1000;
  }
`;

// Debounce interaction-end saves rather than writing on every drag frame
// (contracts/layout-actions.md).
const SAVE_DEBOUNCE_MS = 500;

// Same breakpoint ConceptDetailPanel.tsx already uses for its own
// side-panel/bottom-sheet switch -- one viewport threshold for the whole
// feature, not two independently-tuned ones.
const MOBILE_BREAKPOINT_QUERY = "(max-width: 768px)";

function buildFocused(graph: CourseGraph, target: FocusTarget): Focused | null {
  if (target.kind === "relationship") {
    const relationship = graph.relationships.find((r) => r.id === target.id);
    if (!relationship) {
      return null;
    }
    const from = graph.concepts.find((c) => c.id === relationship.fromConceptId);
    const to = graph.concepts.find((c) => c.id === relationship.toConceptId);
    return {
      kind: "relationship",
      id: relationship.id,
      type: relationship.type,
      fromConceptLabel: from?.canonicalLabel ?? relationship.fromConceptId,
      toConceptLabel: to?.canonicalLabel ?? relationship.toConceptId,
      learnerState: relationship.learnerState,
      explanation: relationship.explanation,
    };
  }

  const concept = graph.concepts.find((c) => c.id === target.id);
  if (!concept) {
    return null;
  }

  const relationships = graph.relationships
    .filter((r) => r.fromConceptId === concept.id || r.toConceptId === concept.id)
    .map((r) => {
      const outgoing = r.fromConceptId === concept.id;
      const otherId = outgoing ? r.toConceptId : r.fromConceptId;
      const other = graph.concepts.find((c) => c.id === otherId);
      return {
        id: r.id,
        type: r.type,
        direction: (outgoing ? "outgoing" : "incoming") as "outgoing" | "incoming",
        otherConceptId: otherId,
        otherConceptLabel: other?.canonicalLabel ?? otherId,
        learnerState: r.learnerState,
      };
    });

  return {
    kind: "concept",
    id: concept.id,
    canonicalLabel: concept.canonicalLabel,
    aliases: concept.aliases,
    masteryState: concept.masteryState,
    relationships,
  };
}

export function ConceptAtlas({ graph, courseId }: { graph: CourseGraph; courseId: string }) {
  const [defaultPositions, setDefaultPositions] = useState<Map<string, LayoutPosition> | null>(
    null,
  );
  const [preferences, setPreferences] = useState<LayoutPreference[]>([]);
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_BREAKPOINT_QUERY);
    setIsMobile(mql.matches);
    const onChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    computeElkLayout(graph).then((computed) => {
      if (!cancelled) {
        setDefaultPositions(computed);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [graph]);

  useEffect(() => {
    let cancelled = false;
    getLayoutPreference(courseId).then((loaded) => {
      if (!cancelled) {
        setPreferences(loaded);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const collapsedUnitIds = useMemo(() => mergeCollapsedUnitIds(preferences), [preferences]);

  const positions = useMemo(() => {
    if (!defaultPositions) {
      return null;
    }
    return mergePositionOverrides(defaultPositions, preferences);
  }, [defaultPositions, preferences]);

  const { nodes, edges } = useMemo(() => {
    if (!positions) {
      return { nodes: [], edges: [] };
    }
    const base = courseGraphToReactFlowElements(graph, positions, collapsedUnitIds);
    // Dimming is transient view state derived from click state, not
    // persisted or stored on the canonical DTO -- still respects
    // Constitution Principle I, same as the ELK-computed coordinates
    // this same pipeline already attaches only at the adapter layer.
    return applyFocusDimming(base.nodes, base.edges, focusTarget, graph);
  }, [graph, positions, collapsedUnitIds, focusTarget]);

  const focused = useMemo(
    () => (focusTarget ? buildFocused(graph, focusTarget) : null),
    [graph, focusTarget],
  );

  // On a phone/tablet-sized viewport, fitView would still zoom the whole
  // multi-unit graph down to fit the narrow width -- exactly the
  // "shrinking the desktop layout until it's unreadable" spec FR-013
  // forbids. Instead, start centered on the first unit at a readable
  // zoom and let the student pan/zoom manually (Controls are already
  // rendered) to reach the rest -- pan/zoom-primary navigation, per
  // FR-013's stated alternative to shrinking everything into view.
  const mobileDefaultViewport = useMemo(() => {
    const unitNodes = nodes.filter((n) => n.type === "unitGroup");
    // Array order follows graph.units, not layout position -- ELK is
    // free to place the first-listed unit anywhere. Pick by leftmost x
    // so "first" matches what a student actually sees first when
    // panning left-to-right, not an arbitrary data-order accident
    // (found while testing: array-order-first landed on a unit other
    // than the atlas's visually leftmost one).
    const leftmostUnit = unitNodes.reduce<Node | null>(
      (leftmost, n) => (!leftmost || n.position.x < leftmost.position.x ? n : leftmost),
      null,
    );
    if (!leftmostUnit) {
      return { x: 20, y: 20, zoom: 1 };
    }
    return { x: -leftmostUnit.position.x + 20, y: -leftmostUnit.position.y + 20, zoom: 1 };
  }, [nodes]);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingEntriesRef = useRef<Map<string, LayoutPreference>>(new Map());

  const scheduleSave = useCallback(
    (entry: LayoutPreference) => {
      pendingEntriesRef.current.set(entry.entityId, entry);
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        const toSave = Array.from(pendingEntriesRef.current.values());
        pendingEntriesRef.current.clear();
        saveLayoutPreference(courseId, toSave);
      }, SAVE_DEBOUNCE_MS);
    },
    [courseId],
  );

  const toggleUnit = useCallback(
    (unitId: string) => {
      const isCurrentlyCollapsed = collapsedUnitIds.has(unitId);
      const entry = toLayoutPreferenceEntry(unitId, "unit", { collapsed: !isCurrentlyCollapsed });
      setPreferences((current) => [...current.filter((p) => p.entityId !== unitId), entry]);
      scheduleSave(entry);
    },
    [collapsedUnitIds, scheduleSave],
  );

  const onNodeClick = useCallback(
    (_event: unknown, node: Node) => {
      if (node.type === "unitGroup") {
        toggleUnit(node.id);
      } else if (node.type === "conceptNode") {
        // Closing and reopening on the same node acts as a toggle;
        // clicking a different concept just re-focuses -- neither
        // rearranges the underlying map (spec FR-010).
        setFocusTarget((current) =>
          current?.kind === "concept" && current.id === node.id
            ? null
            : { kind: "concept", id: node.id },
        );
      }
    },
    [toggleUnit],
  );

  const focusRelationship = useCallback((relationshipId: string) => {
    setFocusTarget((current) =>
      current?.kind === "relationship" && current.id === relationshipId
        ? null
        : { kind: "relationship", id: relationshipId },
    );
  }, []);

  // Deliberately NOT also wiring React Flow's onEdgeClick prop here.
  // React Flow detects edge clicks via distance-to-path hit testing on
  // the pane (not real DOM targeting), so a click on the label -- which
  // sits directly on the path by construction -- fires React Flow's own
  // edge-click detection too. Wiring both meant a single click called
  // focusRelationship twice, toggling the focus target right back to
  // null (found via a console.log that showed two calls per click).
  // The label handler alone is sufficient and is the more reliable
  // target anyway (see RelationshipEdge.tsx's onFocusEdge doc comment).
  const edgesWithHandlers = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        data: { ...edge.data, onFocusEdge: () => focusRelationship(edge.id) },
      })),
    [edges, focusRelationship],
  );

  const onNodeDragStop = useCallback(
    (_event: unknown, node: Node) => {
      if (node.type !== "conceptNode" && node.type !== "unitGroup") {
        return;
      }
      const entry = toLayoutPreferenceEntry(node.id, node.type === "unitGroup" ? "unit" : "concept", {
        x: node.position.x,
        y: node.position.y,
      });
      setPreferences((current) => [...current.filter((p) => p.entityId !== node.id), entry]);
      scheduleSave(entry);
    },
    [scheduleSave],
  );

  if (!positions) {
    return <p>Loading atlas…</p>;
  }

  return (
    <div style={{ width: "100%", height: "80vh", position: "relative" }}>
      <style>{EDGE_LABEL_STACKING_FIX}</style>
      <ReactFlow
        nodes={nodes}
        edges={edgesWithHandlers}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        fitView={!isMobile}
        // Default fitView has zero margin, which clips edge-adjacent
        // unit regions right at the viewport boundary (spec SC-001
        // forbids clipped nodes) -- 12% padding keeps every region fully
        // visible regardless of viewport width.
        fitViewOptions={{ padding: 0.12 }}
        // React Flow's default minZoom (0.5) caps how far fitView can
        // zoom out. A wide multi-unit course easily needs less than 0.5x
        // to fit the whole width -- without lowering this, fitView clips
        // rather than zooming out further, which is what actually caused
        // the clipped edges (not the padding, which was a red herring).
        minZoom={0.05}
        defaultViewport={isMobile ? mobileDefaultViewport : undefined}
      >
        <Background />
        <Controls />
      </ReactFlow>
      {focused && <ConceptDetailPanel focused={focused} onClose={() => setFocusTarget(null)} />}
    </div>
  );
}
