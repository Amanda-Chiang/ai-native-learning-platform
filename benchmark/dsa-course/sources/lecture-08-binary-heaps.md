# Lecture 8: Binary Heaps

> Source: MIT OpenCourseWare, 6.006 Introduction to Algorithms, Spring 2020
> (Erik Demaine, Jason Ku, Justin Solomon). Condensed from the original
> lecture notes PDF. License: CC BY-NC-SA 4.0 (https://ocw.mit.edu/terms).
> See `sources/README.md` for full attribution.

## Priority Queue interface

Keeps track of many items and quickly accesses/removes the most important
one (examples: router bandwidth prioritization, OS process scheduling,
discrete-event simulation, graph algorithms). Items are ordered by
**key = priority**, so this is a **Set** interface, optimized for a subset
of Set operations: `build(X)`, `insert(x)`, `delete_max()`, `find_max()`.

**Priority queue sort**: any priority queue translates into a sort —
`build`, then repeatedly `delete_max()` (or `delete_min()`). Selection
Sort = priority queue sort on an unordered array; Insertion Sort =
priority queue sort on a sorted array; AVL Sort = priority queue sort on a
Set AVL Tree; **Heap Sort** = priority queue sort on a binary heap.

## Array as a complete binary tree

Interpret an array as a **complete binary tree**: at most 2^i nodes at
depth i, and at the largest depth all nodes are left-aligned. This is an
**implicit** tree — no pointers stored. Given index i:
`left(i) = 2i+1`, `right(i) = 2i+2`, `parent(i) = floor((i-1)/2)`.

## Max-Heap property

**Max-Heap Property** at node i: `Q[i] >= Q[j]` for `j` in
`{left(i), right(i)}`. A **max-heap** satisfies this at every node, which
(by induction on depth) implies `Q[i] >= Q[j]` for *every* node j in
`subtree(i)` — so the maximum item is always at the root.

## Heap insert

Append the new item to the end of the array (its position becomes the next
leaf `i` in reading order), then **`max_heapify_up(i)`**: while the parent
is smaller, swap with the parent and recurse upward. Running time: Θ(log n)
(bounded by tree height).

## Heap delete_max

Swap the root (index 0) with the last item (index n-1), remove the last
item, then **`max_heapify_down(0)`**: while a child is larger, swap with
the larger child and recurse downward. Running time: Θ(log n).

## Heap Sort and linear build

Plugging a max-heap into priority queue sort gives an O(n log n) sort. A
naive `build` (n calls to `max_heapify_up`) costs Ω(n log n) worst case,
but treating the full array as a complete tree from the start and calling
`max_heapify_down(i)` for i from n-1 down to 0 (leaves-up) builds the heap
in **O(n)** time — this doesn't change Heap Sort's overall O(n log n), but
it is a standalone useful fact about heap construction.

## Summary table (worst-case, from the lecture)

| Priority Queue Structure | build(A) | insert(x) | delete_max() | Sort time | In-place? |
|---|---|---|---|---|---|
| Dynamic Array (unordered) | n | 1 (amortized) | n | n² | Y — Selection Sort |
| Sorted Dynamic Array | n log n | n | 1 (amortized) | n² | Y — Insertion Sort |
| Set AVL Tree | n log n | log n | log n | n log n | N — AVL Sort |
| Binary (Max) Heap | n | log n (amortized) | log n | n log n | Y — Heap Sort |
