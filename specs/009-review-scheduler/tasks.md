---

description: "Task list template for feature implementation"
---

# Tasks: Review Scheduler

**Input**: Design documents from `/specs/009-review-scheduler/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/scheduler-actions.md, quickstart.md

**Tests**: Included. Same split as every prior feature: pure/mechanical
logic (priority ranking, next-review-date arithmetic, session
composition, time-budget bounding) gets exhaustive `node --test`
coverage test-first; the one story whose entire content is "does a
real evidence-driven state change actually happen" (US2) is verified
live per quickstart.md, not injected fakes.

**Organization**: Tasks are grouped by user story (spec.md priorities:
US1 = P1, US2 = P2, US3 = P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US3)
- Every task includes its exact file path

## Path Conventions

Single Next.js project (per plan.md's Project Structure):
`src/features/review-scheduler/`, `src/app/courses/[courseId]/study/`,
`tests/unit/review-scheduler/`. No `supabase/migrations/` entry and no
`package.json` dependency change -- this feature adds neither
(research.md "No new persistence layer").

---

## Phase 1: Setup

- [ ] T001 [P] Create `src/features/review-scheduler/review-priority.ts`
  with the `ReviewPriorityWeights` type and
  `DEFAULT_REVIEW_PRIORITY_WEIGHTS` constant per data-model.md (tunable,
  not calibrated -- research.md). No database dependency, so this can
  be written before anything else.

**Checkpoint**: The priority formula's shape and default weights are
fixed before any ranking logic calls them.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The two pure mechanisms every user story either directly
implements (US2) or depends on to know what's due and in what order
(US1). No user story can be implemented before this phase completes.

- [ ] T002 [P] Write `tests/unit/review-scheduler/review-priority.test.ts`
  (test-first): a concept with `hasUnresolvedMisconception: true` ranks
  above an equally-overdue concept without one; a higher
  `importanceScore` ranks above an equally-overdue, equally-central,
  unflagged concept; every `ConceptPriority.reasons` entry is
  non-empty and names a real factor, never a generic placeholder
  (FR-007)
- [ ] T003 Extend `review-priority.ts` with `computeConceptPriority`/
  `rankConceptsByPriority` per data-model.md; make T002 pass
- [ ] T004 [P] Write `tests/unit/review-scheduler/next-review-date.test.ts`
  (test-first): a `LearnerConceptState` with a higher `score` produces
  a later `computeNextReviewDate` than one with a lower score and the
  same `lastEvidenceAt` (US2/SC-005); `hasUnresolvedMisconception: true`
  forces a near-immediate due date regardless of score;
  `lastEvidenceAt: null` always returns a past-or-present date
  (immediately due, FR-004)
- [ ] T005 Create `src/features/review-scheduler/next-review-date.ts`:
  `computeNextReviewDate`/`isDue` per data-model.md; make T004 pass

**Checkpoint**: Priority ranking and the due-date mechanism are proven
correct in isolation, against constructed fixtures, before any session
composition depends on them.

---

## Phase 3: User Story 1 - A short, prioritized daily review session (Priority: P1)

**Goal**: A student requests today's review session and receives a
real, time-bounded, ranked set of validated practice questions, each
with a stated reason -- or an honest explanation when nothing is
available.

**Independent Test**: With a course that has concepts at varying
review recency/mastery and some validated `question_bank` entries,
request today's session and confirm it returns a bounded, ranked,
reason-labeled set of real items (spec.md).

**Depends on**: Phase 2 (ranking + due-date mechanism).

### Implementation for User Story 1

- [ ] T006 [P] [US1] Write
  `tests/unit/review-scheduler/daily-session.test.ts` (test-first): a
  due concept with zero available `question_bank` entries is skipped,
  never fabricated as a placeholder item (FR-009); the session never
  exceeds `timeBudgetMinutes / DEFAULT_MINUTES_PER_QUESTION` items
  rounded down, except it still returns at least one item when the
  budget is smaller than one question's cost (Edge Cases); every due
  concept with zero available questions anywhere produces
  `{ status: "no_content" }`, never an empty `{ status: "ok", items:
  [] }` masquerading as "nothing to do" (FR-008);
  `excludeConceptIds` really excludes those concepts from the ranked
  slice (FR-013)
- [ ] T007 [US1] Create `src/features/review-scheduler/daily-session.ts`
  per data-model.md: `DEFAULT_MINUTES_PER_QUESTION`,
  `composeDailySession`; make T006 pass
- [ ] T008 [US1] Create `src/features/review-scheduler/actions.ts` with
  `getDailyReviewSession` per contracts/scheduler-actions.md: for every
  confirmed course concept, reads `getConceptState`
  (learner-graph-evidence, unchanged), `course_concepts.importance_score`,
  computes `prerequisiteOutDegree` from confirmed `concept_edges`,
  ranks via `rankConceptsByPriority`, filters to `isDue(...) === true`
  and not in `excludeConceptIds`, joins against available
  `question_bank` entries, calls `composeDailySession` -- RLS-scoped,
  no `userId` parameter accepted
- [ ] T009 [US1] Create `src/app/courses/[courseId]/study/page.tsx` (not
  `/review` -- already taken by course-graph-ingestion's ontology
  confirmation queue, research.md) rendering `getDailyReviewSession`'s
  items with their reasons, and routing "complete this item" through
  `deterministic-grading`'s existing grading actions unchanged
  (FR-010) -- this feature adds no second grading path

**Checkpoint**: A student can get a real, bounded, ranked daily session
end to end, and completing an item feeds real evidence back into the
existing pipeline. This is the feature's MVP.

---

## Phase 4: User Story 2 - Practicing a concept changes when it resurfaces (Priority: P2)

**Goal**: Prove, against real evidence, that answering a review
question correctly pushes a concept's next-due date further out than
answering incorrectly -- the mechanism itself (`next-review-date.ts`)
was already built and proven against constructed fixtures in Phase 2;
this story adds no new production code path, only live proof it holds
against real `evidence_events`, the same "verification-only story"
pattern `assessment-generation-pipeline`'s own US3/US4 already
established for this project.

**Independent Test**: Answer one review question correctly and
independently, and a different one incorrectly; confirm the
correctly-answered concept's next review date computed from its fresh
`getConceptState` is later than the incorrectly-answered concept's
(spec.md US2/SC-005).

**Depends on**: Phase 2 (`next-review-date.ts` already exists);
User Story 1 (a real session to answer a question from).

### Implementation for User Story 2

- [ ] T010 [US2] Live-verify (quickstart.md Group B3) against a real
  Supabase project: complete one real question correctly and
  independently via the existing grading actions, and a different
  concept's question incorrectly; call `getConceptState` again for
  each and confirm `computeNextReviewDate` on the fresh state produces
  a later date for the correctly-answered concept, confirmed against
  real `evidence_events` rows, not injected fixtures

**Checkpoint**: The spaced-review guarantee is proven against real
evidence, not just designed for.

---

## Phase 5: User Story 3 - A weekly session that connects new material to the bigger picture (Priority: P3)

**Goal**: Once a week, a student gets a session surfacing new
concepts, weak new-to-old connections, low-connectivity concepts, and
commonly-confused-concept contrasts -- independent of the daily
session's ranking mechanism.

**Independent Test**: With a course that has concepts introduced in
the last 7 days, a weakly-evidenced new-to-old connection, a
low-connectivity concept, and a `contrasts_with` edge, request the
weekly session and confirm all four categories are represented and
distinctly labeled (spec.md).

**Depends on**: Foundational only (does not depend on User Story 1/2's
ranking or due-date logic -- a self-contained composition over
concepts/edges).

### Implementation for User Story 3

- [ ] T011 [P] [US3] Write
  `tests/unit/review-scheduler/connect-session.test.ts` (test-first): a
  concept introduced 8 days ago is excluded from `newConcepts`, one
  introduced 3 days ago is included; an edge between a new and an old
  concept with `learnerState.learnerState === "weak"` appears in
  `weakConnections`, one with `"strong"` doesn't; a concept whose
  `edgeCount` is well below the course average appears in
  `lowConnectivityConcepts`; only `relationType === "contrasts_with"`
  edges appear in `confusedPairs`
- [ ] T012 [US3] Create `src/features/review-scheduler/connect-session.ts`
  per data-model.md: `composeConnectSession`; make T011 pass
- [ ] T013 [US3] Add `getConnectSession` to
  `src/features/review-scheduler/actions.ts` per
  contracts/scheduler-actions.md: reads every confirmed
  `course_concepts` row (with a computed `edgeCount`) and every
  confirmed `concept_edges` row (with `getEdgeState`), calls
  `composeConnectSession`
- [ ] T014 [US3] Add a weekly Connect section to
  `src/app/courses/[courseId]/study/page.tsx` rendering the four
  categories from `getConnectSession`, each distinctly labeled, each
  category showing an honest "none this week" when empty rather than
  being silently omitted

**Checkpoint**: All three user stories complete. A student can get a
bounded, ranked daily session with real spaced-review behavior, and a
weekly integration session connecting new material to the rest of the
course.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T015 Run `npm run typecheck` across the whole repository --
  expect PASS with no regressions outside this feature
- [ ] T016 Add `tests/unit/review-scheduler/*.test.ts` to
  `package.json`'s `test:unit` script and run it -- expect PASS
- [ ] T017 Walk through quickstart.md Groups A and B end to end; B1
  (a real daily session), B2 (a due concept with no question skipped
  live), and B4 (a real weekly Connect session) must all be actually
  confirmed against a real Supabase project with real course/evidence
  data before this feature is called done, not assumed from the unit
  suite alone (B3 is User Story 2's own task, T010, above)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup -- BLOCKS all user
  stories.
- **User Story 1 (Phase 3)**: Depends on Foundational only -- the
  feature's MVP.
- **User Story 2 (Phase 4)**: Depends on Foundational (the mechanism it
  verifies already exists there) and User Story 1 (a real session to
  generate the evidence from).
- **User Story 3 (Phase 5)**: Depends on Foundational only --
  independent of User Story 1/2, neither depends on the other.
- **Polish (Phase 6)**: Depends on all three user stories.

### Within Each User Story

- Foundational: test-first pairs (T002/T003, T004/T005), independent
  of each other.
- US1: test-first the session composition (T006/T007), then the
  server action that assembles real inputs for it (T008), then the UI
  that surfaces it and routes completion into the existing grading
  pipeline (T009).
- US2: a single live-verification task (T010) on an already-complete
  mechanism -- no new pure-logic work, since the mechanism itself was
  already test-first-built in Foundational.
- US3: test-first the session composition (T011/T012), then the server
  action (T013), then the UI section (T014) -- structurally identical
  shape to US1, but fully independent of it.

### Parallel Opportunities

- T001 (weights/types) has no dependency on anything else and could
  start immediately.
- T002 and T004 are independent test files with no dependency on each
  other -- only their corresponding implementation tasks (T003, T005)
  need to land before US1's T008 or US2's T010.
- T006 and T011 are independent test files -- User Story 1 and User
  Story 3 have no dependency on each other and could proceed in either
  order once Foundational is done.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: request a real daily session against a real
   course, confirm it's bounded/ranked/reason-labeled or honestly
   empty; `npm run typecheck` and Foundational + US1's unit tests pass
5. This alone answers the PRD's stated exit criterion ("what should I
   study for 30 minutes today, and why") before US2's live proof or
   US3's weekly session

### Incremental Delivery

1. Setup + Foundational -> ranking and due-date mechanism proven
2. US1 -> a real daily session exists (MVP)
3. US2 -> the spaced-review guarantee is proven against real evidence
4. US3 -> the weekly Connect session exists, independent of US1/US2
5. Polish -> full test suite, live quickstart walkthrough

### Solo Build Note

Same as every prior feature: `[P]` markers mark ordering-independence,
not parallel staffing. Commit after each task or tight cluster,
solo-authored, no AI co-author trailer, per project convention.

---

## Notes

- This feature introduces no migration and no new npm dependency
  (research.md) -- Setup and Foundational are correspondingly small.
- User Story 2 is deliberately a verification-only story with no new
  production code path -- called out explicitly in its Goal/Depends-on
  rather than left to look like padding, the same practice
  `learner-graph-evidence`'s own US2 and
  `assessment-generation-pipeline`'s US3/US4 already established for
  this project.
- This feature reuses `learner-graph-evidence`'s `getConceptState`/
  `getEdgeState`, `assessment-generation-pipeline`'s `question_bank`,
  and `deterministic-grading`'s grading actions completely unchanged --
  none of the three is reimplemented anywhere in this feature.
- Avoid: vague tasks, same-file conflicts, cross-story dependencies
  that aren't called out explicitly (US2's dependency on US1 for a
  real session to generate evidence from is documented above, not
  hidden).
