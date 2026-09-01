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
  /**
   * Focuses this relationship (opens the detail panel). Wired to the
   * label text specifically, not only React Flow's own onEdgeClick --
   * a bent/stepped path's own bounding-box center frequently does not
   * sit on the actual stroke geometry (found while testing: clicking
   * the edge's <g> element reliably missed the path itself), but the
   * label's position is derived directly from the path calculation, so
   * it's always a real point on the line.
   */
  onFocusEdge?: () => void;
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
        // React Flow's default invisible click-hitbox around an edge is
        // 20px wide -- easily wide enough to sit on top of a nearby unit
        // header and silently swallow clicks meant for it (found while
        // testing unit-collapse interaction). 6px is still comfortably
        // clickable for the edge itself without blocking neighbors.
        interactionWidth={6}
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
          onClick={data.onFocusEdge}
          role={data.onFocusEdge ? "button" : undefined}
          data-relationship-id={id}
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            fontSize: 10,
            background: "white",
            padding: "1px 4px",
            borderRadius: 4,
            pointerEvents: "all",
            cursor: data.onFocusEdge ? "pointer" : undefined,
          }}
        >
          {label ?? data.type}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
