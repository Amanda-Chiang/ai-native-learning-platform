# Server Action Contracts

Server actions live in `src/features/review-scheduler/actions.ts`. All
are plain `"use server"` synchronous actions (research.md) -- no
background task.

## `getDailyReviewSession(courseId: string, options?: { timeBudgetMinutes?: number; excludeConceptIds?: string[] }): Promise<DailySessionResult>`

- **Consumes**: `courseId`; `options.timeBudgetMinutes` (defaults to a
  value in the 5-10 minute range, spec.md Assumptions, when omitted);
  `options.excludeConceptIds` (FR-013's "request more" -- concepts
  already shown this session, supplied back by the caller).
- **Produces**: for every confirmed concept in the course, reads
  `getConceptState` (learner-graph-evidence, unchanged) and
  `course_concepts.importance_score`, computes `prerequisiteOutDegree`
  from confirmed `concept_edges`, ranks via `rankConceptsByPriority`,
  filters to `isDue(...) === true` and not in `excludeConceptIds`, joins
  each against its available `question_bank` entries, and calls
  `composeDailySession`. RLS-scoped to the calling student; no
  `userId` parameter accepted, same convention as every prior feature's
  read actions.
- **Never**: calls an LLM (FR-002); returns a fabricated or placeholder
  item when nothing is due or no validated question exists (FR-006,
  FR-008); writes to `evidence_events` or any learner-state table
  (this action is read-only).

## `getConnectSession(courseId: string): Promise<ConnectSessionResult>`

- **Consumes**: `courseId`.
- **Produces**: reads every confirmed `course_concepts` row (`id`,
  `created_at`, and a computed `edgeCount`) and every confirmed
  `concept_edges` row (with `getEdgeState` per edge), calls
  `composeConnectSession`. RLS-scoped, same as above.
- **Never**: calls an LLM; invents a "commonly confused" pair not
  backed by a real `contrasts_with` edge (research.md).

## Completing a session item -- no new action

Completing a `SessionItem` calls `deterministic-grading`'s existing
`gradeStructuredResponse`/`gradeCodeResponse`/`gradeTextResponse`
actions directly (FR-010) -- `review-scheduler` exposes no grading
action of its own. The `assessmentAttemptId`/evidence produced by that
existing call is what changes `getConceptState`'s next read, which is
what `computeNextReviewDate` reads on the next `getDailyReviewSession`
call. There is no "mark this session item reviewed" call distinct from
the existing grading path.
