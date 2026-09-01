/**
 * Pure tree traversal/insertion checker (data-model.md). Traversal
 * order is exactly determined by the tree's real left/right structure
 * (no ambiguity possible), so it's checked by exact match. Insertion
 * assumes standard BST insertion -- the only convention this project's
 * benchmark corpus uses -- and the expected resulting tree is compared
 * structurally, not just by node count.
 */

export type TreeNode = { value: number; left: TreeNode | null; right: TreeNode | null };

export type TraversalOrder = "in-order" | "pre-order" | "post-order";

export type TraversalCheckInput = { tree: TreeNode | null; order: TraversalOrder; claimedResult: number[] };

export type TreeCheckResult<Expected> =
  | { outcome: "correct" }
  | { outcome: "incorrect"; expected: Expected }
  | { outcome: "invalid_input"; reason: string };

function traverse(tree: TreeNode | null, order: TraversalOrder): number[] {
  if (tree === null) return [];
  const left = traverse(tree.left, order);
  const right = traverse(tree.right, order);
  if (order === "in-order") return [...left, tree.value, ...right];
  if (order === "pre-order") return [tree.value, ...left, ...right];
  return [...left, ...right, tree.value];
}

export function checkTreeTraversal(input: TraversalCheckInput): TreeCheckResult<number[]> {
  const expected = traverse(input.tree, input.order);
  const matches = expected.length === input.claimedResult.length && expected.every((v, i) => v === input.claimedResult[i]);
  return matches ? { outcome: "correct" } : { outcome: "incorrect", expected };
}

export type InsertionCheckInput = { tree: TreeNode | null; insertValue: number; claimedResultTree: TreeNode | null };

function containsValue(tree: TreeNode | null, value: number): boolean {
  if (tree === null) return false;
  if (tree.value === value) return true;
  return value < tree.value ? containsValue(tree.left, value) : containsValue(tree.right, value);
}

function insertBst(tree: TreeNode | null, value: number): TreeNode {
  if (tree === null) return { value, left: null, right: null };
  if (value < tree.value) {
    return { ...tree, left: insertBst(tree.left, value) };
  }
  return { ...tree, right: insertBst(tree.right, value) };
}

function treesEqual(a: TreeNode | null, b: TreeNode | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.value === b.value && treesEqual(a.left, b.left) && treesEqual(a.right, b.right);
}

export function checkTreeInsertion(input: InsertionCheckInput): TreeCheckResult<TreeNode | null> {
  if (containsValue(input.tree, input.insertValue)) {
    return {
      outcome: "invalid_input",
      reason: `Value ${input.insertValue} already exists in the tree, and no duplicate-handling convention is defined.`,
    };
  }
  const expected = insertBst(input.tree, input.insertValue);
  return treesEqual(expected, input.claimedResultTree) ? { outcome: "correct" } : { outcome: "incorrect", expected };
}
