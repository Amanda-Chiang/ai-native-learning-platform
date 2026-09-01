"use client";

import { useEffect, useMemo, useState } from "react";
import { ReactFlow, Background, Controls } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { CourseGraph } from "@/types/graph/course-graph.ts";
import {
  computeElkLayout,
  courseGraphToReactFlowElements,
  type LayoutPosition,
} from "@/features/concept-atlas/adapters/react-flow-adapter.ts";
import { ConceptNode } from "@/features/concept-atlas/components/ConceptNode.tsx";
import { RelationshipEdge } from "@/features/concept-atlas/components/RelationshipEdge.tsx";
import { UnitGroupNode } from "@/features/concept-atlas/components/UnitGroupNode.tsx";

const nodeTypes = { conceptNode: ConceptNode, unitGroup: UnitGroupNode };
const edgeTypes = { relationshipEdge: RelationshipEdge };

/**
 * Top-level atlas canvas. Expand/collapse interaction and layout-
 * preference persistence are added on top of this in US2 -- this
 * component's own scope (US1) is rendering the whole-course map
 * correctly, nothing more.
 */
export function ConceptAtlas({ graph }: { graph: CourseGraph }) {
  const [positions, setPositions] = useState<Map<string, LayoutPosition> | null>(null);

  useEffect(() => {
    let cancelled = false;
    computeElkLayout(graph).then((computed) => {
      if (!cancelled) {
        setPositions(computed);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [graph]);

  const { nodes, edges } = useMemo(() => {
    if (!positions) {
      return { nodes: [], edges: [] };
    }
    return courseGraphToReactFlowElements(graph, positions, new Set());
  }, [graph, positions]);

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
