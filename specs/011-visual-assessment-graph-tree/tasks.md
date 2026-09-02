---

description: "Task list template for feature implementation"
---

# Tasks: Visual Assessment (Graph/Tree)

**Input**: Design documents from `/specs/011-visual-assessment-graph-tree/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/visual-assessment-actions.md, quickstart.md

**Tests**: Included. Same split as every prior feature: pure/mechanical
logic (stripping/merging checker-input fields, graph/tree layout) gets
exhaustive `node --test` coverage test-first; the one genuinely new
external call (vision extraction) is verified live per quickstart.md,
since a vision call can't be meaningfully faked without losing the
point of using a real one -- same reasoning `deterministic-grading`'s
own E2B sandbox grader already established.

**Organization**: Tasks are grouped by user story (spec.md priorities:
US1 = P1, US2 = P2, US3 = P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US3)
- Every task includes its exact file path

## Path Conventions

Single Next.js project (per plan.md's Project Structure):
`src/features/visual-assessment/`,
`src/app/courses/[courseId]/visual-assessment/`,
`tests/unit/visual-assessment/`. One new migration (Storage bucket
only, no new table), no new npm dependency.

---

## Phase 1: Setup

- [x] T001 [P] Write
  `supabase/migrations/0009_visual_assessment_storage.sql` per
  data-model.md: the `assessment-drawings` Storage bucket (private,
  `user_id`-keyed RLS on `storage.objects`), same shape
  `course-artifacts`'s own bucket already established -- no new table.

**Checkpoint**: The one new piece of infrastructure exists before
anything uploads to it.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The two pure mechanisms every user story depends on --
rendering a question safely (without leaking its answer) and
reassembling a full checker input before grading. No user story can be
implemented before this phase completes.

- [x] T002 Push the migration (`npx supabase db push`) and verify live:
  the `assessment-drawings` bucket exists, private; an anon-key upload
  attempt outside a real user's own folder path is rejected by RLS --
  do not proceed until confirmed against the live project
- [x] T003 [P] Write
  `tests/unit/visual-assessment/problem-setup.test.ts` (test-first):
  given a real `bfs-dfs` checkerInput with a `claimedOrder` field,
  `extractProblemSetup` returns everything except `claimedOrder`;
  given a `shortest-path` input, it strips both `claimedPath` and
  `claimedTotalDistance`
- [x] T004 Create `src/features/visual-assessment/problem-setup.ts`
  per data-model.md: `CheckerDomain`, `extractProblemSetup`,
  `CLAIM_FIELD_NAMES`; make T003 pass
- [x] T005 [P] Write
  `tests/unit/visual-assessment/merge-structure.test.ts` (test-first):
  merging a problem setup with a confirmed set of claim fields
  produces an object structurally identical to a real,
  hand-constructed full `checkerInput` for that domain
- [x] T006 Create `src/features/visual-assessment/merge-structure.ts`
  per data-model.md: `mergeStructure`; make T005 pass

**Checkpoint**: A question's real structure can be safely stripped for
rendering and safely reassembled for grading, proven against
constructed fixtures, before any rendering or grading code depends on
either.

---

## Phase 3: User Story 1 - Draw an answer and have it graded exactly (Priority: P1)

**Goal**: A student sees a real graph/tree question rendered from its
real structure, draws a response, and gets back a real grading result
from the same existing deterministic checker already used for that
domain.

**Independent Test**: Submit an objectively correct drawn response to
a real graph-traversal question and confirm a real "correct" outcome
with real evidence committed; submit an objectively incorrect one and
confirm the real specific divergence is shown (spec.md).

**Depends on**: Phase 2 (problem-setup, merge-structure).

### Implementation for User Story 1

- [x] T007 [P] [US1] Write
  `tests/unit/visual-assessment/graph-layout.test.ts` (test-first):
  every real node/edge in the input structure appears exactly once in
  the layout output; no node is placed at a duplicate/undefined
  position
- [x] T008 [US1] Create `src/features/visual-assessment/graph-layout.ts`
  per data-model.md: `layoutGraph` -- a simple deterministic
  circular/grid placement, not `elkjs` (research.md); make T007 pass
- [x] T009 [P] [US1] Write
  `tests/unit/visual-assessment/tree-layout.test.ts` (test-first): same
  "every node/edge appears exactly once, no duplicate positions"
  invariant for a bounded binary tree
- [x] T010 [US1] Create `src/features/visual-assessment/tree-layout.ts`
  per data-model.md: `layoutTree` -- standard recursive placement; make
  T009 pass
- [x] T011 [US1] Create
  `src/features/visual-assessment/extraction-schemas.ts`: one
  Structured Outputs schema per checker domain describing only that
  domain's claim field(s) (FR-003) -- the same bounded set of five
  domains `deterministic-grading` already covers, not a
  per-subject/per-concept schema
- [x] T012 [US1] Create
  `src/features/visual-assessment/vision-extraction.ts` per
  data-model.md: `extractDrawing`, `LOW_CONFIDENCE_THRESHOLD`,
  `needsConfirmation` -- calls the vision-capable model with the
  drawing image + the domain's schema, returns the real reported
  confidence, never an invented one
- [x] T013 [US1] Create `src/features/visual-assessment/actions.ts`
  with `submitDrawing`/`submitConfirmedVisualResponse` per
  contracts/visual-assessment-actions.md: uploads the drawing to
  `assessment-drawings`, resolves the entry's real
  `checker_domain`/`checker_input`, calls `extractProblemSetup` +
  `extractDrawing` (never grades); `submitConfirmedVisualResponse`
  always requires an explicit `confirmedClaimFields` argument, calls
  `mergeStructure` then `deterministic-grading`'s existing
  `gradeStructuredResponse` unchanged (FR-004/FR-008) -- no new
  grading or evidence path
- [x] T014 [US1] Create
  `src/features/visual-assessment/components/QuestionCanvas.tsx` and
  `src/app/courses/[courseId]/visual-assessment/[questionId]/page.tsx`:
  renders the question via `layoutGraph`/`layoutTree`, captures the
  student's drawing (pointer events -> raster image), and (when no
  confirmation is needed) submits directly through `submitDrawing` then
  `submitConfirmedVisualResponse`

**Checkpoint**: The full draw-submit-grade loop works end to end for a
real, confidently-read drawing. This is the feature's MVP.

---

## Phase 4: User Story 2 - A possibly-misread drawing asks for confirmation (Priority: P2)

**Goal**: A low-confidence extraction is shown to the student for
confirmation/correction before anything is graded; a confident one
still proceeds immediately with no added step.

**Independent Test**: Submit a drawing constructed to be genuinely
ambiguous and confirm the system shows its extracted interpretation
and requires confirmation; confirm correcting it before grading
changes the outcome to match the correction, not the original
misreading (spec.md).

**Depends on**: User Story 1 (`submitDrawing`/
`submitConfirmedVisualResponse` already exist).

### Implementation for User Story 2

- [x] T015 [US2] Create
  `src/features/visual-assessment/components/ConfirmExtraction.tsx`:
  shows the extracted claim fields in plain language, lets the student
  confirm as-is or correct them, then calls
  `submitConfirmedVisualResponse` with whichever the student actually
  approved
- [x] T016 [US2] Wire `QuestionCanvas.tsx`'s submit flow: when
  `submitDrawing`'s `needsConfirmation` is `true`, show
  `ConfirmExtraction` before grading; when `false`, skip straight to
  `submitConfirmedVisualResponse` with no added step (FR-005
  Acceptance Scenario 4 -- confirmation is reserved for real
  low-confidence cases, not required on every submission)

**Checkpoint**: The low-confidence path is fully wired and the
high-confidence path stays a single, uninterrupted submission.

---

## Phase 5: User Story 3 - The loop works across more than one domain (Priority: P3)

**Goal**: Prove, live, that the same draw-extract-confirm-grade
mechanism works correctly for at least two distinct
`deterministic-grading` domains, not one hardcoded demo path -- this
story adds no new production code path (the mechanism is already fully
domain-generic by construction in User Story 1), only live proof it
holds, the same verification-only pattern this project has now
established four times.

**Independent Test**: Submit a correct drawn response to a
graph-traversal question and, separately, a correct drawn response to
a tree-structure question; confirm both are graded correctly by their
own real, existing checker (spec.md).

**Depends on**: User Story 1 (the mechanism already exists and is
already domain-generic).

### Implementation for User Story 3

- [x] T017 [US3] Live-verify (quickstart.md Group B2/B3/B6) against a
  real Supabase project and real OpenAI API: a real correct and a real
  incorrect drawn response to a `bfs-dfs` question grade correctly via
  `checkTraversal`; a real correct drawn response to a
  `tree-traversal`/`tree-insertion` question grades correctly via
  `checkTreeTraversal`/`checkTreeInsertion` -- no new production code
  path, proving the mechanism generalizes

**Checkpoint**: All three user stories complete. The visual-assessment
loop is proven end to end, with a real confirmation safeguard, across
more than one real constrained domain.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T018 Run `npm run typecheck` across the whole repository --
  expect PASS with no regressions outside this feature
- [x] T019 Add `tests/unit/visual-assessment/*.test.ts` to
  `package.json`'s `test:unit` script and run it -- expect PASS
- [x] T020 Walk through quickstart.md Groups A and B end to end; B1
  (the Storage bucket/RLS), B4 (a genuinely ambiguous drawing
  triggering confirmation), and B5 (a blank/unreadable drawing failing
  honestly) must all be actually confirmed against a real Supabase
  project and real OpenAI API before this feature is called done, not
  assumed from the unit suite alone (B2/B3/B6 are User Story 3's own
  task, T017, above)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup -- BLOCKS all user
  stories.
- **User Story 1 (Phase 3)**: Depends on Foundational only -- the
  feature's MVP.
- **User Story 2 (Phase 4)**: Depends on User Story 1 (`submitDrawing`/
  `submitConfirmedVisualResponse` already exist to wire a confirmation
  screen in front of).
- **User Story 3 (Phase 5)**: Depends on User Story 1 (the mechanism
  it verifies already exists and is already domain-generic).
- **Polish (Phase 6)**: Depends on all three user stories.

### Within Each User Story

- Foundational: T003/T004 (problem-setup) and T005/T006
  (merge-structure) are independent of each other.
- US1: test-first the two layout modules (T007/T008, T009/T010) in
  parallel with each other, then the extraction schemas and vision call
  (T011, T012), then the server action wiring both together (T013),
  then the UI (T014).
- US2: the confirmation component (T015), then wiring it into the
  existing submit flow (T016) -- no new server-side logic, `actions.ts`
  from US1 already enforces confirmation structurally.
- US3: a single live-verification task (T017) on an already-complete,
  already domain-generic mechanism -- no new pure-logic work.

### Parallel Opportunities

- T003 and T005 are independent test files with no dependency on each
  other.
- T007 and T009 (graph/tree layout tests) are independent of each
  other and of T011/T012.
- User Story 2 and User Story 3 both depend only on User Story 1 being
  complete, not on each other -- could proceed in either order.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: draw a real correct and a real incorrect
   response to a real question, confirm both grade exactly through the
   real existing checker; `npm run typecheck` and Foundational + US1's
   unit tests pass
5. This alone delivers PRD's stated exit criterion ("one strong visual
   demo works end-to-end") before the confirmation safeguard (US2) or
   the cross-domain proof (US3)

### Incremental Delivery

1. Setup + Foundational -> safe rendering and reassembly proven
2. US1 -> the full draw-submit-grade loop exists (MVP)
3. US2 -> the low-confidence confirmation safeguard is wired in
4. US3 -> the mechanism is proven to generalize across domains
5. Polish -> full test suite, live quickstart walkthrough

### Solo Build Note

Same as every prior feature: `[P]` markers mark ordering-independence,
not parallel staffing. Commit after each task or tight cluster,
solo-authored, no AI co-author trailer, per project convention.

---

## Notes

- User Story 3 is deliberately a verification-only story with no new
  production code path -- called out explicitly in its Goal/Depends-on
  rather than left to look like padding, the same practice this
  project has now established four times
  (`learner-graph-evidence`/`assessment-generation-pipeline`/
  `review-scheduler`/`exam-planner`, and now here).
- This feature reuses `deterministic-grading`'s existing checkers and
  `gradeStructuredResponse` (which itself reaches
  `learner-graph-evidence`'s `commitEvidence`) and
  `assessment-generation-pipeline`'s `question_bank` -- none of the
  three is reimplemented anywhere in this feature.
- Avoid: vague tasks, same-file conflicts, cross-story dependencies
  that aren't called out explicitly (US2/US3's shared dependency on
  US1's already-built `actions.ts` is documented above, not hidden).
