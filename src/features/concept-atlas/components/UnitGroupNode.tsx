import type { NodeProps } from "@xyflow/react";

/**
 * Renders a unit as a visually bounded region (spec FR-001) -- a real
 * border, not just clustered nodes with no boundary. Sized by
 * react-flow-adapter.ts from ELK's auto-computed container dimensions
 * (node.style.width/height), so the border always fits its concepts.
 */
export type UnitGroupNodeData = {
  title: string;
  collapsed: boolean;
};

export function UnitGroupNode({ data }: NodeProps & { data: UnitGroupNodeData }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        border: "2px solid #d1d5db",
        borderRadius: 12,
        background: "rgba(249, 250, 251, 0.6)",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: 13,
          padding: "8px 12px",
          borderBottom: data.collapsed ? "none" : "1px solid #e5e7eb",
        }}
      >
        {data.title}
      </div>
    </div>
  );
}
