# Data Model: Learner Graph Evidence

All new tables live in `supabase/migrations/0004_learner_evidence.sql`.
Unlike every prior migration in this project, RLS here is keyed on
`user_id = auth.uid()`, not `owner_id` — see research.md "Evidence
belongs to the student, not the course owner."

## evidence_events

Persisted form of `EvidenceEvent` (`src/types/domain/evidence-event.ts`)
— this feature is what actually creates rows here for the first time.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK → `auth.users.id`, cascade delete — the student this evidence is about |
| `course_id` | `uuid` | FK → `courses.id`, cascade delete |
| `concept_ids` | `uuid[]` | not null, default `'{}'`, each referencing `course_concepts.id` |
| `edge_ids` | `uuid[]` | not null, default `'{}'`, each referencing `concept_edges.id`; `check (array_length(concept_ids,1) is not null or array_length(edge_ids,1) is not null)` — mirrors `isEvidenceEvent`'s existing "at least one target" runtime rule |
| `evidence_type` | `text` | not null, `check (evidence_type in (` the 9 `EVIDENCE_TYPES` values `))` |
| `correctness` | `boolean` | nullable — null when not applicable (e.g. exposure) |
| `grader_confidence` | `numeric` | not null, `check (>= 0 and <= 1)` |
| `assistance_level` | `numeric` | not null, `check (>= 0 and <= 6)` — PRD §14.3's ladder |
| `difficulty` | `numeric` | not null |
| `transfer_distance` | `numeric` | not null |
| `student_confidence` | `numeric` | nullable |
| `source_artifact_id` | `uuid` | nullable, FK → `artifacts.id` |
| `assessment_attempt_id` | `uuid` | nullable — no `assessment_attempts` table exists yet (future phase); left as a bare `uuid` column, not a FK, until that table exists |
| `conversation_turn_id` | `uuid` | nullable — same reasoning, no conversation-turn table yet |
| `created_at` | `timestamptz` | default `now()` |

`check` constraint mirrors `isEvidenceEvent`'s "has an origin" rule:
`source_artifact_id is not null or assessment_attempt_id is not null or conversation_turn_id is not null`.

