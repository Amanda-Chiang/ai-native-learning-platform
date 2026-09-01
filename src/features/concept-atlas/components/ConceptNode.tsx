import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { MasteryState } from "@/types/graph/course-graph.ts";

/**
 * Redundant mastery encoding per
 * .claude/skills/concept-atlas/references/visual-language.md's table --
 * ring style + color + text label together, never color alone.
 */
const MASTERY_STYLE: Record<
  MasteryState,
  { borderStyle: string; borderWidth: number; color: string; label: string }
> = {
  unverified: { borderStyle: "dashed", borderWidth: 1, color: "#9ca3af", label: "Unverified" },
  exposed: { borderStyle: "solid", borderWidth: 1, color: "#3b82f6", label: "Exposed" },
  weak: { borderStyle: "solid", borderWidth: 1, color: "#d97706", label: "Weak" },
  solid: { borderStyle: "solid", borderWidth: 3, color: "#16a34a", label: "Solid" },
};

export type ConceptNodeData = {
  canonicalLabel: string;
  aliases: string[];
  masteryState: MasteryState;
};

export function ConceptNode({ data }: NodeProps & { data: ConceptNodeData }) {
  const mastery = MASTERY_STYLE[data.masteryState];

  return (
    <div
      style={{
        // Fills exactly the width/height React Flow was told about on
        // the node object (react-flow-adapter.ts) -- keeping the
        // rendered size and the size fitView/ELK reason about in sync,
        // rather than letting content dictate an unpredictable size.
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
        borderStyle: mastery.borderStyle,
        borderWidth: mastery.borderWidth,
        borderColor: mastery.color,
        borderRadius: 8,
        padding: "8px 12px",
        background: "white",
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div style={{ fontWeight: 600 }}>{data.canonicalLabel}</div>
      <div style={{ fontSize: 11, color: mastery.color }}>{mastery.label}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
