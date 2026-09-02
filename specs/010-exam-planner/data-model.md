# Data Model: Exam Planner

## `exam_configs` -- the one new table

Lives in `supabase/migrations/0008_exam_planner.sql`. RLS keyed on
`user_id = auth.uid()` -- a student's own configuration (research.md
"Exactly one new table"), same convention as `evidence_events`/
`assessment_attempts`. Unlike those two (append-only), a student can
freely update or delete their own exam configuration -- it's current
state, not a historical record.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK → `auth.users.id`, cascade delete |
| `course_id` | `uuid` | FK → `courses.id`, cascade delete |
| `exam_date` | `date` | not null |
| `scope_concept_ids` | `uuid[]` | not null, default `'{}'` |
| `scope_unit_ids` | `uuid[]` | not null, default `'{}'` -- expanded to that unit's currently-confirmed concepts at read time (research.md), never snapshotted |
| `created_at` | `timestamptz` | default `now()` |
| `updated_at` | `timestamptz` | default `now()`, bumped on reconfigure |

Check: `array_length(scope_concept_ids, 1) is not null or array_length(scope_unit_ids, 1) is not null` -- an exam must have *some* scope, mirroring `evidence_events`'s existing "at least one target" convention.

RLS: `select`/`insert`/`update`/`delete` all `using (user_id = auth.uid())` -- a student manages only their own exam configurations directly (unlike `question_bank`/`assessment_generation_runs`, this is genuinely student-owned data with no service-role-only write path).

## Inputs this feature reads, unchanged

- `learner-graph-evidence`'s `getConceptState`/`getEdgeState`.
- `course_concepts`/`concept_edges`, `status = 'confirmed'` only.
- `question_bank` (`assessment-generation-pipeline`), read-only.
- `review-scheduler`'s `rankConceptsByPriority`/`DEFAULT_REVIEW_PRIORITY_WEIGHTS`
  and `composeConnectSession`'s weak-edge detection -- called directly,
  not reimplemented.

## `stage-boundaries.ts`

```ts
export type ExamStageName = "diagnostic" | "interleaving" | "timed-mixed" | "final-weakness";

export type ExamStage = { name: ExamStageName; startDate: Date; endDate: Date };

/** Tunable percentages of real remaining days (research.md "Stage
 * share"), not fixed durations. Always sums to 1. */
export const DEFAULT_STAGE_SHARES: Record<ExamStageName, number> = {
  diagnostic: 0.3,
  interleaving: 0.3,
  "timed-mixed": 0.25,
  "final-weakness": 0.15,
};

/**
 * Splits the days between `now` and `examDate` into the four stages,
 * proportional to DEFAULT_STAGE_SHARES, rounded to whole days.
 * final-weakness always gets at least one day even when rounding would
 * otherwise zero it out (FR-006 -- a plan must still be usable when
 * the exam is very close). Throws if examDate is not after now (FR-010
 * -- the caller is responsible for surfacing that as an honest "this
 * exam has already passed" message, not swallowing it here).
 */
export function computeExamStages(examDate: Date, now: Date): ExamStage[];

export function currentStage(stages: ExamStage[], now: Date): ExamStage | null; // null only if now is outside every stage (shouldn't happen given computeExamStages' own construction, but never assumed)
```

## `scoped-selection.ts`

```ts
export type ScopedConceptInput = ConceptPriorityInput; // review-scheduler's own type, reused verbatim

export function selectDiagnosticConcepts(scoped: ScopedConceptInput[], now: Date, limit: number): ConceptPriority[]; // rankConceptsByPriority(scoped, now, DEFAULT_REVIEW_PRIORITY_WEIGHTS).slice(0, limit) -- same call final-weakness makes later with fresher evidence
export function selectFinalWeaknessConcepts(scoped: ScopedConceptInput[], now: Date, limit: number): ConceptPriority[]; // identical implementation to selectDiagnosticConcepts -- kept as two named exports for call-site clarity, not two algorithms
export function selectInterleavingEdges(scopedEdges: ConnectSessionEdgeInput[], now: Date): WeakConnectionItem[]; // composeConnectSession's weak-edge filter, with "new" replaced by "both endpoints in scope" (see below)
export function selectTimedMixedConcepts(scoped: ScopedConceptInput[], now: Date, limit: number): ConceptPriority[]; // a spread across the scope's mastery range, not only the top-ranked
```

`selectInterleavingEdges` doesn't call `composeConnectSession` directly
(that function's "new concept" framing doesn't apply here) -- it
reuses the same underlying weak-edge predicate
(`learnerState.learnerState === "weak"`) against edges whose *both*
endpoints are in the exam's scope, which is the interleaving stage's
real question ("do you know how these in-scope concepts connect"),
not `composeConnectSession`'s "is this new material still connected to
old material."

## `readiness-snapshot.ts`

```ts
export type ReadinessSnapshot = {
  solid: string[]; // concept ids
  weak: string[];
  exposed: string[];
  unverified: string[]; // has evidence, but below "exposed"
  untouched: string[]; // lastEvidenceAt === null -- distinct from "unverified" (FR-008/SC-003: never conflated with an ordinary weak concept)
  unresolvedMisconceptions: string[]; // distinctly surfaced regardless of which tier bucket the concept is also in
};

export function computeReadinessSnapshot(
  scopedConcepts: { conceptId: string; learnerState: LearnerConceptState }[],
): ReadinessSnapshot;
```

A concept can appear in both its tier bucket and
`unresolvedMisconceptions` simultaneously -- the two are orthogonal
signals (FR-008 requires the misconception to be distinctly callable
out, not exclusive of its mastery tier).

## `plan-composition.ts`

```ts
export type PlanStageResult =
  | { stage: ExamStageName; startDate: string; endDate: string; concepts: ConceptPriority[] | WeakConnectionItem[]; contentGap: false }
  | { stage: ExamStageName; startDate: string; endDate: string; contentGap: true; message: string }; // FR-007 -- no validated content for this stage's scope

export type StagedExamPlan = {
  stages: PlanStageResult[];
  currentStageName: ExamStageName | null;
};

export function composeStagedPlan(
  stages: ExamStage[],
  currentStage: ExamStage | null,
  perStageSelections: Record<ExamStageName, { items: unknown[]; hasContent: boolean }>,
): StagedExamPlan;
```

A stage with `hasContent: false` (nothing in the exam's scope had a
real available question/edge to select) produces `contentGap: true`
with an honest message, never a silently-empty or fabricated stage
(FR-007).
