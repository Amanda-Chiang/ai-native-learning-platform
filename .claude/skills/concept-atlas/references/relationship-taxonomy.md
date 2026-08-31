# Relationship Taxonomy

Standardized relationship types (extend deliberately — an unbounded type set
defeats redundant visual encoding):

- `prerequisite-of` — A must be understood before B (directional).
- `builds-on` — B extends/specializes A (directional, weaker than
  prerequisite).
- `applies-to` — A is a technique applied within B's domain.
- `analogous-to` — A and B share structure without a dependency direction
  (non-directional).
- `contrasts-with` — A and B are commonly confused/conflated (non-
  directional; useful for misconception detection).

Every relationship instance requires both a `type` and a human-readable
`label` (e.g. type `prerequisite-of`, label "needed to understand BFS level
ordering"). The type drives visual encoding; the label is what the detail
panel shows.

Duplicate/alias edges (same semantic relationship reached via different
extraction passes) must be deduplicated at ingestion, not at render time —
see `brain/architecture/graph-model.md`.
