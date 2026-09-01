# Implementation Plan: Course Graph Ingestion

**Branch**: `004-course-graph-ingestion` | **Date**: 2026-09-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-course-graph-ingestion/spec.md`

## Summary

Given an already-uploaded course artifact, extract candidate
`CourseConcept`s and `ConceptEdge`s (source-anchored per Constitution
Principle V) via an OpenAI Structured Outputs call, reconcile each
candidate against the course's existing ontology (merge as alias / keep
separate / route to review), hold everything at `proposed` status until a
reviewer confirms it, and let students flag a confirmed item as feedback
without ever mutating canonical data directly. A pure materialization
function then maps confirmed concepts/edges into the existing
renderer-neutral `CourseGraph` DTO, at the DTO's baseline (no-evidence-yet)
states, for `concept-atlas-renderer` to consume unchanged. Extraction
quality is measured, not eyeballed, by running the same pipeline against
`benchmark/dsa-course/`'s checked-in artifacts and scoring precision/recall
against its expected concepts/edges.

## Technical Context

**Language/Version**: TypeScript, Next.js 16.3.4, Node 24 (matches Phases 0-2)

**Primary Dependencies**: `openai` (NEW — see research.md "Extraction
provider integration"; no existing dependency performs LLM extraction, so
this is a genuine addition, not a duplicate of something already
available), `@trigger.dev/sdk` (existing, background job runner —
extraction and reconciliation run as a Trigger.dev task, same pattern as
Phase 1's `ingest-artifact`), `@supabase/supabase-js` (existing)

**Storage**: PostgreSQL via Supabase. New tables: `course_units`,
`course_concepts`, `concept_edges`, `extraction_runs`,
`reconciliation_decisions`, `concept_flags` (data-model.md). No new
persistence *technology* (no pgvector, no graph DB, no vector store) — see
research.md for why reconciliation doesn't need one at this scale.

**Testing**: `node --test` for reconciliation-decision and DTO-mapping
pure-function unit tests (matching Phase 0's domain-validator test style);
a scoring harness (`scripts/score-extraction.ts` or equivalent) that runs
extraction against `benchmark/dsa-course/` and reports precision/recall,
runnable both ad hoc and as an automatable check (Constitution Principle
IV); Playwright for the review-queue UI, matching `concept-atlas-renderer`'s
visual regression setup where the UI is visual/interactive enough to
warrant it.

**Target Platform**: Next.js server actions (review queue, flag
submission, course-graph materialization) + a Trigger.dev background task
(extraction + reconciliation, chained after Phase 1's `ingest-artifact`
task reaches `ready`) — same architecture as Phases 1-2 so far, no new
runtime.

**Project Type**: Web application (existing single Next.js project,
`src/` + `trigger/` + `supabase/migrations/`)

**Performance Goals**: Not latency-critical — extraction is an
already-asynchronous background job, not a request users wait on
synchronously. Target: a single artifact within the MVP's 25MB/PDF size
ceiling (`src/features/artifacts/status.ts`) completes extraction within
Trigger.dev's task execution window without manual intervention. No
stricter SLA is justified without real usage data (same reasoning
`status.ts`'s size ceiling comment already applies).

**Constraints**: Requires a configured `OPENAI_API_KEY` to actually run
extraction. Per Phase 1's "every shared entrypoint must tolerate missing
credentials" rule (`brain/decisions/architecture-log.md`), any
extraction-triggering UI must detect an unconfigured key and say so
explicitly — never silently no-op or produce an empty/failed run
indistinguishable from a real attempt (this is the no-silent-placeholders
rule applied to the "OpenAI not configured" case specifically).

**Scale/Scope**: MVP/dogfood scale — one owner-operated course at a time
(no multi-student role system exists yet; "reviewer" and "student flagging"
both resolve to the course owner for now, per spec.md's Assumptions),
extraction corpus sized like `benchmark/dsa-course/` (~30 concepts, ~30
edges per course, handful of artifacts).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Renderer-Neutral Learner Graph)**: PASS. This feature
  never writes to or reads from renderer/layout state. It produces
  `CourseConcept`/`ConceptEdge` (already-defined domain types, unchanged)
  and a *new*, separate pure function maps confirmed records to the
  existing `CourseGraph` DTO for rendering — no coordinate, renderer id,
  or view state is introduced anywhere in this feature's data model.
- **Principle II (Evidence-Backed Learner State)**: PASS / not applicable.
  This feature does not write `learner_concept_state` or
  `learner_edge_state` anywhere — it only produces course-level ontology,
  which Principle II doesn't govern (that principle is about *learner*
  state, not course ontology). Confirmed here explicitly so a future
  reader doesn't need to re-derive it.
- **Principle III (Exposure Is Not Mastery)**: PASS. The
  ontology-to-`CourseGraph` materialization step (FR-014) uses the DTO's
  baseline states (`masteryState: "unverified"`, `learnerState: "strong"`)
  for every concept/edge, never a fabricated higher state, since no
  learner evidence exists yet at ingestion time (that's Phase 3's job).
- **Principle IV (Deterministic Verification First)**: PASS, with
  reasoning recorded rather than assumed. Free-text concept/relationship
  extraction from course material has no exact/deterministic checker (unlike
  code correctness or numeric/symbolic math) — this is exactly the
  domain Principle IV reserves for LLM-based judgment, *provided* it's
  measured against a structured, offline-scoreable reference rather than
  eyeballed. FR-013/SC-001 and the `benchmark/dsa-course/` scoring harness
  are that structured reference. Structured Outputs (schema-constrained
  generation) is used specifically so the *shape* of extraction output is
  deterministically validated even though its *content* isn't.
- **Principle V (Course-Grounded, Provenance-Preserving Claims)**: PASS,
  this is this feature's central responsibility. FR-008/SC-004 require a
  source anchor on every concept/edge at all times, including `proposed`
  ones, not only confirmed ones. Reconciliation never auto-merges an
  uncertain case (FR-005) and a student flag never mutates canonical data
  (FR-010) — both directly enforce Principle V's "system-owned ontology,
  student assertions are feedback only" rule.
- **New dependency (`openai` package)**: not a Constitution violation
  (none of the five principles restrict dependencies directly), but
  checked against `CLAUDE.md`'s "don't add a dependency an existing one
  already solves" rule: no existing dependency (`@supabase/*`,
  `@trigger.dev/sdk`, `@xyflow/react`, `elkjs`) performs LLM calls, so this
  is a genuine, justified addition. Recorded in research.md.
- **No new persistence layer beyond Postgres**: not a violation —
  `course_units`/`course_concepts`/`concept_edges`/etc. are ordinary
  Postgres tables via the already-ratified Supabase/Postgres stack, not a
  new persistence *technology*. Explicitly considered and rejected: a
  vector store/pgvector for reconciliation similarity matching (would be a
  new persistence layer requiring its own ADR per `CLAUDE.md`, without a
  demonstrated need at this course's scale — see research.md).

No violations requiring Complexity Tracking.

**Post-Phase-1 re-check**: data-model.md and contracts/ingestion-actions.md
introduce nothing beyond what the gates above already covered — Principle
V's source-anchor requirement is now enforced at the database level
(`jsonb_array_length(source_anchors) >= 1` on both `course_concepts` and
`concept_edges`), FR-011's self-reference prohibition is enforced at both
the reconciliation-logic level (research.md) and the database level
(`concept_edges`'s `check` constraint), and `materializeCourseGraph`'s
baseline-state rule (Principle III) is specified as throwing rather than
guessing when a required reference is missing. No new violations; gates
still PASS.

## Project Structure

### Documentation (this feature)

```text
specs/004-course-graph-ingestion/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── ingestion-actions.md
└── tasks.md             # Phase 2 output (/speckit-tasks — not yet created)
```

### Source Code (repository root)

```text
supabase/migrations/
└── 0003_course_ontology.sql   # course_units, course_concepts, concept_edges,
                                 # extraction_runs, reconciliation_decisions,
                                 # concept_flags + RLS

trigger/
└── extract-course-graph.ts    # Trigger.dev task: runs after Phase 1's
                                 # ingest-artifact reaches "ready"; calls
                                 # OpenAI, reconciles, writes proposed rows

src/lib/openai/
└── client.ts                  # Thin OpenAI client factory, same pattern
                                 # as src/lib/supabase/{client,server}.ts

src/features/course-graph-ingestion/
├── extraction-schema.ts        # Structured Outputs JSON schema + the
│                                 # narrowing/validation of its result into
│                                 # CourseConcept/ConceptEdge-shaped candidates
├── reconciliation.ts           # Pure decision logic consuming an LLM
│                                 # comparison result: merge-as-alias /
│                                 # keep-separate / flag-for-review
├── materialize-course-graph.ts # Pure: confirmed CourseConcept[] +
│                                 # ConceptEdge[] -> CourseGraph DTO
├── actions.ts                   # Server actions: review queue reads,
│                                 # confirm/edit/reject, submitFlag,
│                                 # getCourseGraph
└── components/
    └── ReviewQueue.tsx          # Reviewer UI for US3

tests/unit/course-graph-ingestion/
├── reconciliation.test.ts
├── materialize-course-graph.test.ts
└── extraction-schema.test.ts

tests/visual/
└── review-queue.spec.ts

scripts/
└── score-extraction.ts         # FR-013/SC-001: run extraction against
                                 # benchmark/dsa-course/, report precision/
                                 # recall against its checked-in concepts.json
                                 # /edges.json — the offline scoring harness
                                 # Constitution Principle IV requires
```

**Structure Decision**: Extends the existing single-Next.js-project
layout (no new project/package). Follows the exact directory conventions
`account-course-artifact-foundation` and `concept-atlas-renderer` already
established: one `src/features/<feature>/` module, a `trigger/*.ts` task
per background job, one migration file per feature, `contracts/*.md` for
server-action interfaces, `tests/unit/<feature>/` mirroring the feature
directory. The one new top-level convention is `scripts/` for the
offline-scoring harness — it's a standalone CLI entry point (not a UI
route, not a background job triggered by the app), so it doesn't belong
under `src/` or `trigger/`.

## Complexity Tracking

*No Constitution Check violations — table intentionally omitted.*
