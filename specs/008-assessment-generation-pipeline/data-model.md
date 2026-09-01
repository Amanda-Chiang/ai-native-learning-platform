# Data Model: Assessment Generation Pipeline

All new tables live in `supabase/migrations/0007_assessment_generation.sql`.
RLS keyed on `owner_id = auth.uid()` (research.md "Question bank is
course-owned content, not student-owned data") — the same pattern
`course_concepts`/`concept_edges`/`extraction_runs` already use. Only
the Trigger.dev task's service-role client writes either table (same
pattern as `extraction_runs`/`course_concepts`'s own proposed-candidate
writes) — no direct student/owner insert policy exists for either.

## assessment_generation_runs

One row per generation **attempt** (not per request) — a blueprint
submission that regenerates 3 times produces 3 rows sharing the same
`request_id`, each with its own `attempt_number` and full validation
report. Append-only.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `request_id` | `uuid` | Groups every attempt belonging to one blueprint submission (assigned once, by the server action that starts the Trigger.dev task) |
| `course_id` | `uuid` | FK → `courses.id`, cascade delete |
| `owner_id` | `uuid` | FK → `auth.users.id`, cascade delete |
| `attempt_number` | `integer` | not null, 1-based |
| `blueprint` | `jsonb` | not null — the `Assessment` domain object snapshot this attempt targets |
| `candidate` | `jsonb` | not null — the generated `CandidateQuestion` (question text, rubric, hints, common mistakes, source anchors, checkerDomain/checkerInput) |
| `validation_report` | `jsonb` | not null — every one of the six layers' real outcome (schema below), regardless of whether this attempt ultimately passed |
| `outcome` | `text` | not null, `check (outcome in ('passed', 'failed'))` |
| `created_at` | `timestamptz` | default `now()` |

RLS: `select` where `owner_id = auth.uid()`. No insert/update/delete
policy for authenticated users — only the Trigger.dev task's
service-role client writes this table.

## question_bank

Only a **passed** attempt is ever persisted here — this table is the
"only confirmed rows are real, reusable course content" shape,
mirroring `course_concepts`'s own confirmed/proposed distinction, except
there is no human review step here (validation is fully automated); a
row existing here at all means every layer passed.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `course_id` | `uuid` | FK → `courses.id`, cascade delete |
| `owner_id` | `uuid` | FK → `auth.users.id`, cascade delete |
| `generation_run_id` | `uuid` | FK → `assessment_generation_runs.id` — the specific passed attempt that produced this entry |
| `question_text` | `text` | not null |
| `rubric` | `jsonb` | not null — the answer key/rubric structure |
| `hints` | `text[]` | not null, default `'{}'` |
| `common_mistakes` | `text[]` | not null, default `'{}'` |
| `source_anchors` | `jsonb` | not null, `check (jsonb_array_length(source_anchors) >= 1)` — mirrors `course_concepts`'s own Constitution Principle V enforcement |
| `response_modality` | `text` | not null, `check (in ('text', 'code', 'graph', 'tree', 'diagram'))` — the existing `RESPONSE_MODALITIES` |
| `checker_domain` | `text` | nullable, `check (in ('bfs-dfs', 'heap', 'tree-traversal', 'tree-insertion', 'topological-sort', 'shortest-path'))` when not null |
| `checker_input` | `jsonb` | nullable — required together with `checker_domain` (`check ((checker_domain is null) = (checker_input is null))`) |
| `validation_report` | `jsonb` | not null — denormalized copy of the passing attempt's report, so a bank entry is self-contained and inspectable without a join (FR-011) |
| `created_at` | `timestamptz` | default `now()` |

RLS: `select` where `owner_id = auth.uid()`. No insert/update/delete
policy for authenticated users — only the Trigger.dev task writes this
table, and only for a fully-passed attempt.

## `CandidateQuestion`: what generation produces

```ts
type CandidateQuestion = {
  questionText: string;
  rubric: Record<string, unknown>; // answer key / rubric structure, shape depends on responseModality
  hints: string[];
  commonMistakes: string[];
  sourceAnchors: { conceptOrEdgeId: string; locator: string; excerpt: string }[];
  responseModality: "text" | "code" | "graph" | "tree" | "diagram";
  /** One of deterministic-grading's five domains, or null when no exact checker applies (research.md). */
  checkerDomain:
    | "bfs-dfs" | "heap" | "tree-traversal" | "tree-insertion"
    | "topological-sort" | "shortest-path" | null;
  /** Required together with checkerDomain -- the real structured input matching that domain's shape (deterministic-grading's own data-model.md types). */
  checkerInput: unknown | null;
};
```

## `ValidationReport`: every layer's real outcome

```ts
type LayerResult = { passed: boolean; detail: string };

type ValidationReport = {
  schema: LayerResult;
  sourceAlignment: LayerResult;
  independentSolve: LayerResult & { checkerResult?: unknown };
  answerAgreement: LayerResult;
  ambiguity: LayerResult;
  similarity: LayerResult;
};
```

`runValidationLayers` (`validation-pipeline.ts`) is the one function
that produces a `ValidationReport` — it runs all six layers in order,
short-circuiting further layers once one fails (no point running an
ambiguity check on a candidate whose answer key is already known
wrong), but still records every layer that DID run with its real
result, and marks any layer that never ran as `{ passed: false, detail:
"not reached" }` rather than a fabricated pass.

## Independent-solve dispatch

`independent-solve.ts`:

```ts
function runIndependentSolve(
  candidate: CandidateQuestion,
  openai: OpenAI,
): Promise<LayerResult & { checkerResult?: unknown; independentAnswer?: unknown }>
```

- When `candidate.checkerDomain` is non-null: calls the matching
  `deterministic-grading` checker directly with `candidate.checkerInput`
  (research.md) — the checker's own `outcome` becomes this layer's
  `passed`/`detail`, and the raw checker result is attached as
  `checkerResult` for the answer-agreement layer to compare against
  `candidate.rubric`'s stated answer.
- When `candidate.checkerDomain` is `null`: a separate "blind solver"
  model call, shown only `candidate.questionText` (never
  `candidate.rubric`), produces `independentAnswer` for the
  answer-agreement layer to compare instead.

## `MAX_GENERATION_ATTEMPTS`: bounded regeneration

`src/features/assessment-generation-pipeline/validation-pipeline.ts`:

```ts
export const MAX_GENERATION_ATTEMPTS = 3; // tunable starting parameter (research.md)
```

The Trigger.dev task loops: generate a candidate, run
`runValidationLayers`, insert an `assessment_generation_runs` row for
this attempt. If it passed, insert the `question_bank` entry and stop.
If it failed and `attempt_number < MAX_GENERATION_ATTEMPTS`, try again
with the same `request_id` and an incremented `attempt_number`. If the
bound is reached with no passing attempt, the request ends as
unfulfilled (spec.md Edge Cases) — never a silently-published
best-of-a-bad-lot candidate.
