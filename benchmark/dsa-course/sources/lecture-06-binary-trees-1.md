# Lecture 6: Binary Trees, Part 1

> Source: MIT OpenCourseWare, 6.006 Introduction to Algorithms, Spring 2020
> (Erik Demaine, Jason Ku, Justin Solomon). Condensed from the original
> lecture notes PDF. License: CC BY-NC-SA 4.0 (https://ocw.mit.edu/terms).
> See `sources/README.md` for full attribution.

## Motivation

Array/Linked List Sequences and Array/Hash Table Sets can't achieve
worst-case O(log n) on all operations. Goal: a pointer-based structure
(like Linked List) with **worst-case** O(log n) performance — a **binary
tree**.

## Binary tree structure

A binary tree is a pointer-based data structure with three pointers per
node: `node.{item, parent, left, right}`. The **root** has no parent; a
**leaf** has no children.

- `depth(<X>)`: length of the path from node `<X>` to the root.
- `height(<X>)`: the max depth of any node in the subtree rooted at `<X>`.
- Design goal: operations run in O(h) time for root height h, and maintain
  h = O(log n).

## Traversal order

A binary tree has an inherent **traversal order**: every node in `<X>`'s
left subtree comes before `<X>`; every node in its right subtree comes
after. Listing nodes in traversal order (recursively list left subtree,
list self, recursively list right subtree) runs in O(n) time.

## Navigation

- **Find first** in a subtree: recurse left until no left child; O(h) time.
- **Find successor** of `<X>`: if `<X>` has a right child, return the first
  node of the right subtree; otherwise return the lowest ancestor of `<X>`
  for which `<X>` is in its left subtree. O(h) time.

## Dynamic operations

- **Insert** node `<Y>` after `<X>` in traversal order: if `<X>` has no
  right child, make `<Y>` its right child; otherwise make `<Y>` the left
  child of `<X>`'s successor (which cannot have a left child). O(h) time.
- **Delete** the item at node `<X>`: if `<X>` is a leaf, detach it from its
  parent. Otherwise, swap items with `<X>`'s predecessor (if it has a left
  child) or successor (if it has a right child), and recurse. O(h) time.

## Application: Set (Binary Search Tree)

A **Set Binary Tree** (BST) keeps traversal order equal to sorted key
order — equivalently, the **BST property**: for every node, every key in
its left subtree ≤ its key ≤ every key in its right subtree. `find(k)`
works like binary search: recurse left if k is smaller, right if larger,
in O(h) time.

## Application: Sequence

A **Sequence Binary Tree** keeps traversal order equal to sequence order.
`subtree_at(i)` finds the i-th node by comparing i to the size of the left
subtree (maintained via **augmentation**: a `node.size` field updated in
O(h) time per insert/delete), giving O(h) sequence operations.

## Where this course goes next

Lecture 6 leaves binary trees **unbalanced** — height h can be Θ(n) in the
worst case (e.g. inserting sorted data). Lecture 7 (AVL trees) shows how to
keep h = O(log n) via rotations after insertion/deletion.
