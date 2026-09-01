# Implementation Plan: Course Domain Schemas & Benchmark Corpus

**Branch**: `001-course-domain-schemas` | **Date**: 2026-09-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-course-domain-schemas/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Define four TypeScript domain-schema modules (`CourseConcept`, `ConceptEdge`,
`EvidenceEvent`, `Assessment`) that every later roadmap phase will read and
write, then hand-build a small versioned benchmark corpus (30 labeled
concepts, 30 labeled relationships, 20 labeled Q&A pairs, plus 4 required
edge cases) from one real data-structures-and-algorithms course, backed by
a deterministic scoring script and written evaluation rubrics for all ten
PRD §23.2 evaluation areas. No database, API, or UI is built in this
feature — it produces typed schemas and static corpus data that Phase 1
(`account-course-artifact-foundation`) will translate into Postgres tables.

## Technical Context

**Language/Version**: TypeScript 5 (matches the repo's existing Next.js
16 / React 19 setup; `strict: true` already enabled in `tsconfig.json`).

**Primary Dependencies**: none new. Schemas are plain TypeScript
`type`/`interface` declarations — no runtime validation library (e.g. Zod)
is introduced yet, since nothing in this phase executes against untrusted
input. Runtime validation is deferred to Phase 1, when these shapes cross
an actual API boundary (per the Technology & Architecture Constraints in
`.specify/memory/constitution.md`: no new dependency without a
demonstrated need).

**Storage**: N/A for this feature. The benchmark corpus is stored as
versioned JSON + Markdown files under `benchmark/`, not a database —
Postgres tables arrive in Phase 1 once these schemas are stable.

**Testing**: Node's built-in test runner (`node --test`, Node 20+, already
required by this repo per `brain/lessons/setup-gotchas.md`) plus
`node:assert/strict`. Chosen over adding Jest/Vitest because the repo has
no unit-test framework yet and this phase's test surface (schema shape
checks, corpus scoring) doesn't need one — avoids a new dependency for a
need the platform already covers.

**Target Platform**: Node.js dev/build environment (types are consumed at
compile time by the Next.js app; the corpus-scoring script runs via
`node --test` locally and in CI, not in the browser).

**Project Type**: Single project — extends the existing Next.js repo
layout (`src/types/`, `tests/`), no separate package.

**Performance Goals**: N/A — this phase has no runtime performance surface
(compile-time types + static data files).

**Constraints**: Every corpus entry MUST validate against its schema with
no undocumented field (SC-001). The scoring script MUST run fully offline
(no network or model calls) so benchmark comparisons stay deterministic
and reproducible run-to-run, per Constitution Principle IV.

**Scale/Scope**: 4 schema modules; 1 course's worth of benchmark data (5
lecture artifacts, 2 homework sets, 30 concepts, 30 edges, 20 Q&A pairs, 4
required edge cases); 10 written evaluation rubrics.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies how | Status |
|---|---|---|
| I. Renderer-Neutral Learner Graph | `CourseConcept`/`ConceptEdge` schemas MUST NOT include coordinates, styling, or any renderer-specific field — those don't exist yet in this phase, so the gate is "don't add them," not "remove them." | PASS |
| II. Evidence-Backed Learner State (NON-NEGOTIABLE) | `EvidenceEvent` MUST be modeled as append-only (no update/delete operation defined) so no code path can ever mutate learner state without a new evidence record. | PASS — enforced in data-model.md |
| III. Exposure Is Not Mastery | `EvidenceEvent.evidence_type` MUST be a closed enum that structurally separates `exposure` from stronger tiers (retrieval/application/transfer), per spec FR-005. | PASS — enforced in data-model.md |
| IV. Deterministic Verification First | The benchmark-corpus scoring script MUST use exact/structural comparison against hand-written labels, not LLM judgment — this phase has no LLM calls at all. | PASS |
| V. Course-Grounded, Provenance-Preserving Claims | `CourseConcept`, `ConceptEdge`, and `Assessment` schemas MUST each carry a source-anchor field pointing at a benchmark artifact, per spec FR-007. | PASS — enforced in data-model.md |

No violations. Complexity Tracking table below is left empty.

**Post-Phase-1 re-check**: `data-model.md` confirms `EvidenceEvent` has no
mutation operation (Principle II), `evidenceType` is a closed enum
separating `exposure` from mastery-grade tiers (Principle III), and
`CourseConcept`/`ConceptEdge`/`Assessment` all require `sourceAnchors`
(Principle V). No renderer-specific fields were introduced anywhere
(Principle I). No LLM calls appear in the scoring mechanism (`quickstart.md`
scenario 4). Gate still PASSES after design — no changes needed.

## Project Structure

### Documentation (this feature)

```text
specs/001-course-domain-schemas/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output — skipped, see note below
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

`contracts/` is intentionally omitted: this feature exposes no external
interface (no API, no CLI, no UI) — it produces internal TypeScript types
and static data files consumed directly by later phases, not a contract
another system calls.

### Source Code (repository root)

```text
src/
└── types/
    └── domain/
        ├── concept.ts           # CourseConcept + alias/provenance shapes
        ├── concept-edge.ts      # ConceptEdge + relationship-type taxonomy
        ├── evidence-event.ts    # EvidenceEvent + evidence-type enum
        ├── assessment.ts        # Assessment blueprint shape
        └── index.ts             # barrel re-export

benchmark/
└── dsa-course/
    ├── artifacts.json           # source-artifact metadata (title, type, unit) for the 5 lectures + 2 homework sets
    ├── concepts.json            # 30 labeled CourseConcept instances
    ├── edges.json               # 30 labeled ConceptEdge instances
    ├── qa-pairs.json            # 20 labeled question/answer pairs
    ├── edge-cases.json          # the 4 required edge-case examples from spec.md
    └── rubrics/
        └── evaluation-rubrics.md  # written pass/fail criteria for all 10 PRD S23.2 areas

tests/
└── unit/
    └── domain/
        ├── concept.test.ts
        ├── concept-edge.test.ts
        ├── evidence-event.test.ts
        ├── assessment.test.ts
        └── benchmark-corpus.test.ts   # validates every corpus entry against its schema; scores a trivial baseline to prove the scoring script works
```

**Structure Decision**: Single project (Option 1), extending the existing
`src/types/` and `tests/` directories that are already scaffolded empty in
this repo. `benchmark/` is a new top-level directory since the corpus is
data, not source code or test code, and later phases (ingestion, assessment
generation) will read from it directly by path.

## Complexity Tracking

*No Constitution Check violations — this table is intentionally empty.*
