---

description: "Task list template for feature implementation"
---

# Tasks: Concept Atlas Renderer

**Input**: Design documents from `/specs/003-concept-atlas-renderer/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/layout-actions.md, quickstart.md

**Tests**: Included. Unlike Phase 1, most of this feature is fully
testable without live credentials — the adapter/layout-preference logic
gets `node --test` unit tests, and rendering itself gets Playwright visual
regression against the checked-in fixture. Only the layout-preference
server actions' live database round-trip waits for Phase 1's still-open
Supabase credential gap (quickstart.md Group B).

**Organization**: Tasks are grouped by user story (spec.md priorities:
US1/US2 = P1, US3/US4 = P2, US5 = P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US5)
- Every task includes its exact file path

## Path Conventions

Single Next.js project (per plan.md's Project Structure):
`src/types/graph/`, `src/features/concept-atlas/`, `src/app/courses/[courseId]/atlas/`,
`tests/unit/concept-atlas/`, `tests/visual/`.

---

## Phase 1: Setup

- [X] T001 Add `@xyflow/react` and `elkjs` to `package.json` dependencies
  (`npm install @xyflow/react elkjs`)
- [X] T002 [P] Create `src/types/graph/`, `src/features/concept-atlas/adapters/`,
  `src/features/concept-atlas/components/`, `src/app/courses/[courseId]/atlas/`,
  and `tests/unit/concept-atlas/` directories

**Checkpoint**: Dependencies declared, directories exist, no code yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The renderer-neutral DTO every user story renders from.

**⚠️ CRITICAL**: No user story task can begin until T003 is complete.

- [X] T003 Implement the `CourseGraph`/`Unit`/`Concept`/`Relationship` types
  in `src/types/graph/course-graph.ts`, exactly per data-model.md's DTO
  tables — no coordinate, style, or renderer-specific field anywhere in
  these types (Constitution Principle I)

**Checkpoint**: Canonical DTO ready; adapter/component work can begin.

---

## Phase 3: User Story 1 - See the whole course as a map, not a list (Priority: P1) 🎯 MVP

**Goal**: Load the demo fixture and render it as bounded unit regions with
mastery-encoded concept nodes and typed, cross-unit-aware relationship
edges.

**Independent Test**: load `tests/fixtures/concept-atlas-demo.json` and
confirm every unit renders as a bounded region, every relationship draws
between the correct two concepts, and the layout has zero overlapping
nodes.

**Depends on**: Phase 2 (T003).

### Tests for User Story 1

> Write first; confirm failing before implementation.

- [X] T004 [P] [US1] Write `tests/unit/concept-atlas/react-flow-adapter.test.ts`:
  given the demo fixture's `CourseGraph`, the adapter produces exactly one
  React Flow node per concept and exactly one edge per relationship
  (including the fixture's two intentional duplicate-edge pairs producing
  *two* separate edges, not one merged edge — spec FR-014); every node
  carries its concept's `masteryState`; every edge carries its
  relationship's `type`, `learnerState`, and `crossUnit` flag
- [X] T005 [US1] Run `node --test tests/unit/concept-atlas/react-flow-adapter.test.ts`
  — expect FAIL (module not found)

### Implementation for User Story 1

- [X] T006 [US1] Implement `src/features/concept-atlas/adapters/react-flow-adapter.ts`:
  converts a `CourseGraph` + ELK-computed positions into `@xyflow/react`
  `Node[]`/`Edge[]`, per data-model.md's "React Flow adapter output"
  section — this is the ONLY place in the codebase where a `CourseGraph`
  concept/relationship gets a coordinate attached — depends on T003
- [X] T007 [US1] Run `node --test tests/unit/concept-atlas/react-flow-adapter.test.ts`
  — expect PASS
- [X] T008 [P] [US1] Implement `src/features/concept-atlas/components/ConceptNode.tsx`:
  custom React Flow node rendering `masteryState` via the redundant
  ring+color+label encoding from
  `.claude/skills/concept-atlas/references/visual-language.md`'s table
  (dashed/gray "Unverified", thin blue "Exposed", thin amber "Weak", thick
  green "Solid")
- [X] T009 [P] [US1] Implement `src/features/concept-atlas/components/RelationshipEdge.tsx`:
  custom React Flow edge rendering relationship `type` via line style
  (not color alone) plus an inline label, and `crossUnit` via a visually
  distinct stroke from within-unit edges, per `visual-language.md`
- [X] T010 [US1] Implement `src/features/concept-atlas/components/ConceptAtlas.tsx`:
  top-level client component — runs ELK layout (research.md's worker
  approach) on mount, renders unit regions as bounded containers (React
  Flow sub-flow/group nodes) with `ConceptNode`s inside and
  `RelationshipEdge`s between them — depends on T006, T008, T009
- [X] T011 [US1] Implement `src/app/courses/[courseId]/atlas/page.tsx`:
  loads `tests/fixtures/concept-atlas-demo.json` as the `CourseGraph` (per
  spec.md Assumptions — real per-course data is `course-graph-ingestion`'s
  job) and renders `ConceptAtlas` — depends on T010
- [X] T012 [P] [US1] Write `tests/visual/concept-atlas.spec.ts`'s first
  screenshot: whole-course atlas, per
  `.claude/skills/concept-atlas/references/testing.md`'s required list —
  depends on T011
- [X] T013 [US1] Run `npx playwright test tests/visual/concept-atlas.spec.ts`
  — expect the whole-course-atlas screenshot to establish a baseline with
  zero overlapping/clipped nodes (spec SC-001)

**Checkpoint**: The whole-course map renders correctly against the
fixture. This is the MVP — a student can see a course as a map for the
first time.

---

## Phase 4: User Story 2 - Expand a unit to see its concepts in detail (Priority: P1)

**Goal**: Units collapse/expand independently, and the student's choice
persists across visits.

**Independent Test**: expand one unit, confirm siblings stay put; reload
the page (once Group B credentials exist), confirm the expand state
survived.

**Depends on**: Phase 3 (US1) — needs `ConceptAtlas` to exist to add
expand/collapse interaction to.

### Tests for User Story 2

- [X] T014 [P] [US2] Write `tests/unit/concept-atlas/layout-preference.test.ts`:
  a merge helper correctly overlays saved `graph_layouts` entries onto
  ELK-computed default positions without mutating the input; a unit with
  no saved preference defaults to **expanded, not collapsed** (corrected
  from this task's original wording during implementation — US1's
  already-accepted `whole-course-atlas.png` baseline shows every unit
  expanded with no saved preference, so that behavior is the fixed point;
  matching it, not `interaction-states.md`'s more general "Default"
  wording, is what keeps this story from silently breaking US1's
  screenshot); collapsing one unit produces layout entries for only that
  unit's entity id, never touching sibling units' entries
- [X] T015 [US2] Run `node --test tests/unit/concept-atlas/layout-preference.test.ts`
  — expect FAIL

### Implementation for User Story 2

- [X] T016 [US2] Write `supabase/migrations/0002_graph_layouts.sql`: the
  `graph_layouts` table with RLS, exactly per data-model.md's column/policy
  table (owner can `SELECT`/`INSERT`/`UPDATE` their own rows directly —
  unlike Phase 1's artifact tables, this is the student's own view state)
- [X] T017 [US2] Implement `src/features/concept-atlas/layout-preference.ts`:
  the pure merge/validation helper tested in T014 — depends on T003
- [X] T018 [US2] Run `node --test tests/unit/concept-atlas/layout-preference.test.ts`
  — expect PASS
- [X] T019 [US2] Implement `getLayoutPreference`/`saveLayoutPreference`
  server actions in `src/features/concept-atlas/actions.ts` per
  contracts/layout-actions.md — depends on T016
- [X] T020 [US2] Wire expand/collapse interaction into `ConceptAtlas.tsx`:
  clicking a unit toggles its collapsed state, calls `saveLayoutPreference`
  debounced (not on every interaction), and sibling units do not reflow
  unless space requires it (spec FR-006) — depends on T009 (from US1),
  T017, T019
- [X] T021 [P] [US2] Add the expanded-unit screenshot to
  `tests/visual/concept-atlas.spec.ts` — depends on T020

**Checkpoint**: Units expand/collapse independently and the preference is
code-complete for persistence; live round-trip verification waits for
`quickstart.md` Group B2.

---

## Phase 5: User Story 3 - Inspect one concept without losing the map (Priority: P2)

**Goal**: Clicking a concept opens a stable detail view; the rest of the
map dims but doesn't rearrange or disappear.

**Independent Test**: click a concept, confirm the detail view shows its
canonical name/aliases/mastery/relationships and the map underneath stays
in place; close it, confirm the map is unchanged.

**Depends on**: Phase 3 (US1) — needs concepts rendered to click on.

### Implementation for User Story 3

- [X] T022 [US3] Implement `src/features/concept-atlas/components/ConceptDetailPanel.tsx`:
  a responsive container (side panel on desktop, bottom sheet on
  mobile/tablet via CSS per research.md's "same component, different
  container" decision) showing canonical label, aliases, mastery state,
  and relationships for a focused concept
- [X] T023 [US3] Wire concept-click interaction into `ConceptAtlas.tsx`:
  clicking a `ConceptNode` opens `ConceptDetailPanel` for that concept and
  visually de-emphasizes (dims, doesn't hide) unrelated nodes/edges (spec
  FR-008, FR-009); closing it returns to the prior view with no
  repositioning (spec FR-010) — depends on T010, T022
- [X] T024 [P] [US3] Add the focused-concept screenshot (detail panel
  open) to `tests/visual/concept-atlas.spec.ts` — depends on T023

**Checkpoint**: Concept inspection works without disturbing the map.

---

## Phase 6: User Story 4 - Recognize which connections are still weak (Priority: P2)

**Goal**: Weak relationships are visually distinguishable using more than
one cue, and clicking one explains why it's rated weak.

**Independent Test**: load the fixture (which has both weak and strong
relationships), confirm weak ones are distinguishable without relying on
color alone; click one, confirm an explanation appears.

**Depends on**: Phase 3 (US1, `RelationshipEdge` already encodes
`learnerState`) and Phase 5 (US3, reuses the same detail-panel/dim
interaction pattern for a focused relationship instead of a focused
concept).

### Implementation for User Story 4

- [X] T025 [US4] Extend `RelationshipEdge.tsx` (from US1/T009) so a `weak`
  `learnerState` renders with both reduced opacity AND a distinct stroke
  pattern together, never opacity alone (spec FR-005) — already satisfied
  by T009; verified, no code change needed
- [X] T026 [US4] Extend `ConceptDetailPanel.tsx` (from US3/T022) to also
  accept a focused *relationship* (not only a concept), showing its type,
  label, and the evidence/reasoning behind a weak rating (spec FR-011) —
  depends on T022
- [X] T027 [US4] Wire relationship-click interaction into `ConceptAtlas.tsx`:
  clicking a `RelationshipEdge` opens the extended detail panel and dims
  unrelated content, same pattern as concept focus — depends on T023, T026
- [X] T028 [P] [US4] Add the weak-relationship-state screenshot to
  `tests/visual/concept-atlas.spec.ts` — depends on T027. Took three real
  bugs to get right (see research.md): (1) a bent edge path's own
  bounding-box center often isn't on the stroke, so click targeting moved
  to the edge's label instead; (2) React Flow paints `.react-flow__edges`
  above `.react-flow__edgelabel-renderer` by default, so a label's own
  edge always intercepted clicks meant for it — fixed with a CSS
  `z-index` override; (3) React Flow's `onEdgeClick` prop uses
  distance-to-path hit testing on the pane (not DOM targeting), so
  wiring it alongside the label's own click handler double-fired
  `focusRelationship` per click, toggling the focus target right back to
  `null` — fixed by dropping the redundant `onEdgeClick` prop and
  keeping only the label handler.

**Checkpoint**: Weak relationships are identifiable and explainable, not
just visually different for no stated reason.

---

## Phase 7: User Story 5 - Use the atlas on a tablet or phone (Priority: P3)

**Goal**: The atlas stays usable at tablet/phone viewport widths.

**Independent Test**: view the fixture at a tablet/phone-sized viewport,
confirm the atlas is still navigable and the detail view is reachable.

**Depends on**: Phase 3 (US1) and Phase 5 (US3, the detail panel's
responsive container was already built there — this story mainly verifies
and closes gaps in the canvas layout itself).

### Implementation for User Story 5

- [ ] T029 [US5] Add a responsive breakpoint to `ConceptAtlas.tsx`: below
  a tablet-width threshold, unit regions stack and/or the canvas becomes
  pan/zoom-primary rather than rendering the desktop grid layout (spec
  FR-013) — depends on T010
- [ ] T030 [P] [US5] Add the mobile/tablet-breakpoint screenshot to
  `tests/visual/concept-atlas.spec.ts` — depends on T029, T022 (detail
  panel's responsive container, to confirm it also renders correctly at
  this breakpoint)

**Checkpoint**: All 5 required screenshots from
`.claude/skills/concept-atlas/references/testing.md` now exist.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T031 Run `npm run typecheck` across the whole repository — expect
  PASS with no regressions outside this feature
- [ ] T032 Run `npm run test:unit` — expect PASS (Phases 0-1's existing
  tests plus this feature's adapter/layout-preference tests)
- [ ] T033 Run the full `tests/visual/concept-atlas.spec.ts` suite (all 5
  screenshots) and manually open each diff image before accepting any
  baseline — per `.claude/skills/concept-atlas/references/testing.md`'s
  "never approve blindly" rule
- [ ] T034 Walk through `quickstart.md` Group A (A1-A3) end to end and
  confirm every expected outcome holds; re-read Group B against final file
  paths for accuracy (same T025-style check as Phase 1) without needing
  live credentials to confirm the instructions themselves are correct

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational only — this is the
  MVP and the dependency root for every other story.
- **User Story 2 (Phase 4)**: Depends on US1 (extends `ConceptAtlas`).
- **User Story 3 (Phase 5)**: Depends on US1 (extends `ConceptAtlas`,
  independent of US2).
- **User Story 4 (Phase 6)**: Depends on US1 (extends `RelationshipEdge`)
  AND US3 (reuses the detail-panel/dim pattern) — the one place this
  feature has a two-story dependency, called out explicitly.
- **User Story 5 (Phase 7)**: Depends on US1 (canvas) and US3 (responsive
  detail panel already built there).
- **Polish (Phase 8)**: Depends on all five user stories.

### Within Each User Story

- US1: adapter test-first (T004-T007), then node/edge/canvas components in
  parallel where files don't overlap (T008, T009), then the page that
  wires them together (T010, T011), then its screenshot (T012-T013).
- US2: layout-preference logic test-first (T014-T018), then the migration
  and server actions (T016, T019), then wiring into `ConceptAtlas`
  (T020), then its screenshot (T021).
- US3: component then wiring then screenshot (T022-T024) — no test-first
  split here since this is interaction wiring over already-tested pieces,
  not new pure logic.
- US4: same pattern, extending US1/US3's pieces rather than building new
  ones from scratch (T025-T028).
- US5: same pattern (T029-T030).

### Parallel Opportunities

- T008 and T009 (ConceptNode, RelationshipEdge) in parallel once T006
  exists — different files, no dependency on each other.
- Each story's final screenshot task ([P]-marked) can be written in
  parallel with the next story's early work, though running Playwright
  itself should happen after each story's interaction wiring is done.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (T003 — blocks everything)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: the whole-course map renders correctly against
   the fixture, zero overlapping nodes, `npm run typecheck` and the
   adapter's unit tests both pass
5. This alone delivers the PRD's central differentiator — students seeing
   the big picture — even before expand/collapse, detail panels, or weak-
   relationship explanations exist

### Incremental Delivery

1. Setup + Foundational → DTO ready
2. US1 → whole-course map renders (MVP)
3. US2 → units expand/collapse, layout preference persists
4. US3 → concept inspection without losing the map
5. US4 → weak relationships are identifiable and explainable
6. US5 → tablet/phone usable
7. Polish → full test suite, all 5 required screenshots reviewed by eye

### Solo Build Note

Same as Phases 0-1: `[P]` markers mark ordering-independence, not
parallel staffing. Commit after each task or tight cluster, solo-authored,
no AI co-author trailer, per project convention.

---

## Notes

- Tests are included for the pure-logic pieces (adapter, layout-
  preference) because they don't need a browser or live credentials to
  verify — visual regression covers the rendering rules that unit tests
  can't meaningfully check (overlap, color, redundant encoding).
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that
  aren't called out explicitly (US4's dependency on both US1 and US3 is
  documented above, not hidden).
