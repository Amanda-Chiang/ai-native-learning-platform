"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReactFlow, Background, Controls, type Node } from "@xyflow/react";
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
import { applyFocusDimming } from "@/features/concept-atlas/focus-dimming.ts";
import { ConceptNode } from "@/features/concept-atlas/components/ConceptNode.tsx";
import { RelationshipEdge } from "@/features/concept-atlas/components/RelationshipEdge.tsx";
import { UnitGroupNode } from "@/features/concept-atlas/components/UnitGroupNode.tsx";
import {
  ConceptDetailPanel,
  type FocusedConcept,
} from "@/features/concept-atlas/components/ConceptDetailPanel.tsx";

const nodeTypes = { conceptNode: ConceptNode, unitGroup: UnitGroupNode };
const edgeTypes = { relationshipEdge: RelationshipEdge };

// Debounce interaction-end saves rather than writing on every drag frame
// (contracts/layout-actions.md).
const SAVE_DEBOUNCE_MS = 500;

function buildFocusedConcept(graph: CourseGraph, conceptId: string): FocusedConcept | null {
  const concept = graph.concepts.find((c) => c.id === conceptId);
  if (!concept) {
    return null;
  }

  const relationships = graph.relationships
    .filter((r) => r.fromConceptId === conceptId || r.toConceptId === conceptId)
    .map((r) => {
      const outgoing = r.fromConceptId === conceptId;
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
  const [focusedConceptId, setFocusedConceptId] = useState<string | null>(null);

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
    return applyFocusDimming(base.nodes, base.edges, focusedConceptId, graph);
  }, [graph, positions, collapsedUnitIds, focusedConceptId]);

  const focusedConcept = useMemo(
    () => (focusedConceptId ? buildFocusedConcept(graph, focusedConceptId) : null),
    [graph, focusedConceptId],
  );

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
        setFocusedConceptId((current) => (current === node.id ? null : node.id));
      }
    },
    [toggleUnit],
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
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        fitView
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
      >
        <Background />
        <Controls />
      </ReactFlow>
      {focusedConcept && (
        <ConceptDetailPanel focused={focusedConcept} onClose={() => setFocusedConceptId(null)} />
      )}
    </div>
  );
}
