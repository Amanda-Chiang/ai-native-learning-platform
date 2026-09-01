# Server Action & Task Contracts

Two interfaces: server actions the review-queue UI and flag UI call
directly (same pattern as `courses/actions.ts`, `concept-atlas/actions.ts`),
and the Trigger.dev task payload extraction triggers.

## Trigger.dev task: `extractCourseGraphTask`

`trigger/extract-course-graph.ts`, triggered from
`trigger/ingest-artifact.ts` once an artifact reaches `"ready"`.

```ts
type ExtractCourseGraphPayload = {
  artifactId: string;
  courseId: string;
};
```

- **Idempotency**: on start, checks for an existing `extraction_runs` row
  for `(artifactId)` already in `"completed"` or `"failed"` status; if
  found, returns `{ skipped: true, reason: "already terminal" }` without
  calling OpenAI again (research.md's chaining decision).
- **Missing `OPENAI_API_KEY`**: writes `extraction_runs.status = "failed"`,
  `failure_reason = "OpenAI is not configured for this environment."`,
  and returns without attempting extraction (research.md).
- **Produces**: zero or more `course_concepts`/`concept_edges` rows at
  `status = "proposed"`, each with `extraction_run_id` set to this run and
  at least one `source_anchors` entry citing `artifactId`; zero or more
  `reconciliation_decisions` rows (one per candidate concept/edge
  evaluated); updates `extraction_runs` with final counts and status.

## `getReviewQueue(courseId: string): Promise<ReviewQueueItem[]>`

- **Consumes**: the course whose proposed candidates to list.
- **Produces**: every `course_concepts`/`concept_edges` row for that
  course with `status = "proposed"` (RLS-scoped, no `owner_id` parameter —
  same isolation pattern as every existing server action), each annotated
  with its `reconciliation_decisions` entry (if any — `"uncertain"`
  decisions should be visually distinguishable in the UI from a
  freshly-extracted candidate with no reconciliation ambiguity at all)
  and any `concept_flags` referencing it (US4's "flags visible as a
  prioritization signal," FR-009's acceptance scenario 2).

```ts
type ReviewQueueItem =
  | { kind: "concept"; concept: CourseConcept; reconciliation: ReconciliationDecision | null; flags: ConceptFlag[] }
  | { kind: "edge"; edge: ConceptEdge; reconciliation: ReconciliationDecision | null; flags: ConceptFlag[] };
```

## `confirmCandidate(kind: "concept" | "edge", id: string): Promise<{ error: string | null }>`

- Sets `status = "confirmed"`. Fails with a specific error (not a generic
  one) if the row isn't currently `"proposed"` (e.g. already
  confirmed/archived by a concurrent action) — the caller must be able to
  tell "nothing happened because it was already done" from "something
  actually went wrong."

## `editCandidate(kind: "concept" | "edge", id: string, edits: Partial<...>): Promise<{ error: string | null }>`

- Applies a reviewer's correction (canonical name, description, relation
  type/note, explanation — never `source_anchors`, `status`, or
  `confidence`, which stay system-derived) before or instead of
  confirming. `aliases`/`canonicalName` mutual-exclusion and
  `relationType`/`relationTypeNote` pairing are re-validated against the
  same rules `isCourseConcept`/`isConceptEdge` already enforce — an edit
  that would produce an invalid record is rejected with the specific
  validation failure, not silently dropped.

## `rejectCandidate(kind: "concept" | "edge", id: string): Promise<{ error: string | null }>`

- Sets `status = "archived"` (FR-007 — never a hard delete).

## `submitFlag(targetKind: "concept" | "edge", targetId: string, reason: string): Promise<{ error: string | null }>`

- **Consumes**: the flagged item and a non-empty reason (rejected client-
  and server-side if empty/whitespace-only — matches the
  `concept_flags.reason` check constraint, not just relying on the
  database to catch it after a round trip).
- **Produces**: one `concept_flags` row with `reporter_id` from the
  authenticated session (never accepted as a parameter, same reasoning as
  `courses.ts`'s `owner_id` comment). Does not touch `course_concepts`/
  `concept_edges` in any way (FR-010).

## `getCourseGraph(courseId: string): Promise<CourseGraph>`

- **Consumes**: the course to render.
- **Produces**: `materializeCourseGraph` (data-model.md) applied to that
  course's `status = "confirmed"` units/concepts/edges. Replaces the
  static-fixture read `src/app/courses/[courseId]/atlas/page.tsx`
  currently does (`concept-atlas-renderer`'s spec.md Assumptions
  explicitly named this as future work, not in that feature's scope) —
  wiring the atlas page to call this instead of reading the fixture file
  is this feature's responsibility, not a re-opening of
  `concept-atlas-renderer`.
- A course with zero confirmed concepts/units returns a valid
  `{ units: [], concepts: [], relationships: [] }`, not an error (spec.md
  Edge Cases).

## `scoreExtraction(): Promise<ExtractionScoreReport>`

Not a server action — a standalone script (`scripts/score-extraction.ts`,
run via `npx tsx scripts/score-extraction.ts` or equivalent), documented
here because it's the one other interface this feature exposes (to a
developer running it locally/in CI, not to the app's UI). See
research.md's "Extraction scoring" decision for exactly what it computes;
`quickstart.md` has the runnable command.