No `update`/`delete` RLS policy anywhere, and no application code path
calls `.update()`/`.delete()` on this table (FR-002 — append-only by
construction, matching the already-shipped domain module's own doc
comment: "There is deliberately no update/delete operation anywhere in
this module").

RLS: `select`/`insert` where `user_id = auth.uid()`.

## learner_concept_state

A **rebuildable cache** (research.md), not a second source of truth —
always equal to what `computeLearnerState` would derive from that
concept's full `evidence_events` history at the moment it was last
written.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK → `auth.users.id`, cascade delete |
| `course_id` | `uuid` | FK → `courses.id`, cascade delete |
| `concept_id` | `uuid` | FK → `course_concepts.id`, cascade delete |
| `mastery_state` | `text` | not null, `check (in ('unverified','exposed','weak','solid'))` — the exact `MasteryState` enum, reused verbatim (research.md) |
| `score` | `numeric` | not null — the continuous score `computeLearnerState` derived `mastery_state` from; kept alongside the tier so a future recalibration/UI can show more than the coarse bucket without recomputing |
| `has_unresolved_misconception` | `boolean` | not null, default `false` (FR-011/012) |
| `contributing_factors` | `jsonb` | not null — the most recent computation's logged components (FR-006): `{ evidenceStrength, recencyDecay, independenceFactor, graderConfidence, difficultyFactor }` per contributing event, not just the final number |
| `last_evidence_at` | `timestamptz` | not null — timestamp of the most recent contributing `evidence_events` row, for FR-009's provenance display |
| `updated_at` | `timestamptz` | not null, default `now()` |

`unique (user_id, course_id, concept_id)` — one row per student per
concept, upserted on every recompute.

RLS: `select` where `user_id = auth.uid()`; `insert`/`update` also where
`user_id = auth.uid()` (written by the student's own server-action
request, not a service-role background job — research.md "No background
job needed").

## learner_edge_state

Same shape as `learner_concept_state`, for relationships.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK → `auth.users.id`, cascade delete |
| `course_id` | `uuid` | FK → `courses.id`, cascade delete |
| `edge_id` | `uuid` | FK → `concept_edges.id`, cascade delete |
| `learner_state` | `text` | not null, `check (in ('weak','strong'))` — the exact `LearnerRelationshipState` enum |
| `score` | `numeric` | not null |
| `has_unresolved_misconception` | `boolean` | not null, default `false` |
| `contributing_factors` | `jsonb` | not null |
| `last_evidence_at` | `timestamptz` | not null |
| `updated_at` | `timestamptz` | not null, default `now()` |

`unique (user_id, course_id, edge_id)`.

RLS: same shape as `learner_concept_state`.

## The algorithm's config: `EvidenceWeights` (not a table)

`src/features/learner-graph-evidence/evidence-weights.ts` — a plain
exported TypeScript object, not persisted (research.md "one config
object, not scattered constants" — deliberately not a database table,
see that decision's Alternatives Considered).

```ts
type EvidenceWeights = {
  strengthByType: Record<EvidenceType, number>;
  recencyHalfLifeDays: number;
  independentAssistanceLevelMax: number;
  independenceFactorWhenAssisted: number;
  tierCutoffs: { exposed: number; weak: number; solid: number };
  misconceptionThreshold: number;
};
```

## `computeLearnerState`: the pure algorithm

`src/features/learner-graph-evidence/compute-learner-state.ts`:

```ts
function computeLearnerState(
  events: EvidenceEvent[],   // every event targeting this one concept or edge, for one student
  now: Date,
  weights: EvidenceWeights,
): {
  tier: MasteryState | LearnerRelationshipState;  // whichever enum applies to what's being computed
  score: number;
  hasUnresolvedMisconception: boolean;
  contributingFactors: ContributingFactor[];
  lastEvidenceAt: string;
}
```

- `score` = weighted average of, per event: `strengthByType[event.evidenceType] * recencyDecay(event.createdAt, now, weights.recencyHalfLifeDays) * independenceFactor(event.assistanceLevel, weights) * event.graderConfidence * difficultyFactor(event.difficulty)`.
- `tier` is `score` compared against `weights.tierCutoffs`, in order —
  since `strengthByType.exposure` is set below `tierCutoffs.exposed` by
  construction in the shipped default weights, no exposure-only event
  sequence can mathematically produce a score reaching `weak`/`solid`
  (Constitution Principle III enforced structurally, not by a bolt-on
  check — plan.md's Constitution Check).
- `hasUnresolvedMisconception`: true when the events list, in
  chronological order, contains `weights.misconceptionThreshold` or more
  confident (`studentConfidence` above a threshold within the same
  config) incorrect (`correctness === false`) independent events with no
  later strong correct independent event after the most recent one of
  those (FR-012's "resolves the signal").
- Called with an empty `events` array for a concept/edge that's never had
  evidence, `computeLearnerState` returns the FR-010 baseline
  (`tier: "unverified"` / `"strong"`, `score: 0`, no misconception,
  `contributingFactors: []`) — the same function handles "no evidence
  yet" and "has evidence," rather than a separate special case
  elsewhere.

## `applyLearnerState`: overlaying onto the renderer DTO

`src/features/learner-graph-evidence/apply-learner-state.ts`:

```ts
function applyLearnerState(
  graph: CourseGraph,
  conceptStates: Map<string, { masteryState: MasteryState }>,   // concept id -> state
  edgeStates: Map<string, { learnerState: LearnerRelationshipState; explanation?: string }>,
): CourseGraph
```

Pure, no Supabase call — returns a new `CourseGraph` (never mutates the
input) with each concept/edge's state replaced wherever a matching entry
exists in the maps, left at whatever `course-graph-ingestion`'s baseline
already had otherwise (research.md).
