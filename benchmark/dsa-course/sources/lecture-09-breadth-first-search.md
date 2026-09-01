# Lecture 9: Breadth-First Search

> Source: MIT OpenCourseWare, 6.006 Introduction to Algorithms, Spring 2020
> (Erik Demaine, Jason Ku, Justin Solomon). Condensed from the original
> lecture notes PDF. License: CC BY-NC-SA 4.0 (https://ocw.mit.edu/terms).
> See `sources/README.md` for full attribution.

## Graph definitions

A graph `G = (V, E)` is a set of vertices `V` and a set of pairs of
vertices `E ⊆ V × V`. **Directed** edges are ordered pairs `(u, v)`;
**undirected** edges are unordered pairs `{u, v}`. Graphs in this course
are **simple**: edges are distinct and connect distinct vertices, which
implies `|E| = O(|V|²)`.

The **outgoing neighbor set** of u is `Adj+(u) = {v | (u,v) ∈ E}`; the
**incoming neighbor set** is `Adj-(u) = {v | (v,u) ∈ E}`. Dropping the
superscript defaults to outgoing: `Adj(u) = Adj+(u)`.

## Graph representation

Store the outgoing edges `Adj(u)` for every u: a **Set** structure (direct
access array or hash table) mapping `u` to `Adj(u)`, where each `Adj(u)`
is itself stored as an **adjacency list** (array or linked list). Since
`Σ deg(u) ≤ 2|E|` (handshaking lemma), a graph is storable in
`Θ(|V| + |E|)` space — so "linear time" for graph algorithms means
`Θ(|V| + |E|)`.

## Paths and distance

A **path** is a sequence of vertices `(v1, ..., vk)` where consecutive
vertices are connected by an edge. The **length** of a path is its number
of edges. The **distance** `δ(u, v)` is the length of a **shortest path**
from u to v (`δ(u,v) = ∞` if v is unreachable from u).

Graph path problems, each at least as hard as the one above it:

- `SINGLE_PAIR_REACHABILITY(G, s, t)`
- `SINGLE_PAIR_SHORTEST_PATH(G, s, t)`
- `SINGLE_SOURCE_SHORTEST_PATHS(G, s)` — the hardest; solved below.

## Shortest paths tree

Rather than returning every full path (which could take Ω(|V|²) time
total), store each vertex's **parent** `P(v)`: the second-to-last vertex
on a shortest path from s. The set of parents forms a **shortest paths
tree** of size O(|V|).

## Breadth-First Search (BFS)

**Idea**: explore graph nodes in increasing order of distance from `s`.
Define **level sets** `L_i = {v | δ(s, v) = i}`.

- **Base case**: `L0 = {s}`, `δ(s,s) = 0`, `P(s) = None`.
- **Inductive step**: to compute `L_i`, for every vertex `u` in `L_{i-1}`,
  for every `v ∈ Adj(u)` not already placed in an earlier level: add `v`
  to `L_i`, set `δ(s,v) = i`, and set `P(v) = u`.
- Repeat for increasing `i` until `L_i` is empty; any vertex never
  assigned a distance gets `δ(s, v) = ∞`.

**Running time**: each vertex is added to at most one level, and the
algorithm spends O(1) time per edge examined, so total work is bounded by
`O(1) × Σ deg(u) = O(|E|)` (handshake lemma), plus `Θ(|V|)` to handle
unreached vertices — **BFS runs in `O(|V| + |E|)` time**, i.e. linear in
the size of the graph.

**Note on terminology**: this lecture's notes describe BFS directly in
terms of level sets `L_i`, each stored in a structure with Θ(1)-time
insertion (e.g. a dynamic array or linked list) — it does not use the
phrase "FIFO queue" in the excerpted material above, though a queue is the
standard implementation choice for iterating the frontier level by level
and is how the PRD's own worked example (§28, "FIFO queue → BFS level
ordering") frames the same idea. When labeling a `FIFO_queue mechanism_for
BFS` relationship from this material, the source anchor should point to
the *level-set* description above, not to an explicit "FIFO queue" mention
that this lecture doesn't literally contain.
