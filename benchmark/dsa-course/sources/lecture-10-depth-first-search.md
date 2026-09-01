# Lecture 10: Depth-First Search

> Source: MIT OpenCourseWare, 6.006 Introduction to Algorithms, Spring 2020
> (Erik Demaine, Jason Ku, Justin Solomon). Condensed from the original
> lecture notes PDF. License: CC BY-NC-SA 4.0 (https://ocw.mit.edu/terms).
> See `sources/README.md` for full attribution.

## Depth-First Search (DFS)

Searches a graph from a vertex `s`, similar to BFS, but solves
**Single Source Reachability**, not shortest paths — it returns a (not
necessarily shortest) parent tree back to `s`.

**Idea**: visit outgoing adjacencies recursively, never revisiting a
vertex — follow any path until stuck, then backtrack to find an
unexplored path.

```text
P(s) = None, then run visit(s), where:
visit(u):
  for every v in Adj(u) not already in P:
    set P(v) = u and recursively call visit(v)
  (DFS finishes visiting vertex u)
```

**Correctness**: DFS visits every vertex reachable from `s` and correctly
sets its parent, by induction on distance from `s`.

**Running time**: each vertex is visited at most once, spending O(1) time
per outgoing edge, so total work is `O(1) × Σ deg(u) = O(|E|)`. Unlike
BFS, DFS doesn't compute a distance for each vertex, so it runs in
**`O(|E|)` time**.

## Full-BFS and Full-DFS

To explore an entire graph (not just vertices reachable from one vertex),
repeat a search algorithm `A` on any unvisited vertex until all vertices
are visited — **Full-BFS** or **Full-DFS**. Both run in `O(|V| + |E|)`
time and visit every vertex exactly once.

## Graph connectivity

An undirected graph is **connected** if a path connects every pair of
vertices. **Connected Components**: partition `V` into subsets `V_i` that
are each internally connected, with no edges between different subsets.
A single-source-reachability algorithm `A` solves Connected Components:
run Full-A, and put each run's visited vertices into one component.

## Topological sort

A **DAG** (Directed Acyclic Graph) contains no directed cycle. A
**topological order** is an ordering `f` on vertices such that every edge
`(u,v)` satisfies `f(u) < f(v)`. The **finishing order** is the order in
which Full-DFS finishes visiting each vertex. **Claim**: if `G` is a DAG,
the *reverse* of its finishing order is a topological order.

## Cycle detection

If the reverse finishing order for Full-DFS is *not* a valid topological
order, `G` must contain a cycle — checkable in `O(|E|)` time. To return an
actual cycle, maintain the set of ancestors along the current DFS path: if
`G` has a cycle, Full-DFS will traverse an edge from some vertex `v` to one
of its own ancestors.
