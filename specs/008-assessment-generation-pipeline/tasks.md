---

description: "Task list template for feature implementation"
---

# Tasks: Assessment Generation Pipeline

**Input**: Design documents from `/specs/008-assessment-generation-pipeline/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/generation-actions.md, quickstart.md

**Tests**: Included. This feature's testable value splits the same way
`course-graph-ingestion` did: pure/mechanical logic (schema parsing,
source-alignment, answer-agreement comparison, the bounded-regeneration
control flow) gets exhaustive `node --test` coverage test-first; the
real model calls (generation, ambiguity, similarity, blind-solve) are
verified live per quickstart.md, not mocked.

**Organization**: Tasks are grouped by user story (spec.md priorities:
US1/US2 = P1, US3/US4 = P2).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US4)
- Every task includes its exact file path

## Path Conventions

Single Next.js project (per plan.md's Project Structure):
`src/features/assessment-generation-pipeline/`, `trigger/`,
`supabase/migrations/`, `tests/unit/assessment-generation-pipeline/`.

---

## Phase 1: Setup

- [x] T001 [P] Create
  `src/features/assessment-generation-pipeline/candidate-generation-schema.ts`
  per data-model.md: the `CandidateQuestion` Structured Outputs schema
  and generation prompt (mirrors
  `course-graph-ingestion/extraction-schema.ts`'s pattern) — requires
  `checkerDomain`/`checkerInput` to be both-null or both-set (research.md
  "Independent-solve dispatch"). No database dependency, so this can be
  written before the migration exists.

**Checkpoint**: The exact shape of one generated candidate is fixed
before any code calls it.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema and shared types every user story writes to or
reads from. No user story can be implemented before this phase
completes.

- [x] T002 Write `supabase/migrations/0007_assessment_generation.sql`
  per data-model.md: `assessment_generation_runs` (append-only, one row
  per attempt) and `question_bank` (only passed attempts), both RLS
  keyed on `owner_id = auth.uid()` (research.md "Question bank is
  course-owned content, not student-owned data") — only the
  service-role client writes either table, same pattern as
  `extraction_runs`/`course_concepts`
- [x] T003 Push the migration (`npx supabase db push`) and verify RLS:
  an anon-key query against each new table returns `status=200, rows=0`
  for a signed-out session — do not proceed until confirmed against the
  live project
- [x] T004 [P] Extend `src/lib/supabase/database.types.ts` with
  `AssessmentGenerationRunRow`/`QuestionBankRow`, same pattern used for
  every prior table

**Checkpoint**: Schema live and RLS-verified. No generation/validation
logic yet.

---

## Phase 3: User Story 1 - A course owner turns a blueprint into a real, grounded candidate question (Priority: P1)

**Goal**: Given a blueprint, one candidate question is generated,
grounded in and traceable to the target concepts'/edges' real confirmed
source material, never a verbatim copy.

**Independent Test**: Submit a blueprint targeting a confirmed concept
with real source material; confirm the generated candidate's claims
are traceable to that material and its question text isn't a verbatim
copy of any single source excerpt (spec.md).

**Depends on**: Phase 2 (schema, candidate schema from Phase 1).

### Implementation for User Story 1

- [x] T005 [P] [US1] Write
  `tests/unit/assessment-generation-pipeline/candidate-generation-schema.test.ts`
  (test-first): a well-formed candidate parses; a candidate missing
  `sourceAnchors` is rejected; a candidate with `checkerInput` set but
  `checkerDomain` null (or vice versa) is rejected
- [x] T006 [US1] Extend `candidate-generation-schema.ts` with the
  parsing/validation function T005 tests (mirrors
  `extraction-schema.ts`'s `parseExtractionResult` pattern)
- [x] T007 [US1] Create `trigger/generate-assessment.ts` (initial
  version): a Trigger.dev task that, given a blueprint, fetches the
  target concepts'/edges' real confirmed rows (course-graph-ingestion's
  existing tables), calls the generation model with
  `candidate-generation-schema.ts`'s prompt/schema, and produces one
  `CandidateQuestion` — fails plainly (no candidate produced) when the
  target concepts have no real source material to ground a question in
  (FR-004)
- [x] T008 [US1] Create
  `src/features/assessment-generation-pipeline/actions.ts` with
  `requestQuestionGeneration` per contracts/generation-actions.md:
  rejects before triggering anything when
  `targetConceptIds`/`targetEdgeIds`/`requiredPrerequisites` don't all
  resolve to real confirmed rows in the course (FR-012); otherwise
  assigns a `request_id` and calls
  `generateAssessmentTask.trigger(...)`

**Checkpoint**: A blueprint produces one real, grounded candidate
question. Validation/persistence come next (US2) — this story alone
proves generation itself is grounded, not that the result is trustworthy
yet.

---

## Phase 4: User Story 2 - A candidate question is proven correct before it's reusable (Priority: P1)

**Goal**: Every candidate passes, in sequence, all six validation
layers (schema, source-alignment, independent solve, answer agreement,
ambiguity, similarity) with every real outcome recorded; only a fully
passing candidate reaches the reusable question bank; a failing one is
regenerated (bounded) or rejected.

**Independent Test**: Run a well-formed candidate through the full
validation sequence and confirm it passes every layer and reaches the
bank with each layer's outcome recorded; run a candidate with a
deliberately wrong answer key and confirm it fails answer-agreement and
never reaches the bank (spec.md).

**Depends on**: User Story 1 (a real candidate to validate) and
`deterministic-grading`'s already-shipped checkers.

### Implementation for User Story 2

- [x] T009 [P] [US2] Write
  `tests/unit/assessment-generation-pipeline/source-alignment-check.test.ts`
  (test-first): a candidate whose `sourceAnchors` resolve to the
  blueprint's real target concepts/edges passes; one citing an anchor
  outside the blueprint's targets fails with that specific mismatched
  anchor identified
- [x] T010 [US2] Create
  `src/features/assessment-generation-pipeline/source-alignment-check.ts`
  per data-model.md; make T009 pass
- [x] T011 [P] [US2] Write
  `tests/unit/assessment-generation-pipeline/answer-agreement-check.test.ts`
  (test-first): a candidate's stated answer matching the independent
  solve's real result passes; a mismatch fails with both values shown
- [x] T012 [US2] Create
  `src/features/assessment-generation-pipeline/answer-agreement-check.ts`
  per data-model.md; make T011 pass
- [x] T013 [US2] Create
  `src/features/assessment-generation-pipeline/independent-solve.ts`
  per data-model.md/research.md: dispatches to the matching
  `deterministic-grading` checker when `candidate.checkerDomain` is set
  (never reimplementing one, FR-007); otherwise a blind-solver model
  call shown only `candidate.questionText`, never the candidate's own
  answer
- [x] T014 [US2] Create
  `src/features/assessment-generation-pipeline/ambiguity-check.ts`: a
  reviewer model call asking specifically whether the candidate has
  more than one reasonable interpretation/answer, returning a real
  `LayerResult` (data-model.md) — full exhaustive scenario coverage is
  User Story 3's job; this task is the working mechanism itself
- [x] T015 [US2] Create
  `src/features/assessment-generation-pipeline/similarity-check.ts`: a
  reviewer model call comparing the candidate against the course's
  real confirmed source-anchor excerpts (research.md — no new
  retrieval infrastructure), returning a real `LayerResult` — full
  exhaustive scenario coverage is User Story 4's job
- [x] T016 [P] [US2] Write
  `tests/unit/assessment-generation-pipeline/validation-pipeline.test.ts`
  (test-first), with every model-calling layer's result **injected**,
  not really called: `runValidationLayers` runs all six layers in
  order; a failure at any layer short-circuits later layers, recording
  each of them as `{ passed: false, detail: "not reached" }`, never a
  fabricated pass; the bounded-regeneration loop stops on the first
  passing attempt and never exceeds `MAX_GENERATION_ATTEMPTS` retries
- [x] T017 [US2] Create
  `src/features/assessment-generation-pipeline/validation-pipeline.ts`
  per data-model.md: `MAX_GENERATION_ATTEMPTS`, `runValidationLayers`;
  make T016 pass
- [x] T018 [US2] Wire `trigger/generate-assessment.ts`'s full loop per
  contracts/generation-actions.md: generate → `runValidationLayers` →
  insert one `assessment_generation_runs` row per attempt
  (service-role) → on pass, insert the `question_bank` entry
  (service-role) and stop; on fail, regenerate up to the bound, then
  end unfulfilled (FR-008, never a silently-published best-of-a-bad-lot
  candidate)
- [x] T019 [US2] In `actions.ts`: `getGenerationRun`/`getQuestionBank`
  per contracts/generation-actions.md — RLS-scoped reads, no `ownerId`
  parameter accepted

**Checkpoint**: A blueprint reliably produces either a fully-validated,
reusable question bank entry or an honestly-reported unfulfilled
request — never anything in between. This is the feature's real trust
guarantee, complete.

---

## Phase 5: User Story 3 - A genuinely ambiguous question is caught before it reaches a student (Priority: P2)

**Goal**: Prove, exhaustively, that the ambiguity check built in User
Story 2 actually catches multi-answer/multi-interpretation candidates
and passes genuinely unambiguous ones — this story adds no new
production code path (`ambiguity-check.ts` already exists and is
already wired into `runValidationLayers`), only exhaustive verification
of it, the same reasoning `learner-graph-evidence`'s own US2 already
established for this project.

**Independent Test**: Run a candidate with a genuinely ambiguous
question through the ambiguity check and confirm it's flagged and does
not reach the bank as-is (spec.md).

**Depends on**: User Story 2 (`ambiguity-check.ts`/`runValidationLayers`
already exist).

### Implementation for User Story 3

- [ ] T020 [US3] Add scenarios live (quickstart.md-style, not unit-mocked
  — this is a model-judgment call, same reasoning
  `deterministic-grading`'s rubric grader used): a candidate with only
  one reasonable answer passes the ambiguity check; a candidate with a
  genuinely ambiguous stated constraint (e.g. a claimed unique shortest
  path when the underlying graph actually has two equally short ones)
  is flagged and confirmed absent from `question_bank` afterward

**Checkpoint**: The ambiguity guarantee is proven against real model
behavior, not just designed for.

---

## Phase 6: User Story 4 - A near-copy of real homework/practice material never enters the bank (Priority: P2)

**Goal**: Prove, exhaustively, that the similarity check built in User
Story 2 rejects a near-copy of the course's own source material and
passes a genuinely original candidate — same "verification of an
already-built mechanism" reasoning as User Story 3.

**Independent Test**: Run a candidate that closely mirrors real
uploaded course material through the similarity check and confirm
it's rejected; run a genuinely original candidate on the same
underlying concept and confirm it passes (spec.md).

**Depends on**: User Story 2 (`similarity-check.ts`/`runValidationLayers`
already exist).

### Implementation for User Story 4

- [ ] T021 [US4] Add scenarios live (same reasoning as T020): a
  candidate deliberately worded as a near-paraphrase of a real
  confirmed concept's/edge's source excerpt fails the similarity check;
  a genuinely original candidate covering the same concept passes

**Checkpoint**: All four user stories complete. A blueprint reliably
produces a validated, reusable, source-traceable question — or an
honest unfulfilled result — with every trust-bearing check proven
against real model behavior, not just designed for.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T022 Run `npm run typecheck` across the whole repository — expect
  PASS with no regressions outside this feature
- [x] T023 Add `tests/unit/assessment-generation-pipeline/*.test.ts` to
  `package.json`'s `test:unit` script and run it — expect PASS
- [x] T024 Walk through quickstart.md Groups A and B end to end; B2's
  real generate-to-bank success case, B3's answer-agreement-failure
  case, and B4's nonexistent-target rejection must all be actually
  confirmed against the live project (real Supabase, `OPENAI_API_KEY`,
  and a real Trigger.dev run) before this feature is called done, not
  assumed from the unit suite alone

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user
  stories.
- **User Story 1 (Phase 3)**: Depends on Foundational only — real,
  grounded generation exists, not yet validated.
- **User Story 2 (Phase 4)**: Depends on US1 (a real candidate to
  validate) — the MVP: a blueprint reliably produces a validated bank
  entry or an honest failure.
- **User Story 3 (Phase 5)**: Depends on US2 (verifies a property of
  the mechanism US2 built; adds no new production code path).
- **User Story 4 (Phase 6)**: Depends on US2 (same reasoning as US3;
  independent of US3, neither depends on the other).
- **Polish (Phase 7)**: Depends on all four user stories.

### Within Each User Story

- US1: test-first schema work (T005/T006), then the generation task
  itself (T007), then the server action that triggers it (T008).
- US2: test-first pure-logic pairs for the mechanical layers
  (T009/T010, T011/T012), then the two model-calling layers as working
  mechanisms (T013-T015, exhaustive scrutiny deferred to US3/US4),
  then test-first the orchestration with injected fakes (T016/T017),
  then wiring the real loop into the task (T018), then the read actions
  (T019).
- US3/US4: each is a single live-verification task on an
  already-complete mechanism — no test-first pure-logic work, since
  the layers themselves are model-judgment calls, not exactly-checkable
  functions.

### Parallel Opportunities

- T001 (candidate schema) has no dependency on the migration and could
  start immediately.
- T004 (database types) can proceed once T002/T003 land, independently
  of US1's work.
- T009/T011/T016 are all independent test files with no dependency on
  each other — only their corresponding implementation tasks (T010,
  T012, T017) and T013-T015 (the two model-calling layers) need to
  land before T018 wires everything into the real loop.
- T020 (US3) and T021 (US4) are independent of each other — neither's
  live check depends on the other's.

---

## Implementation Strategy

### MVP First (User Stories 1 and 2 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (T002-T003 — blocks everything; must
   be verified live against Supabase, not just written)
3. Complete Phase 3: User Story 1
4. Complete Phase 4: User Story 2
5. **STOP and VALIDATE**: submit one real blueprint, confirm it either
   reaches `question_bank` fully validated or ends as an honestly
   reported unfulfilled request, `npm run typecheck` and both stories'
   unit tests pass
6. This alone proves the whole generate-validate-persist mechanism
   works, before the deeper ambiguity/similarity scrutiny of US3/US4

### Incremental Delivery

1. Setup + Foundational → schema live, candidate shape in place
2. US1 → real, grounded generation exists
3. US2 → the full trust guarantee is real: validated or honestly
   rejected, never anything in between (MVP)
4. US3 → the ambiguity guarantee is proven against real model
   behavior
5. US4 → the near-copy guarantee is proven against real model behavior
6. Polish → full test suite, live quickstart walkthrough

### Solo Build Note

Same as every prior feature: `[P]` markers mark ordering-independence,
not parallel staffing. Commit after each task or tight cluster,
solo-authored, no AI co-author trailer, per project convention.

---

## Notes

- US3 and US4 are deliberately verification-only stories with no new
  production code path — called out explicitly in each story's
  Goal/Depends-on rather than left to look like padding, the same
  practice `learner-graph-evidence`'s own tasks.md already established
  for its US2.
- This feature reuses `deterministic-grading`'s existing checkers
  (independent-solve) and `course-graph-ingestion`'s existing confirmed
  concepts/edges (grounding, source-alignment) completely unchanged —
  neither is reimplemented anywhere in this feature.
- Avoid: vague tasks, same-file conflicts, cross-story dependencies
  that aren't called out explicitly (US3/US4's shared dependency on
  US2's already-built mechanism is documented above, not hidden).
