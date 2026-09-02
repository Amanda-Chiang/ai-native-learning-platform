# Implementation Plan: Visual Assessment (Graph/Tree)

**Branch**: `011-visual-assessment-graph-tree` | **Date**: 2026-09-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-visual-assessment-graph-tree/spec.md`

## Summary

A student sees a graph/tree question rendered from its real
`question_bank` checker input (minus the embedded answer claim),
draws a response on an HTML canvas, and submits it. The drawing is
uploaded to a new private Storage bucket and sent to a vision-capable
model that extracts only the answer-claim fields (`claimedOrder`,
`claimedPath`, etc.) in the exact shape the target checker domain
expects, along with a real confidence value. A low-confidence
extraction is shown to the student for confirmation/correction before
anything is graded; a confident one proceeds immediately. Either way,
the confirmed claim fields are merged back with the real problem-setup
fields and graded by calling `deterministic-grading`'s existing
`gradeStructuredResponse` unchanged -- this feature adds no new
checker, no new evidence path, and no new database table beyond the
one Storage bucket needed to retain the drawing for audit.

## Technical Context

**Language/Version**: TypeScript, Next.js 16.3.4, Node 24 (matches
every prior phase)

**Primary Dependencies**: None new. `openai` (existing) for the vision
extraction call -- same client used by `course-graph-ingestion`/
`assessment-generation-pipeline`, just with an image input instead of
a document. `deterministic-grading`'s existing checkers/
`gradeStructuredResponse` for grading, unchanged. `learner-graph-evidence`'s
`commitEvidence` reached only through that existing action, never
directly.

**Storage**: PostgreSQL via Supabase for everything except the
drawing image itself. **One new Storage bucket**
(`assessment-drawings`, migration `0009_visual_assessment_storage.sql`)
-- private, `user_id`-keyed RLS, same shape `course-artifacts`'s own
bucket already established (client uploads directly, server only
records a reference). **No new table**: the drawing's storage path
and the extracted/confirmed structure are recorded inside
`assessment_attempts.response`'s existing `jsonb` column (that table's
own documented design is "a lightweight snapshot," data-model.md,
`0006_deterministic_grading.sql`) -- this feature doesn't need a
structural schema change to record what it needs.

**Testing**: `node --test` for every pure step -- stripping a checker
input's `claimed*` answer fields to get the real problem setup,
graph/tree layout for rendering, and merging a confirmed claim back
into a full checker input. Live verification (quickstart.md) confirms
a real vision extraction call (confidence varies with a
clear-vs-ambiguous drawing) and the full draw-extract-confirm-grade
loop against a real Supabase project and real OpenAI API, since a
vision call can't be meaningfully faked without losing the point of
using a real one (same reasoning `deterministic-grading`'s own E2B
sandbox grader already established for "don't unit-test the thing you
added specifically because it's real").

**Target Platform**: Next.js server actions + a client canvas
component. No background job -- one vision call plus one deterministic
checker call is bounded, synchronous work, the same criterion
`review-scheduler`/`exam-planner` already used for the same
conclusion.

**Project Type**: Web application (existing single Next.js project)

**Performance Goals**: The extraction call has real network/model
latency (a vision call, not instant) -- no stricter target than this
project's existing non-strict-latency stance for external-service
calls (`course-graph-ingestion`'s own extraction timeout, `deterministic-grading`'s
E2B sandbox).

**Constraints**: Grading MUST call the same existing checker already
used for that domain (FR-004) -- this feature never re-implements
BFS/DFS/heap/tree/topological-sort/shortest-path logic. A low-confidence
extraction MUST require a real confirm/correct round trip before
`gradeStructuredResponse` is ever called (FR-005/FR-006) -- enforced
structurally by the server action's own signature, not left to the UI
to remember. Evidence MUST be committed only through
`gradeStructuredResponse`'s existing `commitEvidence` call (FR-008) --
no direct write.

**Scale/Scope**: MVP/dogfood scale, same as every prior phase --
bounded graphs/trees (dozens of nodes, matching
`deterministic-grading`'s own benchmark-scale assumption), one drawing
per submission.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Renderer-Neutral Learner Graph)**: PASS — this
  feature's graph/tree layout renders one assessment question's
  structure, computed fresh and never persisted; it is not the
  canonical course concept graph and has no coupling to
  `concept-atlas-renderer`'s React Flow/ELK adapters at all.
- **Principle II (Evidence-Backed Learner State, NON-NEGOTIABLE)**:
  PASS — this feature never calls `commitEvidence` directly. Every
  graded visual response goes through `deterministic-grading`'s
  existing `gradeStructuredResponse`, which is already the one
  structural funnel to evidence commit.
- **Principle III (Exposure Is Not Mastery)**: PASS / not directly
  applicable — no new evidence types; reuses whatever
  `evidenceType`/`assistanceLevel` the calling context already passes
  to `gradeStructuredResponse`, unchanged.
- **Principle IV (Deterministic Verification First)**: PASS, and this
  feature exists specifically to extend it to a new input modality —
  the vision model's role is structural *extraction*, never
  correctness *judgment*; grading is always the real deterministic
  checker. The low-confidence-confirmation requirement (FR-005) is the
  literal text of this principle ("ambiguous visual/handwritten
  parsing MUST trigger a low-confidence confirmation step before
  grading proceeds").
- **Principle V (Course-Grounded, Provenance-Preserving Claims)**:
  PASS — the rendered question is a real, already-validated
  `question_bank` entry with its own source anchors; this feature
  produces no new course-specific claims.

No violations requiring Complexity Tracking. No new external
dependency. One new Storage bucket, justified above and clearing the
same bar `course-artifacts`'s own bucket already did (object storage
is an already-approved stack component, not a new persistence layer
needing an ADR).

**Post-Phase-1 re-check**: data-model.md and
contracts/visual-assessment-actions.md introduce nothing beyond what
the gates above already covered — no new table, no new evidence path,
no new checker. Gates still PASS.

## Project Structure

### Documentation (this feature)

```text
specs/011-visual-assessment-graph-tree/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── visual-assessment-actions.md
└── tasks.md              # Phase 2 output (/speckit-tasks — not yet created)
```

### Source Code (repository root)

```text
supabase/migrations/
└── 0009_visual_assessment_storage.sql   # assessment-drawings Storage
                                             bucket + RLS, no new table

