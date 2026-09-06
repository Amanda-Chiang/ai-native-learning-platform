# Data Model: Course Graph Ingestion

All new tables live in `supabase/migrations/0003_course_ontology.sql`,
following the exact RLS pattern Phase 1 established: `owner_id` denormalized
onto every table so policies never need a join, `owner_id = auth.uid()` for
student/instructor-visible reads, service-role-only writes for anything a
background task produces.

## course_units

Persists `CourseGraph.Unit` / the `unitId` half of `CourseConcept` — did
not exist before this feature (research.md).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `course_id` | `uuid` | FK → `courses.id`, cascade delete |
| `owner_id` | `uuid` | denormalized from `courses.owner_id` |
| `title` | `text` | not null |
| `status` | `text` | not null, `check (status in ('proposed','confirmed','archived'))` — added by `0012_unit_extraction_reconciliation.sql`; existing rows backfilled to `'confirmed'` (every pre-0012 unit was owner-authored) |
| `extraction_run_id` | `uuid` | FK → `extraction_runs.id`, nullable — added by `0012`; null for a manually-created unit, set for an extraction-proposed one |
| `created_at` | `timestamptz` | default `now()` |

RLS: `select`/`insert`/`update` where `owner_id = auth.uid()`.

Units have **two** creation paths, and they differ (amended 2026-09-05,
`0012_unit_extraction_reconciliation.sql` — this reverses the original
"units are organizational metadata, not an extracted claim, so they aren't
gated behind review" position, which left extraction with no way to create
a unit at all):

