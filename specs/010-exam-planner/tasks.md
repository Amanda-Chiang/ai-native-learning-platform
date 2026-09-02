---

description: "Task list template for feature implementation"
---

# Tasks: Exam Planner

**Input**: Design documents from `/specs/010-exam-planner/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/exam-planner-actions.md, quickstart.md

**Tests**: Included. Same split as every prior feature: pure/mechanical
logic (stage-boundary math, scoped selection, readiness bucketing,
plan composition) gets exhaustive `node --test` coverage test-first;
User Story 3 (staying current as time/evidence change) is verified
live per quickstart.md, since it's a property of the "always
recompute, never store" design already built for User Stories 1/2, not
a new code path.

**Organization**: Tasks are grouped by user story (spec.md priorities:
US1 = P1, US2 = P2, US3 = P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US3)
- Every task includes its exact file path

## Path Conventions

Single Next.js project (per plan.md's Project Structure):
`src/features/exam-planner/`, `src/app/courses/[courseId]/exam-plan/`,
`tests/unit/exam-planner/`.

---

## Phase 1: Setup

- [ ] T001 [P] Write `supabase/migrations/0008_exam_planner.sql` per
  data-model.md: `exam_configs` (user_id-keyed RLS, full CRUD for own
  rows -- current state, not an append-only log), with the "at least
  one scope target" check mirroring `evidence_events`'s existing
  convention.

**Checkpoint**: The one new table's shape is fixed before anything
reads or writes it.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, shared types, and the config CRUD every user
story depends on. No user story can be implemented before this phase
completes.

- [ ] T002 Push the migration (`npx supabase db push`) and verify RLS:
  an anon-key query against `exam_configs` returns `status=200,
  rows=0` for a signed-out session -- do not proceed until confirmed
  against the live project
- [ ] T003 [P] Extend `src/lib/supabase/database.types.ts` with
  `ExamConfigRow`, same pattern used for every prior table
- [ ] T004 [P] Write `tests/unit/exam-planner/stage-boundaries.test.ts`
  (test-first): four stages' date ranges sum to exactly the days
  between `now` and `examDate`; `final-weakness` still gets at least
  one day when the exam is only a few days out; throws when `examDate`
  is not after `now`
- [ ] T005 Create `src/features/exam-planner/stage-boundaries.ts` per
  data-model.md: `DEFAULT_STAGE_SHARES`, `computeExamStages`,
  `currentStage`; make T004 pass
- [ ] T006 [P] Create `src/features/exam-planner/actions.ts` with
  `configureExam`/`getExamConfig` per contracts/exam-planner-actions.md:
  rejects before writing anything when a scoped concept/unit id isn't a
  real, confirmed row in this course (FR-001), same discipline
  `assessment-generation-pipeline`'s `requestQuestionGeneration`
  already established

**Checkpoint**: Schema live and RLS-verified; a student can configure
a real exam; stage-boundary math is proven correct in isolation. No
plan/readiness generation yet.

---

## Phase 3: User Story 1 - Configure an exam and get a staged prep plan (Priority: P1)

**Goal**: A student configures an exam and receives a staged plan
spanning today to the exam date, each stage with real, scope-restricted
content reusing `review-scheduler`'s existing selection mechanism.

**Independent Test**: Configure an exam with a real date and scope;
confirm the returned plan has stages spanning the remaining time, each
labeled with its focus, with every concept/question traceable to real
course/learner state (spec.md).

**Depends on**: Phase 2 (schema, config CRUD, stage-boundary math).

### Implementation for User Story 1

- [ ] T007 [P] [US1] Write
  `tests/unit/exam-planner/scoped-selection.test.ts` (test-first):
  `selectDiagnosticConcepts`/`selectFinalWeaknessConcepts` only ever
  return concepts present in the scoped input, ranked via
  `review-scheduler`'s own `rankConceptsByPriority`;
  `selectInterleavingEdges` only returns an edge when *both* endpoints
  are in scope and its learner state is `"weak"`;
  `selectTimedMixedConcepts` returns a spread across different mastery
  tiers, not only the single highest-priority concept
- [ ] T008 [US1] Create `src/features/exam-planner/scoped-selection.ts`
  per data-model.md -- calls `review-scheduler`'s
  `rankConceptsByPriority`/weak-edge predicate directly, no new ranking
  algorithm (FR-004/FR-011); make T007 pass
- [ ] T009 [P] [US1] Write
  `tests/unit/exam-planner/plan-composition.test.ts` (test-first): a
  stage with no available content produces `contentGap: true` with a
  real message, never a silently-empty or fabricated stage (FR-007)
- [ ] T010 [US1] Create `src/features/exam-planner/plan-composition.ts`
  per data-model.md: `composeStagedPlan`; make T009 pass
- [ ] T011 [US1] Add `getExamPlan` to `actions.ts` per
  contracts/exam-planner-actions.md: resolves scope (expanding scoped
  units to currently-confirmed concepts), reads real
  `getConceptState`/`getEdgeState`/`question_bank` inputs per scoped
  concept/edge, calls `computeExamStages` +
  `scoped-selection.ts`'s four selectors + `composeStagedPlan` --
  returns an honest `"no_exam_configured"`/`"exam_date_passed"`
  instead of a plan when either is true (FR-010)
- [ ] T012 [US1] Create
  `src/app/courses/[courseId]/exam-plan/page.tsx`: an exam
  configuration form (date + scope) and the staged plan display;
  completing a plan item reuses `review-scheduler`'s existing
  `submitTextReviewAnswer` action directly (FR-012) -- no new grading
  action is added by this feature at all, the same way plan items are
  shaped compatibly with `review-scheduler`'s own `SessionItem`

**Checkpoint**: A student can configure a real exam and get a real,
staged plan end to end. This is the feature's MVP.

---

## Phase 4: User Story 2 - See exam readiness at a glance (Priority: P2)

**Goal**: A student can see the exam's real scope broken down by
mastery state, with unresolved misconceptions and untouched concepts
distinctly surfaced.

**Independent Test**: With an exam configured and evidence on some
scoped concepts, request readiness and confirm a real breakdown by
mastery tier, with misconceptions and untouched concepts distinctly
called out (spec.md).

**Depends on**: Phase 2 (config CRUD, scope resolution logic already
established in US1's `getExamPlan` is reused for scope resolution
here too).

### Implementation for User Story 2

- [ ] T013 [P] [US2] Write
  `tests/unit/exam-planner/readiness-snapshot.test.ts` (test-first): a
  concept with `lastEvidenceAt: null` lands in `untouched`, never
  `unverified`/`weak`; a concept with `hasUnresolvedMisconception:
  true` appears in `unresolvedMisconceptions` regardless of which tier
  bucket it's also in
- [ ] T014 [US2] Create
  `src/features/exam-planner/readiness-snapshot.ts` per data-model.md:
  `computeReadinessSnapshot`; make T013 pass
- [ ] T015 [US2] Add `getExamReadiness` to `actions.ts` per
  contracts/exam-planner-actions.md: resolves the same scope
  `getExamPlan` does, reads `getConceptState` per scoped concept,
  calls `computeReadinessSnapshot`
- [ ] T016 [US2] Add a readiness section to
  `src/app/courses/[courseId]/exam-plan/page.tsx` rendering
  `getExamReadiness`'s breakdown, with misconceptions and untouched
  concepts visually distinct from ordinary tier buckets

**Checkpoint**: A student can see real exam readiness independent of
the staged plan.

---

## Phase 5: User Story 3 - The plan and readiness stay current (Priority: P3)

**Goal**: Prove, live, that the plan and readiness reflect real new
evidence and the real passage of time without reconfiguring the exam --
this story adds no new production code path (both behaviors are
already structural consequences of "always recompute, never store,"
built in User Stories 1/2), only live proof they hold, the same
verification-only pattern `learner-graph-evidence`'s own US2 and
`assessment-generation-pipeline`'s US3/US4 already established.

**Independent Test**: Commit new evidence on a scoped concept and
re-request the plan/readiness without reconfiguring; confirm both
reflect it. Configure an exam with a past date and confirm the plan
request reports it plainly (spec.md).

**Depends on**: User Story 1 (`getExamPlan`) and User Story 2
(`getExamReadiness`) both already exist.

### Implementation for User Story 3

- [ ] T017 [US3] Live-verify (quickstart.md Group B5/B6) against a
  real Supabase project: commit new real evidence (via
  `deterministic-grading`'s existing grading actions) on a scoped
  concept and confirm a fresh `getExamPlan`/`getExamReadiness` call
  reflects it with no reconfiguration step; separately, configure an
  exam with a past date and confirm `getExamPlan` returns
  `{ error: "exam_date_passed" }`

**Checkpoint**: The staying-current guarantee is proven against real
evidence and real dates, not just designed for.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T018 Run `npm run typecheck` across the whole repository --
  expect PASS with no regressions outside this feature
- [ ] T019 Add `tests/unit/exam-planner/*.test.ts` to `package.json`'s
  `test:unit` script and run it -- expect PASS
- [ ] T020 Walk through quickstart.md Groups A and B end to end; B2
  (a real staged plan), B3 (a close exam still produces a usable
  plan), and B4 (real readiness) must all be actually confirmed
  against a real Supabase project before this feature is called done,
  not assumed from the unit suite alone (B5/B6 are User Story 3's own
  task, T017, above)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup -- BLOCKS all user
  stories.
- **User Story 1 (Phase 3)**: Depends on Foundational only -- the
  feature's MVP.
- **User Story 2 (Phase 4)**: Depends on Foundational only --
  independent of User Story 1 (both resolve scope the same way, but
  neither calls into the other's code).
- **User Story 3 (Phase 5)**: Depends on User Story 1
  (`getExamPlan`) and User Story 2 (`getExamReadiness`) both already
  existing to verify.
- **Polish (Phase 6)**: Depends on all three user stories.

### Within Each User Story

- Foundational: T004/T005 (stage math) and T006 (config CRUD) are
  independent of each other.
- US1: test-first pairs (T007/T008, T009/T010), then the server action
  assembling real inputs (T011), then the UI (T012).
- US2: test-first the readiness bucketing (T013/T014), then the server
  action (T015), then the UI section (T016) -- structurally identical
  shape to US1, but independent of it.
- US3: a single live-verification task (T017) on already-complete
  mechanisms -- no new pure-logic work.

### Parallel Opportunities

- T001 has no dependency on anything else and could start immediately.
- T003 (database types) and T004 (stage-boundary tests) are
  independent of each other and of T006.
- T007 and T009 are independent test files -- only their corresponding
  implementation tasks (T008, T010) need to land before T011 wires
  everything into the real action.
- User Story 1 and User Story 2 have no dependency on each other and
  could proceed in either order once Foundational is done.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (T002 -- blocks everything; must be
   verified live against Supabase, not just written)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: configure a real exam, request a real staged
   plan, confirm every stage's content is real and traceable; `npm run
   typecheck` and Foundational + US1's unit tests pass
5. This alone answers PRD §18.3's core exam-planning promise before
   readiness (US2) or the staying-current proof (US3)

### Incremental Delivery

1. Setup + Foundational -> schema live, config CRUD works, stage math
   proven
2. US1 -> a real staged plan exists (MVP)
3. US2 -> real exam readiness exists, independent of the plan
4. US3 -> the staying-current guarantee is proven against real
   evidence and real dates
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
  project has now established three times
  (`learner-graph-evidence`/`assessment-generation-pipeline`/here).
- This feature reuses `review-scheduler`'s `rankConceptsByPriority`
  and weak-edge predicate, `learner-graph-evidence`'s
  `getConceptState`/`getEdgeState`, `assessment-generation-pipeline`'s
  `question_bank`, `review-scheduler`'s own `submitTextReviewAnswer`,
  and `deterministic-grading`'s grading pipeline underneath that --
  none of the five is reimplemented anywhere in this feature.
- Avoid: vague tasks, same-file conflicts, cross-story dependencies
  that aren't called out explicitly (US3's dependency on US1/US2's
  already-built actions is documented above, not hidden).
