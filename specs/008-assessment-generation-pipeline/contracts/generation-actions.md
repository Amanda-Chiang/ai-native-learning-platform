# Server Action / Trigger.dev Task Contracts

Server actions live in
`src/features/assessment-generation-pipeline/actions.ts`; the
background task lives in `trigger/generate-assessment.ts` — same
chaining shape `course-graph-ingestion` established (`ingest-artifact.ts`
→ `extract-course-graph.ts`).

## `requestQuestionGeneration(blueprint: Assessment): Promise<{ requestId: string | null; error: string | null }>`

- **Consumes**: an `Assessment` blueprint (the existing Phase 0 domain
  type — this action doesn't redefine it).
- **Rejects** (FR-012) before triggering anything when
  `blueprint.targetConceptIds`/`targetEdgeIds`/`requiredPrerequisites`
  don't all resolve to real, confirmed rows in this course — the same
  "resolve to a real row before writing anything" discipline
  `learner-graph-evidence`'s `commitEvidence` already established.
- **Produces**: generates a `request_id`, calls
  `generateAssessmentTask.trigger({ requestId, blueprint, courseId })`
  (service-role task, runs asynchronously) — returns immediately, the
  task's progress is read via `getGenerationRun`.

## `getGenerationRun(requestId: string): Promise<{ attempts: GenerationRunView[]; status: "pending" | "succeeded" | "failed"; error: string | null }>`

```ts
type GenerationRunView = {
  attemptNumber: number;
  outcome: "passed" | "failed";
  validationReport: ValidationReport;
};
```

- **Produces**: every attempt recorded so far for `requestId`
  (RLS-scoped, no `ownerId` parameter accepted), plus a derived
  `status`: `"succeeded"` if any attempt passed, `"failed"` if
  `MAX_GENERATION_ATTEMPTS` attempts all failed, `"pending"` otherwise
  (the task is still running or hasn't reached the bound yet).

## `getQuestionBank(courseId: string): Promise<{ entries: QuestionBankEntry[]; error: string | null }>`

- **Produces**: the calling course owner's own validated question bank
  entries for `courseId` (RLS-scoped), each with its full
  `validationReport` inspectable (FR-011) — never just a pass/fail
  summary.

## `trigger/generate-assessment.ts` (Trigger.dev task, not a server action)

```ts
type GenerateAssessmentPayload = { requestId: string; blueprint: Assessment; courseId: string };
```

- **Produces**: for `attemptNumber` from 1 to `MAX_GENERATION_ATTEMPTS`:
  1. Generates one `CandidateQuestion` grounded in the course's
     confirmed concepts/edges matching `blueprint.targetConceptIds`/
     `targetEdgeIds` (never copying a source excerpt verbatim,
     FR-003).
  2. Runs `runValidationLayers(candidate)` (data-model.md) — all six
     layers, every real outcome recorded.
  3. Inserts one `assessment_generation_runs` row for this attempt
     (service-role client).
  4. If `outcome === "passed"`: inserts the `question_bank` entry
     (service-role client) and stops — the request is fulfilled.
  5. If `outcome === "failed"` and more attempts remain: regenerates
     (loop continues); otherwise the request ends unfulfilled
     (spec.md Edge Cases) — no further insert, `getGenerationRun`'s
     derived `status` becomes `"failed"`.
