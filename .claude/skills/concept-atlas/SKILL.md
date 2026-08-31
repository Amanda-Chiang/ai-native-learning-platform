---
name: concept-atlas
description: Use when building, modifying, or reviewing the Concept Atlas graph visualization (course dependency map, unit regions, mastery rings, relationship edges, detail panel).
---

# Concept Atlas

Rules for the course dependency-graph visualization. See
`brain/architecture/graph-model.md` for the underlying data model and
`brain/product/concept-atlas.md` for product intent.

## Rendering rules

- Units render as bounded regions, not a flat force-directed hairball.
- Layout follows conceptual dependency, not lecture chronology.
- Canonical graph data is renderer-neutral. React Flow/G6-specific
  properties (coordinates, styling, viewport) stay in a view adapter layer
  — never leak into the domain model or API responses.
- Semantic relationships require a standardized type plus a readable label
  (not just a color).
- Relationship types use redundant visual encoding (shape/dash-pattern in
  addition to color) so they remain distinguishable without relying on
  color alone.
- Mastery uses discrete states + ring + color together, not color alone.
- Weak edges (relationships) are first-class learner-state indicators —
  render them distinctly, don't just dim weak nodes.
- Concept clicks open a stable detail panel that doesn't cause the graph to
  rearrange itself.
- Questions and notes are not graph nodes — they attach to concepts/edges
  as evidence, not as first-class graph entities.
- Progressive disclosure (collapsed/expanded units) prevents hairballs as
  courses grow to 20-40+ concepts.
- Layout should preserve the user's mental map across graph revisions —
  don't recompute positions from scratch on every change.

## Testing

- Run the Concept Atlas visual regression fixture
  (`tests/fixtures/concept-atlas-demo.json` + `tests/visual/`) after any
  meaningful atlas change.
- Functional tests passing does not imply visual correctness — inspect
  snapshot diffs visually before approving.

## References

- `references/graph-domain-model.md`
- `references/visual-language.md`
- `references/interaction-states.md`
- `references/relationship-taxonomy.md`
- `references/testing.md`
