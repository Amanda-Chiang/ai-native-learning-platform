import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "@xyflow/react";
import type { LearnerRelationshipState, RelationshipType } from "@/types/graph/course-graph.ts";

/**
 * Relationship type -> line style, per
 * .claude/skills/concept-atlas/references/relationship-taxonomy.md and
 * visual-language.md's "pair color with a distinct line style" rule --
 * the type label text is the primary differentiator; dash pattern is the
 * redundant non-color cue.
 */
const TYPE_DASH: Record<RelationshipType, string | undefined> = {
  "prerequisite-of": undefined, // solid
  "builds-on": "6 3",
  "applies-to": "2 2",
  "analogous-to": "10 4",
  "contrasts-with": "1 5",
};

const WITHIN_UNIT_COLOR = "#6b7280";
const CROSS_UNIT_COLOR = "#7c3aed";

export type RelationshipEdgeData = {
  type: RelationshipType;
  learnerState: LearnerRelationshipState;
  crossUnit: boolean;
};

export function RelationshipEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  label,
}: EdgeProps & { data: RelationshipEdgeData }) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isWeak = data.learnerState === "weak";

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: data.crossUnit ? CROSS_UNIT_COLOR : WITHIN_UNIT_COLOR,
          strokeWidth: data.crossUnit ? 2.5 : 1.5,
          // Weak relationships get reduced opacity AND a distinct dotted
          // overlay pattern together -- never opacity alone
          // (visual-language.md's weak-edge rule).
          opacity: isWeak ? 0.55 : 1,
          strokeDasharray: isWeak ? "2 3" : TYPE_DASH[data.type],
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            fontSize: 10,
            background: "white",
            padding: "1px 4px",
            borderRadius: 4,
            pointerEvents: "all",
          }}
        >
          {label ?? data.type}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
