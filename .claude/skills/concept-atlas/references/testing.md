# Concept Atlas Testing

## Fixture

`tests/fixtures/concept-atlas-demo.json` — deterministic, checked-in fixture
covering:

- 3-5 units, 20-40 concepts.
- Multiple relationship types (see `relationship-taxonomy.md`).
- Weak / strong / unverified concept states.
- Weak / strong relationship states.
- At least one cross-unit connection.
- A duplicate/alias edge case.
- Both collapsed and expanded unit states.

## Required screenshots (`tests/visual/`)

- Whole-course atlas.
- Expanded unit.
- Focused concept (detail panel open).
- Weak-relationship state.
- Mobile/tablet breakpoint.

## Rules

- Never approve a snapshot update blindly — open the diff image.
- Passing functional tests does not imply visual correctness.
- Node/edge overlap or clipping is release-blocking, not a follow-up.