- **Manual** (`createUnit`, the course owner's own session): inserts
  `status = 'confirmed'` directly, with `extraction_run_id = null`. The
  student is the authority on their own course structure, so there is
  nothing to review. Titles must be non-empty and are rejected as
  duplicates (case-insensitive) of an existing unit in the same course.
  The owner can also rename a unit directly.
- **Extraction-proposed** (the Trigger.dev task's service-role client):
  inserts `status = 'proposed'` with the originating `extraction_run_id`,
  and goes through the same proposed/confirmed/archived review flow as
  concepts. Reviewer confirm/reject/edit writes run under the owner's own
  session via `course_units_update_own`.

Cross-table invariant enforced in `actions.ts`, not by a constraint: a
`course_concepts` row may not be `'confirmed'` while its `unit_id` points
at a unit that isn't `'confirmed'`, and a unit that confirmed concepts
still reference may not be archived. `getCourseGraph` selects only
`'confirmed'` units and concepts, so violating either direction makes
`materializeCourseGraph` throw for the whole course.

## course_concepts

Persisted form of `CourseConcept` (`src/types/domain/concept.ts`) — this
feature is what actually creates rows here for the first time.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `course_id` | `uuid` | FK → `courses.id`, cascade delete |
| `owner_id` | `uuid` | denormalized |
| `unit_id` | `uuid` | FK → `course_units.id` |
| `canonical_name` | `text` | not null |
| `aliases` | `text[]` | not null, default `'{}'` |
| `description` | `text` | not null |
| `importance_score` | `numeric` | not null, `check (importance_score >= 0 and importance_score <= 1)` |
| `source_anchors` | `jsonb` | not null, `check (jsonb_array_length(source_anchors) >= 1)` — enforces Constitution Principle V / FR-008 at the database level, not only in application code, so a bug elsewhere can't silently insert an unanchored claim |
| `status` | `text` | not null, `check (status in ('proposed','confirmed','archived'))` |
| `confidence` | `numeric` | not null, `check (confidence >= 0 and confidence <= 1)` |
| `extraction_run_id` | `uuid` | FK → `extraction_runs.id`, nullable (a reviewer-edited concept keeps its originating run for provenance even after edits) |
| `created_at` / `updated_at` | `timestamptz` | |

`aliases` MUST NOT contain `canonical_name` (mirrors
`isCourseConcept`'s existing runtime check — enforced again here via a
`check` constraint so the database and the domain validator agree, not
just the application layer).

RLS: `select` where `owner_id = auth.uid()`. `insert`/`update` only via the
service-role client (background task writes `proposed` rows; server
actions for confirm/edit/reject also run as the authenticated user's own
session, since a course owner acting as reviewer on their own course is
exactly the case `owner_id = auth.uid()` already covers — no separate
service-role path needed for the review actions themselves, only for the
extraction task's initial writes).

## concept_edges

Persisted form of `ConceptEdge` (`src/types/domain/concept-edge.ts`).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `course_id` | `uuid` | FK → `courses.id`, cascade delete |
| `owner_id` | `uuid` | denormalized |
| `source_concept_id` | `uuid` | FK → `course_concepts.id` |
| `target_concept_id` | `uuid` | FK → `course_concepts.id`, `check (source_concept_id <> target_concept_id)` — database-level enforcement of FR-011, redundant with the application-level check in research.md's reconciliation step by design (belt-and-suspenders on a hard invariant, not a duplicate placeholder) |
| `relation_type` | `text` | not null, `check (relation_type in ('prerequisite_for','part_of','mechanism_for','contrasts_with','used_in','generalizes_to','example_of','other'))` — mirrors `STANDARD_RELATION_TYPES` |
| `relation_type_note` | `text` | nullable, `check ((relation_type = 'other' and relation_type_note is not null) or (relation_type <> 'other' and relation_type_note is null))` — mirrors `isConceptEdge`'s existing runtime rule |
| `explanation` | `text` | not null |
| `source_anchors` | `jsonb` | not null, `check (jsonb_array_length(source_anchors) >= 1)` |
| `status` | `text` | not null, `check (status in ('proposed','confirmed','archived'))` |
| `confidence` | `numeric` | not null, `check (confidence >= 0 and confidence <= 1)` |
| `extraction_run_id` | `uuid` | FK → `extraction_runs.id`, nullable |
| `created_at` / `updated_at` | `timestamptz` | |

Multiple edges between the same `(source_concept_id, target_concept_id)`
are valid and expected (multigraph — matches `ConceptEdge`'s own doc
comment and `concept-atlas-renderer`'s duplicate-edge handling); no
uniqueness constraint on that pair.

RLS: same shape as `course_concepts`.

Edges do **not** go through manual review (2026-09-05 amendment to
FR-006, `spec.md`): they never appear in the review queue. An edge
auto-confirms exactly when both endpoint concepts are `'confirmed'`,
decided in three places that share one rule — at insert time in the
extraction task, in the confirm-time cascade in `confirmCandidate`, and in
`sweepEligibleEdges`, a single deterministic pass run after a bulk confirm
so the outcome doesn't depend on the order individual confirms executed
in. An edge whose endpoints are never both confirmed stays `'proposed'`
and is simply absent from the materialized graph.

## extraction_runs

New entity (spec.md's "Extraction Run") — one row per attempt to extract
from one artifact.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `course_id` | `uuid` | FK → `courses.id`, cascade delete |
| `owner_id` | `uuid` | denormalized |
| `artifact_id` | `uuid` | FK → `artifacts.id` |
| `status` | `text` | not null, `check (status in ('queued','processing','completed','failed'))` — deliberately its own enum, not reusing `artifacts.status`'s `('queued','processing','ready','failed')`: `'completed'` here means "extraction finished producing candidates," which is a different claim than the artifact being `'ready'` (readable/valid), avoiding a value that would silently mean two different things in two tables |
| `failure_reason` | `text` | nullable — populated for `'failed'` (unreadable artifact per FR-012, or missing `OPENAI_API_KEY` per research.md); never left implying success when it isn't |
| `concepts_extracted` | `integer` | not null, default `0` |
| `edges_extracted` | `integer` | not null, default `0` |
| `edges_dropped_self_referential` | `integer` | not null, default `0` — surfaces research.md's "self-reference after merge" case explicitly rather than as an unexplained gap between extracted and stored counts |
| `started_at` / `completed_at` | `timestamptz` | nullable until reached |
| `created_at` | `timestamptz` | default `now()` |

RLS: `select` where `owner_id = auth.uid()`; writes are service-role only
(the Trigger.dev task), same as `artifact_processing_runs`.

## reconciliation_decisions

New entity (spec.md's "Reconciliation Decision") — one row per candidate
concept/**unit** reconciliation classification (research.md's three-way
`merge`/`distinct`/`uncertain` outcome). `'edge'` remains a legal
`candidate_kind` value, but nothing writes one: edges are never
reconciled.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `course_id` | `uuid` | FK → `courses.id`, cascade delete |
| `owner_id` | `uuid` | denormalized |
| `extraction_run_id` | `uuid` | FK → `extraction_runs.id` |
| `candidate_kind` | `text` | not null, `check (candidate_kind in ('concept','edge','unit'))` — `'unit'` added by `0012` |
| `decision` | `text` | not null, `check (decision in ('merge','distinct','uncertain'))` |
| `matched_concept_id` | `uuid` | FK → `course_concepts.id`, nullable — set only when `decision = 'merge'` on a concept candidate |
| `matched_unit_id` | `uuid` | FK → `course_units.id`, nullable — added by `0012`; set only when `decision = 'merge'` on a unit candidate |
| `candidate_id` | `uuid` | nullable, no FK — added by `0014_reconciliation_decision_candidate_id.sql`; the `course_concepts`/`course_units` row this decision produced, paired with `candidate_kind` (same polymorphic shape as `concept_flags.target_kind`/`target_id`). Null for a `'merge'` (no row was produced — `matched_*_id` identifies the row it merged onto) and for rows written before `0014`. The review queue matches a decision to a card by this column; an unmatched card renders no reconciliation text rather than a neighbour's |
| `reasoning` | `text` | not null — the model's own stated rationale, kept verbatim for auditability (never a generic placeholder like "auto-decided") |
| `created_at` | `timestamptz` | default `now()` |

RLS: `select` where `owner_id = auth.uid()`; writes are service-role only.

## concept_flags

New entity (spec.md's "Student Flag").

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `course_id` | `uuid` | FK → `courses.id`, cascade delete |
| `target_kind` | `text` | not null, `check (target_kind in ('concept','edge'))` |
| `target_id` | `uuid` | not null — references `course_concepts.id` or `concept_edges.id` depending on `target_kind` (no single FK possible across two tables; validity is checked at the application layer in `actions.ts`, since Postgres can't express a conditional FK directly and a `check` constraint can't query another table) |
| `reporter_id` | `uuid` | FK → `auth.users.id`, cascade delete |
| `reason` | `text` | not null, non-empty (`check (length(trim(reason)) > 0)`) |
| `created_at` | `timestamptz` | default `now()` |

RLS: `insert` where `reporter_id = auth.uid()` (a signed-in user can only
flag as themselves). `select` where the flag's `course_id` belongs to a
course owned by the caller — i.e. the reviewer sees flags on their own
course's content; a flag is never editable or deletable by anyone at the
application layer in this feature (no update/delete policy — matches
`courses`'/`artifacts`'s existing "not editable yet" pattern).

## Materialization: confirmed ontology → CourseGraph DTO (FR-014)

Not a table — a pure function,
`src/features/course-graph-ingestion/materialize-course-graph.ts`:

```ts
function materializeCourseGraph(
  units: CourseUnitRow[],
  concepts: CourseConcept[],   // status === "confirmed" only, pre-filtered by the caller
  edges: ConceptEdge[],        // status === "confirmed" only, pre-filtered by the caller
): CourseGraph
```

- Each `CourseConcept` → `Concept` with `masteryState: "unverified"`
  (Constitution Principle III baseline — see research.md).
- Each `ConceptEdge` → `Relationship` with `learnerState: "strong"`
  (baseline — "weak" is an earned state per Principle III, not a default)
  and `crossUnit` computed from whether the two endpoints' `unit_id`s
  differ.
- A concept whose `unit_id` does not resolve to any unit in `units`
  (a genuine data-integrity gap, not a legitimate "no unit yet" case,
  since `unit_id` is a required not-null FK) throws rather than silently
  omitting the concept or defaulting it into an arbitrary unit — per the
  no-silent-placeholders rule, this must never look like a normal empty
  course.
