import test from "node:test";
import assert from "node:assert/strict";
import { checkTreeTraversal, checkTreeInsertion } from "../../../src/features/deterministic-grading/checkers/tree-checker.ts";
import type { TreeNode } from "../../../src/features/deterministic-grading/checkers/tree-checker.ts";

//        2
//      /   \
//     1     3
const TREE: TreeNode = { value: 2, left: { value: 1, left: null, right: null }, right: { value: 3, left: null, right: null } };

test("in-order traversal is checked by exact match against the real computed traversal", () => {
  const correct = checkTreeTraversal({ tree: TREE, order: "in-order", claimedResult: [1, 2, 3] });
  assert.equal(correct.outcome, "correct");

  const wrong = checkTreeTraversal({ tree: TREE, order: "in-order", claimedResult: [2, 1, 3] });
  assert.equal(wrong.outcome, "incorrect");
  if (wrong.outcome === "incorrect") {
    assert.deepEqual(wrong.expected, [1, 2, 3]);
  }
});

test("pre-order and post-order are each checked against their own real traversal", () => {
  assert.equal(checkTreeTraversal({ tree: TREE, order: "pre-order", claimedResult: [2, 1, 3] }).outcome, "correct");
  assert.equal(checkTreeTraversal({ tree: TREE, order: "post-order", claimedResult: [1, 3, 2] }).outcome, "correct");
});

test("an empty tree traverses to an empty result", () => {
  const result = checkTreeTraversal({ tree: null, order: "in-order", claimedResult: [] });
  assert.equal(result.outcome, "correct");
});

test("a claimed post-insertion tree is compared structurally against standard BST insertion", () => {
  const correctResult: TreeNode = {
    value: 2,
    left: { value: 1, left: null, right: null },
    right: { value: 3, left: null, right: { value: 4, left: null, right: null } },
  };
  const correct = checkTreeInsertion({ tree: TREE, insertValue: 4, claimedResultTree: correctResult });
  assert.equal(correct.outcome, "correct");

  const wrongResult: TreeNode = {
    value: 2,
    left: { value: 1, left: null, right: { value: 4, left: null, right: null } },
    right: { value: 3, left: null, right: null },
  };
  const wrong = checkTreeInsertion({ tree: TREE, insertValue: 4, claimedResultTree: wrongResult });
  assert.equal(wrong.outcome, "incorrect");
});

test("inserting into an empty tree produces a single-node tree", () => {
  const result = checkTreeInsertion({
    tree: null,
    insertValue: 5,
    claimedResultTree: { value: 5, left: null, right: null },
  });
  assert.equal(result.outcome, "correct");
});

test("a duplicate insert value against a tree with no defined duplicate-handling convention is invalid_input", () => {
  const result = checkTreeInsertion({ tree: TREE, insertValue: 2, claimedResultTree: TREE });
  assert.equal(result.outcome, "invalid_input");
});
