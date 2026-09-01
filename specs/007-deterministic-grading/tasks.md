---

description: "Task list template for feature implementation"
---

# Tasks: Deterministic Grading

**Input**: Design documents from `/specs/007-deterministic-grading/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/grading-actions.md, quickstart.md

**Tests**: Included. This feature's entire value is a set of pure,
exactly-checkable functions (the five domain checkers) plus a shared
evidence-mapping function — the same reasoning already applied to
`learner-graph-evidence`'s `computeLearnerState` and `tutor-agent`'s
`computeLadderStep`: exhaustive `node --test` coverage, test-first.

**Organization**: Tasks are grouped by user story (spec.md priorities:
US1/US2 = P1, US3/US4 = P2).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US4)
- Every task includes its exact file path

## Path Conventions

Single Next.js project (per plan.md's Project Structure):
`src/features/deterministic-grading/`, `supabase/migrations/`,
`tests/unit/deterministic-grading/`.

---

## Phase 1: Setup

- [X] T001 Add `@e2b/code-interpreter` to `package.json` dependencies
  (research.md's justified new dependency) — no other setup needed
  before the migration, since this feature's pure checkers have no
  external dependency of their own.

**Checkpoint**: The one new package this feature needs is declared
before any code imports it.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema and shared types every user story writes to or reads
from. No user story can be implemented before this phase completes.

- [X] T002 Write `supabase/migrations/0006_deterministic_grading.sql`
  per data-model.md: `assessment_attempts` (append-only, RLS keyed on
  `user_id = auth.uid()`, matching `learner-graph-evidence`/
  `tutor-agent`'s precedent) and the
  `evidence_events_assessment_attempt_id_fkey` foreign key
  `0004_learner_evidence.sql` deliberately left unconstrained
- [X] T003 Push the migration (`npx supabase db push`) and verify RLS:
  an anon-key query against `assessment_attempts` returns
  `status=200, rows=0` for a signed-out session, and the new FK
  constraint exists — do not proceed until confirmed against the live
  project
- [X] T004 [P] Extend `src/lib/supabase/database.types.ts` with
  `AssessmentAttemptRow` (row/insert/update types), same pattern used
  for every prior table

**Checkpoint**: Schema live and RLS-verified. No checker/grading logic
yet.

---

## Phase 3: User Story 1 - A generated question is proven correct before it reaches a student (Priority: P1)

**Goal**: Five pure, independent deterministic checkers exist — one per
domain the PRD names — each validating a claimed answer's real
correctness property (not exact-match against one canonical answer,
data-model.md), and reporting malformed input as invalid rather than
grading it.

**Independent Test**: Feed each checker a correct claimed answer and
confirm it validates; feed a deliberately wrong one and confirm it's
rejected with a specific reason; feed malformed/underspecified input
and confirm it reports `invalid_input`, never silently grading it
(spec.md).

**Depends on**: Phase 2 (schema only — these are pure functions with no
Supabase dependency of their own).

### Implementation for User Story 1

- [X] T005 [P] [US1] Write
  `tests/unit/deterministic-grading/bfs-dfs-checker.test.ts` (test-first):
  a claimed BFS/DFS order consistent with the algorithm's real
  step-by-step constraints validates as `"correct"` even when it
  differs from another equally-valid order under different
  tie-breaking; a claimed order violating a real constraint at some
  step is `"incorrect"` with the exact divergence index; a
  `startNodeId` not present in the graph, or a `claimedOrder` that
  isn't a permutation of the reachable nodes, is `"invalid_input"`
- [X] T006 [US1] Create
  `src/features/deterministic-grading/checkers/bfs-dfs-checker.ts` per
  data-model.md; make T005 pass
- [X] T007 [P] [US1] Write
  `tests/unit/deterministic-grading/heap-checker.test.ts` (test-first):
  a correct operation trace's claimed extracted sequence/final state
  validates exactly; an incorrect one is rejected with the real
  expected sequence/state and the first point of divergence; an
  extract on an empty heap is `"invalid_input"`; `checkHeapProperty`
  independently validates/rejects a bare array against the min-/max-heap
  property
- [X] T008 [US1] Create
  `src/features/deterministic-grading/checkers/heap-checker.ts` per
  data-model.md (`checkHeapOperations` and `checkHeapProperty`); make
  T007 pass
- [X] T009 [P] [US1] Write
  `tests/unit/deterministic-grading/tree-checker.test.ts` (test-first):
  a claimed traversal (in-order/pre-order/post-order) is checked by
  exact match against the real computed traversal; a claimed
  post-insertion tree is compared structurally against standard BST
  insertion, not just by node count; a malformed tree/insert value is
  `"invalid_input"`
- [X] T010 [US1] Create
  `src/features/deterministic-grading/checkers/tree-checker.ts` per
  data-model.md; make T009 pass
- [X] T011 [P] [US1] Write
  `tests/unit/deterministic-grading/topological-sort-checker.test.ts`
  (test-first): any claimed order respecting every edge's real
  precedence constraint validates as `"correct"`, not just one
  canonical order; a claimed order violating some edge's constraint is
  `"incorrect"` with that specific violated edge; a cyclic input graph
  is `"invalid_input"` ("no valid order exists"), never graded as an
  incorrect answer
- [X] T012 [US1] Create
  `src/features/deterministic-grading/checkers/topological-sort-checker.ts`
  per data-model.md; make T011 pass
- [X] T013 [P] [US1] Write
  `tests/unit/deterministic-grading/shortest-path-checker.test.ts`
  (test-first): a claimed path that's real (consecutive nodes actually
  connected) and whose summed weight equals the graph's real shortest
  distance validates as `"correct"`, even when it differs from another
  equally-short path; a claimed path with the wrong total distance is
  `"incorrect"` with the real shortest distance; an unreachable
  target or nonexistent source/target node is `"invalid_input"`
- [X] T014 [US1] Create
  `src/features/deterministic-grading/checkers/shortest-path-checker.ts`
  per data-model.md; make T013 pass

**Checkpoint**: All five domains have a real, independently-verified
checker. This is the mechanism `assessment-generation-pipeline`'s own
independent-solve validation step will call — proven correct here,
before any real student grading exists on top of it.

---

## Phase 4: User Story 2 - A student's structured DSA answer is graded exactly (Priority: P1)

**Goal**: A student's real structured response is graded by calling the
matching checker from User Story 1, the result becomes a real
`assessment_attempts` row, and a real evidence commit follows through
the one shared funnel — never a direct write to learner state.

**Independent Test**: Submit a correct structured answer and confirm it
grades as correct with a specific, inspectable reason, produces a real
`assessment_attempts` row, and results in real evidence visible via
`getConceptState`; submit an incorrect one and confirm the same, with
an incorrect grading (spec.md).

**Depends on**: User Story 1 (the checkers this story wires into a real
action) and `learner-graph-evidence`'s already-shipped `commitEvidence`.

### Implementation for User Story 2

- [X] T015 [P] [US2] Write
  `tests/unit/deterministic-grading/grading-evidence.test.ts`
  (test-first): a `"correct"` checker result maps to
  `correctness: true`, `graderConfidence: 1.0`; an `"incorrect"` result
  maps to `correctness: false`, `graderConfidence: 1.0` (an exact
  computation has no uncertainty either way); an `"invalid_input"`
  result produces no `CommitEvidenceInput` at all and signals an error
  instead — never a fabricated evidence commit for a malformed question
- [X] T016 [US2] Create
  `src/features/deterministic-grading/grading-evidence.ts`'s
  `commitEvidenceFromGradingResult` for the structured-checker result
  types per data-model.md (code/rubric result handling added in
  US3/US4); make T015 pass
- [X] T017 [US2] Create `src/features/deterministic-grading/actions.ts`
  with `gradeStructuredResponse` per contracts/grading-actions.md:
  dispatches to the matching checker by `domain`, inserts an
  `assessment_attempts` row (`response_modality: "structured"`) with
  the real checker result, then calls
  `commitEvidenceFromGradingResult` — an `invalid_input` result still
  inserts the attempt (a real record of what was attempted) but commits
  no evidence and returns a non-null error (FR-002/FR-003)

**Checkpoint**: A student's structured DSA answer is graded exactly and
becomes real, traceable evidence. This is the MVP — every other story
either adds a new response modality on top of this same
attempt-then-evidence shape, or (User Story 1) is the mechanism this
story already proved correct.

---

## Phase 5: User Story 3 - A student's code is graded by actually running it (Priority: P2)

**Goal**: Student code runs in a real E2B sandbox against real tests;
the real pass/fail result — never a model's read of the code — becomes
the grading result and, in turn, real evidence.

**Independent Test**: Submit code that passes all tests and confirm it
grades as correct with the real test output attached; submit code that
fails and confirm the result reflects the actual failure; submit code
that times out and confirm it's reported as `"did_not_complete"`, never
a fabricated pass/fail (spec.md).

**Depends on**: User Story 2 (reuses the same `assessment_attempts`
insert shape and `commitEvidenceFromGradingResult` funnel).

### Implementation for User Story 3

- [X] T018 [US3] Create
  `src/features/deterministic-grading/code-sandbox-grader.ts` per
  data-model.md: runs `code`/`tests` in a real E2B sandbox, returns a
  `CodeGradingResult` — `"graded"` with real per-test pass/fail and
  output, or `"did_not_complete"` (`"timeout"`/`"sandbox_error"`) for
  anything that isn't a genuine execution result. No unit test for this
  file itself (a real sandbox call, verified live in quickstart.md
  Group B/T023) — this task's own correctness is proven by running it
  for real, not by mocking the one thing that makes it worth using E2B
  at all
- [X] T019 [US3] Extend `grading-evidence.ts`'s
  `commitEvidenceFromGradingResult` to handle `CodeGradingResult`:
  `"graded"` maps `correctness` from `allPassed`, `graderConfidence: 1.0`;
  `"did_not_complete"` produces no evidence commit, same as
  `"invalid_input"` (FR-008)
- [X] T020 [US3] Create `gradeCodeResponse` in `actions.ts` per
  contracts/grading-actions.md: calls `code-sandbox-grader.ts`, inserts
  an `assessment_attempts` row (`response_modality: "code"`), then
  `commitEvidenceFromGradingResult` — an optional LLM explanation of a
  `"graded"` result may be returned alongside `result` for display, but
  never influences the mapping (FR-007)

**Checkpoint**: Code is graded by real execution, not by an LLM's
opinion of it — the one response type where "just run it" is
unambiguously correct, now real.

---

## Phase 6: User Story 4 - A free-text conceptual answer is graded against a real rubric (Priority: P2)

**Goal**: A free-text response is graded against a structured rubric via
the existing `openai` client, with a confidence check that flags —
never silently trusts — an ambiguous grading.

**Independent Test**: Grade a response that clearly satisfies the
rubric and confirm it grades as correct with the satisfied criteria
identified; grade a genuinely ambiguous one and confirm it's flagged
`isLowConfidence: true` rather than committed as a confident result
(spec.md).

**Depends on**: User Story 2 (reuses the same `assessment_attempts`
insert shape and `commitEvidenceFromGradingResult` funnel).

### Implementation for User Story 4

- [X] T021 [P] [US4] Write
  `tests/unit/deterministic-grading/rubric-grader-validation.test.ts`
  (test-first): a confidence at or above
  `DEFAULT_RUBRIC_GRADING_CONFIDENCE_THRESHOLD` resolves
  `isLowConfidence: false`; a confidence below it resolves
  `isLowConfidence: true` — this pure threshold logic is testable
  without a real model call
- [X] T022 [US4] Create `src/features/deterministic-grading/rubric-grader.ts`
  per data-model.md: `DEFAULT_RUBRIC_GRADING_CONFIDENCE_THRESHOLD`
  (labeled as a tunable starting parameter, same convention
  `evidence-weights.ts`/`assistance-ladder.ts` already established),
  and the real `openai` call grading `response` against `rubric`,
  returning a `RubricGradingResult` with `isLowConfidence` computed from
  the model's own returned confidence against the threshold; make T021
  pass
- [X] T023 [US4] Extend `grading-evidence.ts`'s
  `commitEvidenceFromGradingResult` to handle `RubricGradingResult`:
  `correctness` from `outcome === "correct"`, `graderConfidence` set to
  the rubric result's real (possibly low) `confidence` — never inflated
  to look certain even when `isLowConfidence` is true (FR-010 requires
  the result still commits, flagged, not withheld)
- [X] T024 [US4] Create `gradeTextResponse` in `actions.ts` per
  contracts/grading-actions.md: calls `rubric-grader.ts`, inserts an
  `assessment_attempts` row (`response_modality: "text"`), then
  `commitEvidenceFromGradingResult`

**Checkpoint**: All four user stories complete. Every DSA response
modality this feature covers — structured, code, and text — is graded
honestly (exact computation, real execution, or a constrained,
confidence-aware rubric) and becomes real, traceable evidence through
one shared path.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T025 Run `npm run typecheck` across the whole repository — expect
  PASS with no regressions outside this feature
- [X] T026 Add `tests/unit/deterministic-grading/*.test.ts` to
  `package.json`'s `test:unit` script and run it — expect PASS (all
  five checkers, grading-evidence's mapping, and the rubric grader's
  threshold logic)
- [X] T027 Walk through quickstart.md Groups A and B end to end; B1's
  live RLS/FK check, B2's real structured-grading-to-evidence check,
  B3's real sandbox execution (including a genuine timeout case), and
  B4's low-confidence rubric check must all be actually confirmed
  against the live project (real Supabase, `OPENAI_API_KEY`, and
  `E2B_API_KEY`) before this feature is called done, not assumed from
  the unit suite alone

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user
  stories.
- **User Story 1 (Phase 3)**: Depends on Foundational only — the five
  checkers are pure functions with no Supabase dependency of their own.
- **User Story 2 (Phase 4)**: Depends on US1 (wires its checkers into a
  real action) — the MVP: a structured response is graded and becomes
  real evidence.
- **User Story 3 (Phase 5)**: Depends on US2 (reuses its
  `assessment_attempts`/`commitEvidenceFromGradingResult` shape).
- **User Story 4 (Phase 6)**: Depends on US2 (same reuse as US3) —
  independent of US3, neither depends on the other.
- **Polish (Phase 7)**: Depends on all four user stories.

### Within Each User Story

- US1: five independent test-first checker pairs (T005/T006, T007/T008,
  T009/T010, T011/T012, T013/T014) — different files, no dependencies
  on each other, all can proceed in parallel.
- US2: test-first evidence-mapping (T015/T016), then the server action
  composing it with US1's checkers (T017, same file as T016's module,
  sequential).
- US3: the sandbox grader itself (T018, no unit test — a real E2B call,
  verified live), then extending the shared evidence-mapping (T019,
  same file US2 created), then the server action (T020).
- US4: test-first threshold logic (T021/T022), then extending the
  shared evidence-mapping (T023, same file US2/US3 already extended),
  then the server action (T024).

### Parallel Opportunities

- T004 (database types) has no dependency on T005-T014 and can proceed
  once T002/T003 land.
- All five of US1's test-first checker pairs (T005-T014) are
  independent files and can all proceed in parallel once Phase 2
  completes.
- T021 (US4's threshold test) can be written in parallel with US3's
  work, since `rubric-grader.ts` is a new, independent file — only the
  *wiring* tasks (T019, T023) share `grading-evidence.ts` and must be
  sequential with each other.

---

## Implementation Strategy

### MVP First (User Stories 1 and 2 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (T002-T003 — blocks everything; must
   be verified live against Supabase, not just written)
3. Complete Phase 3: User Story 1 (all five checkers, exhaustively
   tested)
4. Complete Phase 4: User Story 2
5. **STOP and VALIDATE**: grade one real structured response, confirm
   `getConceptState` reflects it immediately, `npm run typecheck` and
   both stories' unit tests pass
6. This alone proves the deterministic-checking mechanism works and
   produces real evidence, before code or rubric grading exist

### Incremental Delivery

1. Setup + Foundational → schema live, `@e2b/code-interpreter` declared
2. US1 → five independent checkers, proven correct in isolation
3. US2 → structured grading produces real evidence (MVP)
4. US3 → code is graded by real execution, not LLM opinion
5. US4 → free text is graded against a real rubric, confidence-aware
6. Polish → full test suite, live quickstart walkthrough (including a
   real E2B sandbox run)

### Solo Build Note

Same as every prior feature: `[P]` markers mark ordering-independence,
not parallel staffing. Commit after each task or tight cluster,
solo-authored, no AI co-author trailer, per project convention.

---

## Notes

- US3's sandbox grader (T018) is deliberately the one production file
  in this feature with no unit test of its own — mocking the sandbox
  call would mean testing nothing real about the one thing E2B was
  added for. Its correctness is proven by quickstart.md's live check
  (T027), not a unit test, called out explicitly rather than silently
  skipped.
- US2, US3, and US4 all share `grading-evidence.ts` as the single
  funnel to `commitEvidence` — extended, never duplicated, across all
  three stories (research.md).
- Avoid: vague tasks, same-file conflicts, cross-story dependencies
  that aren't called out explicitly (US3/US4's shared dependency on
  US2's `assessment_attempts`/funnel shape is documented above, not
  hidden).
