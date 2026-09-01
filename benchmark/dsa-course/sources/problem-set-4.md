# Problem Set 4

> Source: MIT OpenCourseWare, 6.006 Introduction to Algorithms, Spring 2020
> (Erik Demaine, Jason Ku, Justin Solomon). Condensed from the original
> problem set PDF. License: CC BY-NC-SA 4.0 (https://ocw.mit.edu/terms).
> See `sources/README.md` for full attribution.

Covers Lecture 6 (Binary Trees I) through Lecture 8 (Binary Heaps).

## Problem 4-1: Binary Tree Practice [10 points]

(a) Given a Binary Search Tree that satisfies the BST property but is not
height-balanced, identify which nodes are unbalanced and compute their
**skew** (the difference in left/right subtree heights).
(b) Perform a sequence of insertions/deletions on the tree (adding or
removing leaves, swapping keys down as needed to maintain the BST
property), without using rotations, drawing the tree after each step.
(c) For each unbalanced node from (a), show the trees resulting from left
and right rotation, and state whether each result is height-balanced
(satisfies the AVL property).

*Tests*: direct application of Lecture 6/7 material — BST property,
tree mutation via leaf insert/delete, and AVL rotation as a balancing
mechanism.

## Problem 4-2: Heap Practice [10 points]

For several given arrays, draw each as a complete binary tree, classify it
as a max-heap, min-heap, or neither, and if neither, convert it to a
min-heap via a sequence of adjacent swaps (shown step by step).

*Tests*: direct application of the Max-Heap Property and
`max_heapify`-style local repair from Lecture 8.

## Problem 4-3: Gardening Contest [10 points]

(a) Given an unsorted array of (score, registration-number) pairs and an
integer `k`, describe an `O(|A| + k log |A|)`-time algorithm to return the
registration numbers of the `k` highest-scoring entries — i.e., build a
heap in O(n) and `delete_max` k times.
(b) Given a max-heap of the same pairs and a threshold `x`, describe an
`O(n_x)`-time algorithm (output-sensitive in `n_x`, the number of results)
to return every entry scoring above `x`, by pruning any subtree whose root
already falls at or below `x` (since the Max-Heap Property guarantees no
descendant can score higher).

*Tests*: **application**-tier use of the binary heap from Lecture 8 in a
concrete top-k / threshold-query scenario — a good source for an
`application`-tier benchmark question, and (b) specifically exercises the
Max-Heap Property's subtree-pruning consequence, useful as a
`relationship_explanation`-tier item linking "Max-Heap Property" to
"binary heap subtree pruning."

## Problem 4-4: Solar Supply [15 points]

Design operations (`initialize`, `power_on`, `power_off`, `customers`) for
tracking building-to-solar-farm capacity assignments with specified
worst-case/expected/amortized time bounds — a Set-interface design problem
built on the balanced-tree/hash-table toolkit from Lectures 3–8.

*Tests*: transfer-tier — applying Set-interface data structure choices to
a novel domain (capacity allocation) not seen verbatim in lecture.

## Problem 4-5: Robot Wrangling [15 points]

Given an array of matrices representing joint transformations along a
robotic arm, design a data structure supporting `O(n)` initialization,
`O(log n)` single-joint updates, and `O(1)` full-product queries — a
segment-tree-style augmented-tree design problem (non-commutative product
maintained via subtree augmentation, echoing the `node.size`/`node.max`
augmentation pattern from Lectures 6 and 8).

*Tests*: transfer-tier — recognizing that the augmented-binary-tree pattern
generalizes beyond `size`/`max` to an arbitrary associative (here,
non-commutative) combining operator.

## Problem 4-6: πz²a Optimization [40 points]

A multi-part problem building an augmented AVL tree supporting a novel
`max_prefix()` operation (maximum prefix-sum over keys), used to solve a
2D dominance/optimization problem (finding the "tastiest" rectangular
slice of a topping-covered pizza) in `O(n log n)` time, including a full
Python implementation.

*Tests*: the course's own hardest transfer-tier example — augmenting a
known structure (Set AVL Tree) with a new, non-obvious property to solve
an unrelated-looking geometric optimization problem. Strong source for the
benchmark's required "connection" and "transfer" assessment-type examples
(PRD §15.2).
