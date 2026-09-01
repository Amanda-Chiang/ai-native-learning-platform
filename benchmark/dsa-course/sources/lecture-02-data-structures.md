# Lecture 2: Data Structures

> Source: MIT OpenCourseWare, 6.006 Introduction to Algorithms, Spring 2020
> (Erik Demaine, Jason Ku, Justin Solomon). Condensed from the original
> lecture notes PDF. License: CC BY-NC-SA 4.0 (https://ocw.mit.edu/terms).
> See `sources/README.md` for full attribution.

## Data structure interfaces

A **data structure** is a way to store data, with algorithms that support
**operations** on the data. The collection of supported operations is an
**interface** (also API or ADT). The interface is a *specification* (what
operations are supported — the problem); the data structure is a
*representation* (how operations are supported — the solution). Two main
interfaces are used in this course: **Sequence** and **Set**.

## Sequence interface

Maintains a sequence of items where order is **extrinsic**, e.g.
`(x0, x1, ..., xn-1)`. Supports:

- Container: `build(X)`, `len()`
- Static: `iter_seq()`, `get_at(i)`, `set_at(i, x)`
- Dynamic: `insert_at(i, x)`, `delete_at(i)`, `insert_first(x)`,
  `delete_first()`, `insert_last(x)`, `delete_last()`

Special cases: a **stack** supports `insert_last(x)` and `delete_last()`; a
**queue** supports `insert_last(x)` and `delete_first()`.

## Set interface

Maintains a set of items with unique keys; order is **intrinsic** (by key).
Supports `build`, `len`, `find(k)`, `insert(x)`, `delete(k)`, plus Order
operations `iter_ord()`, `find_min()`, `find_max()`, `find_next(k)`,
`find_prev(k)`. A **dictionary** is a Set without the Order operations.

## Array Sequence

Arrays give `get_at(i)`/`set_at(i,x)` in Θ(1) time (great for static
operations), but dynamic operations (`insert_first`, `delete_first`,
`insert_at`, `delete_at`) cost Θ(n) — they require reallocating and
shifting.

## Linked List Sequence

A pointer-based structure: each item is stored in a **node** with fields
`node.item` and `node.next`. Insert/delete from the front run in Θ(1) time
by relinking pointers, but `get_at(i)`/`set_at(i,x)` cost Θ(n) since there's
no random access.

## Dynamic Array Sequence

Allocates extra space (a **fill ratio** `r`) so reallocation doesn't happen
on every insert. When the array is full, it reallocates to a lower fill
ratio (e.g. 1/2), so a sequence of Θ(n) operations costs Θ(n) total — each
operation is Θ(1) **amortized**.

**Amortized analysis**: an operation has amortized cost T(n) if any k
operations cost at most k·T(n) — "T(n) on average" over many operations,
even if individual operations can occasionally be expensive.

## Summary table (worst-case, from the lecture)

| Data Structure | build(X) | get_at(i)/set_at(i,x) | insert_first/delete_first | insert_last/delete_last | insert_at/delete_at |
|---|---|---|---|---|---|
| Array | n | 1 | n | n | n |
| Linked List | n | n | 1 | n | n |
| Dynamic Array | n | 1 | n | 1 (amortized) | n |
