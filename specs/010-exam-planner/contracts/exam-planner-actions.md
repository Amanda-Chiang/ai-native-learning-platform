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
- **Produces**: an `exam_configs` row (insert or update if the student
  already has a config for this course -- one active exam per course
  per student, spec.md Assumptions don't preclude multiple *different*
  courses' exams coexisting, which this naturally allows since each
  row is scoped to its own `course_id`).

## `getExamConfig(courseId: string): Promise<{ config: ExamConfigView | null; error: string | null }>`

- **Produces**: the calling student's own exam configuration for this
  course, if any. RLS-scoped, no `userId` parameter accepted.

## `getExamPlan(courseId: string): Promise<StagedExamPlan | { error: "no_exam_configured" | "exam_date_passed" }>`

- **Consumes**: `courseId` only -- reads the student's own
  `exam_configs` row internally.
- **Produces** (FR-009: always fresh, never cached): resolves scope
  (expanding any scoped unit to its currently-confirmed concepts),
  computes `computeExamStages`/`currentStage`, assembles each stage's
  real inputs (learner state via `getConceptState`/`getEdgeState`,
  question/edge availability), calls `scoped-selection.ts`'s four
  selectors, then `composeStagedPlan`.
- **Never**: calls an LLM for stage boundaries or selection (FR-003/
  FR-004); returns a plan for a course with no configured exam (an
  honest `"no_exam_configured"` instead); returns a plan when
  `examDate` has already passed (FR-010) -- an honest
  `"exam_date_passed"` instead.

## `getExamReadiness(courseId: string): Promise<ReadinessSnapshot | { error: "no_exam_configured" }>`

- **Produces**: resolves the same scope as `getExamPlan`, reads
  `getConceptState` per scoped concept, calls
  `computeReadinessSnapshot`. Always fresh (FR-009), same as the plan.

## Completing a plan item -- no new action

Same as `review-scheduler`: completing a plan's practice item calls
`deterministic-grading`'s existing grading actions directly (FR-012) --
`exam-planner` exposes no grading action of its own.
