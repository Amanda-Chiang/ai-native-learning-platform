import type { TreeNode } from "../deterministic-grading/checkers/tree-checker.ts";
import type { LayoutNode, LayoutEdge } from "./graph-layout.ts";

export type TreeLayout = { nodes: LayoutNode[]; edges: LayoutEdge[] };

const X_SPACING = 60;
const Y_SPACING = 80;

/**
 * Standard recursive placement: an in-order traversal assigns each
 * node an increasing x position (so left/right structure stays
 * visually intact regardless of the tree's actual shape), depth
 * assigns y. Each node gets a synthetic, stable id (its position in
 * the in-order sequence) since TreeNode itself carries no id, only a
 * value -- two equal values at different tree positions must still
 * render/connect as distinct nodes.
 */
export function layoutTree(tree: TreeNode | null): TreeLayout {
  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];
  let nextX = 0;

  function assign(node: TreeNode | null, depth: number): string | null {
    if (node === null) return null;
    const leftId = assign(node.left, depth + 1);
    const id = `n${nodes.length}`;
    nodes.push({ id, x: nextX * X_SPACING, y: depth * Y_SPACING, label: String(node.value) });
    nextX += 1;
    if (leftId !== null) edges.push({ sourceId: id, targetId: leftId });
    const rightId = assign(node.right, depth + 1);
    if (rightId !== null) edges.push({ sourceId: id, targetId: rightId });
    return id;
  }

  assign(tree, 0);

  return { nodes, edges };
}
