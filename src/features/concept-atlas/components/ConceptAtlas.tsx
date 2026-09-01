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
import { ConceptNode } from "@/features/concept-atlas/components/ConceptNode.tsx";
import { RelationshipEdge } from "@/features/concept-atlas/components/RelationshipEdge.tsx";
import { UnitGroupNode } from "@/features/concept-atlas/components/UnitGroupNode.tsx";

const nodeTypes = { conceptNode: ConceptNode, unitGroup: UnitGroupNode };
const edgeTypes = { relationshipEdge: RelationshipEdge };

// Debounce interaction-end saves rather than writing on every drag frame
// (contracts/layout-actions.md).
const SAVE_DEBOUNCE_MS = 500;

export function ConceptAtlas({ graph, courseId }: { graph: CourseGraph; courseId: string }) {
  const [defaultPositions, setDefaultPositions] = useState<Map<string, LayoutPosition> | null>(
    null,
  );
  const [preferences, setPreferences] = useState<LayoutPreference[]>([]);

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
    return courseGraphToReactFlowElements(graph, positions, collapsedUnitIds);
  }, [graph, positions, collapsedUnitIds]);

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
    <div style={{ width: "100%", height: "80vh" }}>
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
    </div>
  );
}