src/features/visual-assessment/
├── problem-setup.ts        # Pure: strips a checker input's claimed*
│                               answer fields, leaving the real
│                               problem setup to render -- the
│                               generic "claimed-field" mechanism
│                               review-scheduler's own research.md
│                               already deferred, now genuinely needed
├── graph-layout.ts          # Pure: simple deterministic node/edge
│                               layout for a bounded question graph
│                               (no elkjs -- research.md)
├── tree-layout.ts           # Pure: simple recursive layout for a
│                               bounded binary tree
├── extraction-schemas.ts    # One small Structured Outputs schema per
│                               checker domain, for the claim fields
│                               only (same bounded set of 5 domains
│                               deterministic-grading already covers)
├── vision-extraction.ts     # Calls the vision-capable model with the
│                               drawing image + the domain's schema;
│                               returns { claimFields, confidence }
├── merge-structure.ts       # Pure: merges a problem setup + confirmed
│                               claim fields into the real, full
│                               checker input
├── actions.ts               # "use server" -- uploads the drawing,
│                               calls vision-extraction, and (only once
│                               confirmed) calls
│                               deterministic-grading's existing
│                               gradeStructuredResponse unchanged
└── components/
    ├── QuestionCanvas.tsx     # Renders the question and captures the
    │                            student's drawing (pointer events)
    └── ConfirmExtraction.tsx  # Low-confidence confirm/correct UI

tests/unit/visual-assessment/
├── problem-setup.test.ts
├── graph-layout.test.ts
├── tree-layout.test.ts
└── merge-structure.test.ts
```

**Structure Decision**: Single Next.js project (existing), same
`src/features/<feature>/` shape every prior feature uses. One new
migration (Storage bucket only), no new npm dependency.
