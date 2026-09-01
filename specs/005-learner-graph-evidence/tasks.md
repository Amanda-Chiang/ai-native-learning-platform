---

description: "Task list template for feature implementation"
---

# Tasks: Learner Graph Evidence

**Input**: Design documents from `/specs/005-learner-graph-evidence/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/evidence-actions.md, quickstart.md

**Tests**: Included. This feature's entire value is one pure algorithm
(`computeLearnerState`) — every FR in spec.md is really a claim about
that one function's behavior, so it gets exhaustive `node --test`
coverage test-first, same reasoning already applied to
`concept-atlas-renderer`'s adapter and `course-graph-ingestion`'s
reconciliation logic.

**Organization**: Tasks are grouped by user story (spec.md priorities:
US1/US2 = P1, US3/US4 = P2, US5 = P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US5)
- Every task includes its exact file path

## Path Conventions

Single Next.js project (per plan.md's Project Structure):
`src/features/learner-graph-evidence/`, `supabase/migrations/`,
`tests/unit/learner-graph-evidence/`.

---

## Phase 1: Setup

- [ ] T001 [P] Create `src/features/learner-graph-evidence/evidence-weights.ts`
  per data-model.md's `EvidenceWeights` type: default `strengthByType`
  values with `exposure` set strictly below `tierCutoffs.exposed` (the
  structural enforcement of Constitution Principle III — research.md),
  `recencyHalfLifeDays`, `independentAssistanceLevelMax`,
  `independenceFactorWhenAssisted`, `tierCutoffs`,
  `misconceptionThreshold: 2` (spec.md Assumptions — labeled as a
  starting parameter in a code comment, not presented as calibrated)

**Checkpoint**: The algorithm's tunable numbers live in one place, before
any code reads them.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema and shared types every user story writes to or reads
from. No user story can be implemented before this phase completes.

- [ ] T002 Write `supabase/migrations/0004_learner_evidence.sql` per
  data-model.md: `evidence_events`, `learner_concept_state`,
  `learner_edge_state`, all columns/check constraints as specified
  (including the "at least one target" and "has an origin" checks
  mirroring `isEvidenceEvent`'s existing runtime rules) — RLS keyed on
  `user_id = auth.uid()`, NOT `owner_id` (research.md — deliberately
  different from every prior migration in this project)
- [ ] T003 Push the migration (`npx supabase db push`) and verify RLS: an
  anon-key query against each new table returns `status=200, rows=0` for
  a signed-out session — do not proceed until confirmed against the live
  project
- [ ] T004 [P] Extend `src/lib/supabase/database.types.ts` with
  `EvidenceEventRow`, `LearnerConceptStateRow`, `LearnerEdgeStateRow`
  row/insert/update types, same pattern used for every prior table

**Checkpoint**: Schema live and RLS-verified. No algorithm code yet.

---

## Phase 3: User Story 1 - Independent evidence moves a student's understanding forward (Priority: P1)

**Goal**: Committing strong, independent evidence for a concept or edge
measurably strengthens its tracked state, readable back immediately.

**Independent Test**: Commit one strong, independent, correct piece of
evidence for a concept with no prior evidence; confirm its tracked state
moves up and that reading it back reflects the change immediately
(spec.md).

**Depends on**: Phase 2 (schema, `EvidenceWeights`).

### Implementation for User Story 1

- [ ] T005 [P] [US1] Write
  `tests/unit/learner-graph-evidence/compute-learner-state.test.ts`
  (test-first): an empty event list returns the FR-010 baseline exactly
  (`"unverified"`/`score: 0`/no misconception/`contributingFactors: []`);
  one independent (`assistanceLevel` at or below
  `independentAssistanceLevelMax`), correct, high-`graderConfidence`
  retrieval event with no prior evidence produces a tier above
  `"exposed"`; a later correct application event on the same target
  strengthens the score further rather than flattening or resetting it;
  a relationship's computed state responds only to events targeting its
  own `edgeIds`, not events targeting either endpoint concept's
  `conceptIds` alone (FR-005)
- [ ] T006 [US1] Create `src/features/learner-graph-evidence/compute-learner-state.ts`
  per data-model.md: `computeLearnerState(events, now, weights)` —
  per-event `evidenceStrength * recencyDecay * independenceFactor * graderConfidence * difficultyFactor`,
  weighted-averaged into `score`, `score` mapped to a tier via
  `weights.tierCutoffs`; `contributingFactors` logs every component per
  event, not just the final number (FR-006); make T005 pass
- [ ] T007 [P] [US1] Write
  `tests/unit/learner-graph-evidence/commit-evidence-validation.test.ts`:
  a pure validation helper (extracted the same way
  `course-graph-ingestion/flag-validation.ts` was, since `actions.ts`
  will be `"use server"` and can only export async functions) rejects
  input targeting zero concepts and zero edges, matching
  `isEvidenceEvent`'s existing "at least one target" rule, before any
  database call happens
- [ ] T008 [US1] Create `src/features/learner-graph-evidence/commit-evidence-validation.ts`:
  the pure validator T007 tests, reusing `isEvidenceEvent`'s existing
  shape checks from `src/types/domain/evidence-event.ts` rather than
  reimplementing them
- [ ] T009 [US1] Create `src/features/learner-graph-evidence/actions.ts`
  with `commitEvidence` per contracts/evidence-actions.md: validates via
  T008, inserts the `evidence_events` row, then for every targeted
  concept/edge id re-reads that (student, target)'s full evidence
  history and upserts `learner_concept_state`/`learner_edge_state` via
  `computeLearnerState` — the evidence insert and every state upsert
  happen in one operation (Constitution Principle II); rejects a
  `conceptIds`/`edgeIds` entry that doesn't resolve to a real row in the
  course (FR-007) before writing anything
- [ ] T010 [US1] In `actions.ts`: `getConceptState(courseId, conceptId)`
  and `getEdgeState(courseId, edgeId)` per contracts/evidence-actions.md
  — RLS-scoped reads (no `userId` parameter accepted), returning the
  FR-010 baseline via the same `computeLearnerState` codepath when no
  `learner_concept_state`/`learner_edge_state` row exists yet (not a
  separately-coded default)

**Checkpoint**: Evidence can be committed and read back correctly. This
is the MVP — every other story either verifies a property of this
mechanism or makes its result visible.

---

## Phase 4: User Story 2 - Exposure alone never fabricates mastery (Priority: P1)

**Goal**: Prove, exhaustively, that no exposure-only evidence sequence
can move a concept's or edge's tier above `"exposed"` — the product's
core trust guarantee (Constitution Principle III).

**Independent Test**: Record only exposure-tier evidence for a concept,
repeatedly, across many separate events; confirm its tracked state never
crosses out of `"exposed"` no matter how many exposure events accumulate
(spec.md).

**Depends on**: User Story 1 (the mechanism this story verifies already
exists — this story adds no new production code path, only proves the
structural guarantee research.md and plan.md's Constitution Check
already claim, and guards it against regression).

### Implementation for User Story 2

- [ ] T011 [P] [US2] Write
  `tests/unit/learner-graph-evidence/exposure-never-exceeds-exposed.test.ts`:
  50 synthetic exposure-type events (varying recency, confidence,
  difficulty) targeting one concept all resolve to `"exposed"`, never
  higher (spec.md SC-001, at that exact scale); the edge-level
  equivalent — `LearnerRelationshipState` only has `"weak"`/`"strong"`,
  no separate "exposed" value, so the correct claim there is that
  exposure-only edge evidence never reaches `"strong"` (FR-003's actual
  edge-level guarantee); an exposure event arriving AFTER a concept
  already reached `"weak"`/`"solid"` from real evidence does not
  downgrade it (spec.md US2 Acceptance Scenario 3)
- [ ] T012 [US2] Write
  `tests/unit/learner-graph-evidence/evidence-weights-invariant.test.ts`:
  a structural guard directly on the `evidence-weights.ts` config object
  itself — `strengthByType.exposure < tierCutoffs.exposed` — so that if
  a future edit to the weights ever violates Constitution Principle III,
  this test fails immediately and specifically, not just indirectly via
  T011's behavioral tests (belt-and-suspenders on a hard invariant, same
  reasoning as `course-graph-ingestion`'s database-level self-reference
  check backing up its application-level one)

**Checkpoint**: Constitution Principle III is proven, not just designed
for, and protected against silent regression.

---

## Phase 5: User Story 3 - The concept atlas shows what a student has actually demonstrated (Priority: P2)

**Goal**: The rendered atlas reflects each viewing student's real tracked
state wherever evidence exists, and the FR-010 baseline everywhere else.

**Independent Test**: With evidence already recorded strengthening one
concept and leaving another untouched, open the atlas and confirm the
two concepts render with visibly different, correct states (spec.md).

**Depends on**: User Story 1 (there must be real state to overlay).

### Implementation for User Story 3

- [ ] T013 [P] [US3] Write
  `tests/unit/learner-graph-evidence/apply-learner-state.test.ts`: a
  concept present in the state map is overlaid with its real
  `masteryState`; a concept absent from the map keeps the input graph's
  original (baseline) `masteryState` unchanged; the same for edges'
  `learnerState`/`explanation`; the input `CourseGraph` object is not
  mutated (returns a new object)
- [ ] T014 [US3] Create `src/features/learner-graph-evidence/apply-learner-state.ts`
  per data-model.md: `applyLearnerState(graph, conceptStates, edgeStates)`
  — pure, no Supabase call; make T013 pass
- [ ] T015 [US3] In `actions.ts`: `getCourseGraphForLearner(courseId)` per
  contracts/evidence-actions.md — calls `course-graph-ingestion`'s
  existing `getCourseGraph(courseId)` unchanged, reads the calling
  student's `learner_concept_state`/`learner_edge_state` rows for that
  course, and passes both through `applyLearnerState`
- [ ] T016 [US3] Update `src/app/courses/[courseId]/atlas/page.tsx` to
  call `getCourseGraphForLearner` instead of `course-graph-ingestion`'s
  `getCourseGraph` directly for non-`"demo"` courses — the `"demo"`
  fixture special case (concept-atlas-renderer's own Playwright
  baselines) is unaffected, since fixture data never has real evidence
  to overlay

**Checkpoint**: A student's real progress is visible in the atlas for
the first time — this is where the evidence mechanism stops being an
invisible database change.

---

## Phase 6: User Story 4 - A student can see why a concept is rated the way it is (Priority: P2)

**Goal**: Opening a concept's or relationship's detail view surfaces the
evidence that produced its current state, or says plainly that none
exists yet.

**Independent Test**: Open the detail view for a concept with recorded
evidence and confirm the most recent contributing evidence is visible;
open it for a concept with no evidence and confirm it says so plainly
(spec.md).

**Depends on**: User Story 1 (real evidence to show) and reuses User
Story 3's rendering surface (`ConceptDetailPanel`).

### Implementation for User Story 4

- [ ] T017 [US4] Extend `FocusedConcept`/`FocusedRelationship` in
  `src/features/concept-atlas/components/ConceptDetailPanel.tsx` with an
  optional `evidenceProvenance?: { lastEvidenceType: EvidenceType; lastEvidenceAt: string } | null`
  field — `null` explicitly means "no evidence recorded yet" (FR-014's
  "state plainly," never a fabricated-sounding placeholder string
  standing in for absence of data); render it in both `ConceptDetail`
  and `RelationshipDetail` alongside the existing mastery/status display
- [ ] T018 [US4] In `src/features/concept-atlas/components/ConceptAtlas.tsx`'s
  `buildFocused`: accept an optional `getEvidenceProvenance` prop
  (mirrors the `onFlag` optional-prop pattern already used for
  `course-graph-ingestion`'s student-flag wiring — this renderer feature
  stays unaware of `learner-graph-evidence` by name, Constitution
  Principle I) and populate `evidenceProvenance` from it when focusing a
  concept/relationship
- [ ] T019 [US4] Wire `src/app/courses/[courseId]/atlas/page.tsx` to pass
  a function backed by `getConceptState`/`getEdgeState`
  (contracts/evidence-actions.md) as `ConceptAtlas`'s new provenance
  prop
- [ ] T020 [P] [US4] Update `tests/visual/concept-atlas.spec.ts`'s
  `focused-concept.png`/`weak-relationship.png` scenarios (or add a new
  scenario if evidence provenance materially changes the panel's layout)
  to cover a concept/relationship with real evidence provenance
  displayed — open the diff before accepting any baseline change, per
  this project's standing "never approve blindly" rule

**Checkpoint**: State is no longer a black box — a student can trace any
tier back to something real, or see plainly that nothing's been
recorded yet.

---

## Phase 7: User Story 5 - Repeated confident wrong answers surface as a misconception, not silence (Priority: P3)

**Goal**: Two or more confident, incorrect, independent responses on the
same concept produce a distinct, visible misconception signal that a
later strong correct response resolves.

**Independent Test**: Record two or more confident incorrect responses
for the same concept; confirm it carries a distinct "unresolved
misconception" signal, separate from its ordinary mastery tier (spec.md).

**Depends on**: User Story 1 (the detection logic ships as part of
`computeLearnerState`'s design in data-model.md — this story adds
exhaustive verification of it plus the first UI surface for it, not new
detection logic).

### Implementation for User Story 5

- [ ] T021 [P] [US5] Write
  `tests/unit/learner-graph-evidence/misconception-detection.test.ts`:
  one confident incorrect independent event alone does NOT set
  `hasUnresolvedMisconception` (spec.md US5 Acceptance Scenario 3); a
  second confident incorrect independent event on the same target DOES
  (`weights.misconceptionThreshold`, currently 2); a subsequent strong
  correct independent event after both clears it back to `false`
  (FR-012); a non-confident incorrect event does not count toward the
  threshold
- [ ] T022 [US5] If T021 finds a gap against `compute-learner-state.ts`'s
  T006 implementation, close it there — this task exists to make the
  detection logic actually match data-model.md's documented behavior
  exactly, not to add a parallel implementation
- [ ] T023 [US5] Add `hasUnresolvedMisconception?: boolean` to `Concept`
  in `src/types/graph/course-graph.ts` (the renderer-neutral DTO —
  same kind of small, targeted addition `concept-atlas-renderer` already
  made for `Relationship.explanation` during its own US4); update
  `applyLearnerState` (T014) to set it from `learner_concept_state`
- [ ] T024 [US5] Add a misconception badge to
  `src/features/concept-atlas/components/ConceptNode.tsx` (PRD §13.9:
  "Node badge: unresolved misconception or explicit annotation signal")
  — visible only when `data.hasUnresolvedMisconception` is true, and
  update `courseGraphToReactFlowElements`
  (`src/features/concept-atlas/adapters/react-flow-adapter.ts`) to pass
  the field through to node `data`
- [ ] T025 [P] [US5] Add a `tests/visual/concept-atlas.spec.ts` scenario
  (or extend an existing fixture) covering a concept with the
  misconception badge visible, reviewed by eye before accepting the
  baseline

**Checkpoint**: All five user stories complete. A student's demonstrated
understanding, its absence, and its specific unresolved confusions are
all visible, evidence-backed, and traceable.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T026 Run `npm run typecheck` across the whole repository — expect
  PASS with no regressions outside this feature
- [ ] T027 Run `npm run test:unit` — expect PASS (all prior phases' tests
  plus this feature's compute-learner-state/commit-evidence-validation/
  apply-learner-state/misconception-detection/evidence-weights-invariant
  tests)
- [ ] T028 Run the full `tests/visual` suite (`concept-atlas-renderer`'s
  existing suite plus `course-graph-ingestion`'s) and manually open every
  new/changed diff image before accepting any baseline
- [ ] T029 Walk through `quickstart.md` Groups A and B end to end; B2's
  "a second signed-in account sees only the baseline" isolation check
  (SC-005) must be actually confirmed against the live project before
  this feature is called done, not assumed from the RLS policy text
  alone

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational only — the MVP:
  commit evidence, read it back correctly.
- **User Story 2 (Phase 4)**: Depends on US1 (verifies a property of the
  mechanism US1 built; adds no new production code path of its own).
- **User Story 3 (Phase 5)**: Depends on US1 (real state to overlay).
- **User Story 4 (Phase 6)**: Depends on US1 AND US3 (reuses US3's
  rendering surface — the one place this feature has a two-story
  dependency, called out explicitly, same as
  `course-graph-ingestion`'s US4 did).
- **User Story 5 (Phase 7)**: Depends on US1 (detection logic already
  exists there by design) and, for its UI task (T024), on US3's
  rendering wiring existing.
- **Polish (Phase 8)**: Depends on all five user stories.

### Within Each User Story

- US1: test-first pure-function work (T005/T006), then the
  extracted-for-testability validator (T007/T008, same file-splitting
  reasoning `course-graph-ingestion/flag-validation.ts` already
  established for `"use server"` files), then the server actions that
  compose them (T009/T010, same file, sequential).
- US2: pure verification against US1's already-built mechanism — no
  sequencing concern, both tasks are tests.
- US3: test-first pure overlay function (T013/T014), then the server
  action composing it with `course-graph-ingestion`'s existing read
  (T015), then the page wiring (T016).
- US4: DTO/panel extension (T017), then `ConceptAtlas`'s optional-prop
  wiring (T018, mirrors `course-graph-ingestion`'s `onFlag` pattern),
  then the page (T019), then its screenshot (T020).
- US5: test-first detection verification (T021), close any gap found
  (T022), then the DTO/badge UI surface (T023/T024), then its screenshot
  (T025).

### Parallel Opportunities

- T001 (weights config) has no dependency on the migration and could
  start immediately.
- T004 (database types) and T005 (US1's test file) can both start once
  T002/T003 land, independently of each other.
- T007 (US1's validator test) and T005 (US1's algorithm test) are
  different files with no dependency on each other.
- T011/T012 (US2) can both be written in parallel with each other once
  US1 lands — different files, both read-only verification.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (T002-T003 — blocks everything; must be
   verified live against Supabase, not just written)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: commit one real piece of strong evidence,
   confirm `getConceptState` reflects it immediately, `npm run
   typecheck` and this story's unit tests both pass
5. This alone proves the core evidence mechanism works before any
   rendering, provenance UI, or misconception detection exists

### Incremental Delivery

1. Setup + Foundational → schema live, algorithm config in place
2. US1 → evidence commits produce correct state (MVP)
3. US2 → the product's core trust guarantee is proven, not just designed
4. US3 → the atlas shows real progress for the first time
5. US4 → state is traceable to real evidence, not a black box
6. US5 → unresolved misconceptions are visible, not silently buried
7. Polish → full test suite, live isolation check, quickstart walkthrough

### Solo Build Note

Same as every prior feature: `[P]` markers mark ordering-independence,
not parallel staffing. Commit after each task or tight cluster,
solo-authored, no AI co-author trailer, per project convention.

---

## Notes

- US2 and part of US5 (T021) are deliberately verification-only stories
  with no new production code path — called out explicitly in each
  story's Goal/Depends-on rather than left to look like padding. The
  underlying mechanism is built once, correctly, in US1
  (`compute-learner-state.ts`); these stories exist because "the
  mechanism exists" and "the mechanism is proven, exhaustively, to hold
  under the specific guarantees the Constitution requires" are different
  claims, and this project's standing practice (per
  `course-graph-ingestion`'s T025 in its own tasks.md) is to make that
  distinction explicit rather than pretend every task added new code.
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that
  aren't called out explicitly (US4's dependency on both US1 and US3,
  and US5's UI task's dependency on US3, are documented above, not
  hidden).
