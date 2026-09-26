# Server Action Contracts

Server actions live in `src/features/exam-planner/actions.ts`. All are
plain `"use server"` synchronous actions (research.md) -- no
background task.

## `configureExam(courseId: string, examDate: string, scopeConceptIds: string[], scopeUnitIds: string[]): Promise<{ examConfigId: string | null; error: string | null }>`

- **Consumes**: a real course id, an ISO date string, and the scope
  (concept and/or unit ids).
- **Rejects** (FR-001) before writing anything when any scoped
  concept/unit id doesn't resolve to a real, confirmed row in this
  course -- same "resolve to a real row before writing anything"
  discipline `assessment-generation-pipeline`'s
  `requestQuestionGeneration` already established.
- **Rejects**: an unauthenticated caller (`"You must be signed in to
  configure an exam."`) -- the insert needs a real `user_id`.
- **Produces**: always a *new* `exam_configs` row, and returns its id.
  A course can have any number of exams (2026-09-26 multiple-exams
  design); there is no "one active exam per course per student"
  invariant any more, and this action never updates an existing row --
  editing goes through `updateExamConfig`.

## `listExamConfigs(courseId: string): Promise<ExamConfigView[]>`

- **Produces**: every exam the calling student has configured for this
  course, oldest `exam_date` first. RLS-scoped
  (`exam_configs_select_own`), no `userId` parameter accepted. Powers
  the Exam Plan page's exam dropdown and Today's cross-course exam
  aggregation. Returns `[]` (not an error) for a course with no exams.

## `updateExamConfig(examConfigId: string, examDate: string, scopeConceptIds: string[], scopeUnitIds: string[]): Promise<{ error: string | null }>`

- **Consumes**: one specific exam's id plus its full replacement date
  and scope -- the caller passes every scope dimension, including ones
  its form doesn't expose, so an edit can't silently wipe one.
- **Rejects**: an id that resolves to no row (`No exam found with id
  "..."`), and -- same pre-write check as `configureExam` -- any scope
  id that isn't a real, confirmed row in that exam's *own* course
  (`course_id` is read off the stored row, never trusted from the
  caller).
- **Produces**: the updated `exam_configs` row (`updated_at` bumped).
  RLS (`exam_configs_update_own`) is the authorization boundary.

## `deleteExamConfig(examConfigId: string): Promise<{ error: string | null }>`

- **Rejects**: an id that resolves to no row (`No exam found with id
  "..."`) -- an honest "not found" rather than silently succeeding on a
  delete that matched zero rows, same discipline as
  `confirmCandidate`/`rejectCandidate`.
- **Produces**: the row is deleted. RLS
  (`exam_configs_delete_own`) still bounds this to the caller's own
  rows regardless.

## `getExamPlan(examConfigId: string): Promise<StagedExamPlan | { error: "no_exam_configured" | "exam_date_passed" }>`

- **Consumes**: one exam's id -- reads that `exam_configs` row
  (RLS-scoped) and takes `courseId` from the row itself, so the caller
  can't point a plan at a course the exam doesn't belong to.
- **Produces** (FR-009: always fresh, never cached): resolves scope
  (expanding any scoped unit to its currently-confirmed concepts),
  computes `computeExamStages`/`currentStage`, assembles each stage's
  real inputs (learner state via `getConceptState`/`getEdgeState`,
  question/edge availability), calls `scoped-selection.ts`'s four
  selectors, then `composeStagedPlan`.
- **Never**: calls an LLM for stage boundaries or selection (FR-003/
  FR-004); returns a plan for an exam id that resolves to no row (an
  honest `"no_exam_configured"` instead); returns a plan when
  `examDate` has already passed (FR-010) -- an honest
  `"exam_date_passed"` instead.

## `getExamReadiness(examConfigId: string): Promise<ReadinessSnapshot | { error: "no_exam_configured" }>`

- **Produces**: resolves the same scope as `getExamPlan`, reads
  `getConceptState` per scoped concept, calls
  `computeReadinessSnapshot`. Always fresh (FR-009), same as the plan.

## `listScopeableConcepts(courseId: string): Promise<ScopeableConcept[]>`

- **Produces**: the `confirmed` concepts of this course (`{ id, name }`,
  ordered by canonical name) for the config form's scope picker. Only
  `confirmed` rows -- `configureExam`/`updateExamConfig` both reject a
  non-confirmed scope id server-side, so offering `proposed` concepts
  would be a picker whose options are guaranteed to fail on submit.

## Completing a plan item -- no new action

Same as `review-scheduler`: completing a plan's practice item calls
`deterministic-grading`'s existing grading actions directly (FR-012) --
`exam-planner` exposes no grading action of its own.
