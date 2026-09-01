# Quickstart: Concept Atlas Renderer

Unlike Phase 1, most of this feature is fully verifiable right now — the
atlas renders the checked-in fixture entirely client-side. Only layout
*persistence* (remembering expand/collapse across visits) needs a live
Supabase project, matching Phase 1's still-open credential gap.

## Group A — verifiable now, no external accounts needed

### A1. Typecheck

```bash
nvm use 24
npm run typecheck
```

**Expected outcome**: exits 0. `CourseGraph` DTO, the React Flow adapter,
and all components typecheck cleanly.

### A2. Adapter and layout-preference logic (pure, no browser needed)

```bash
npm run test:unit
```

**Expected outcome**: passes, including new tests confirming: every
`CourseGraph` concept/relationship in the demo fixture produces exactly
one corresponding React Flow node/edge (data-model.md's duplicate-edge
case produces *two* edges, not one merged edge — spec FR-014); a
layout-preference merge helper correctly overlays saved positions onto
ELK-computed defaults without mutating the input `CourseGraph`.

### A3. Visual regression against the demo fixture

```bash
npx playwright test tests/visual/concept-atlas.spec.ts
```

**Expected outcome**: produces the 5 required screenshots per
`.claude/skills/concept-atlas/references/testing.md` (whole-course atlas,
expanded unit, focused concept, weak-relationship state, mobile/tablet
breakpoint). First run establishes the baseline; re-runs diff against it.
**Do not blindly accept a snapshot update** — open the diff image and
visually confirm it before approving, per the same skill doc's testing
rules.

## Group B — requires a real Supabase project (layout persistence only)

### B1. Provision

Same Supabase project from Phase 1's `quickstart.md` Group B1 (this
feature reuses it, no new service). Apply
`supabase/migrations/0002_graph_layouts.sql` via `supabase db push`.

### B2. Layout preference survives a reload (spec FR-007, SC-005)

```bash
npm run dev
#   1. Open a course's atlas, collapse one unit, drag one concept node
#   2. Reload the page
```

**Expected outcome**: the same unit is still collapsed and the moved
concept is still at its new position — proving it was read from
`graph_layouts`, not held only in client memory (same durability proof
pattern as Phase 1's artifact status).
