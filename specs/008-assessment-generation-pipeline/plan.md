# Implementation Plan: Assessment Generation Pipeline

**Branch**: `008-assessment-generation-pipeline` | **Date**: 2026-09-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-assessment-generation-pipeline/spec.md`

## Summary

A Trigger.dev background task (matching `course-graph-ingestion`'s own
precedent for slow, multi-step, multiple-LLM-call pipelines — this one
is at least as heavy) takes an `Assessment` blueprint, generates one
candidate question grounded in that course's confirmed concepts/edges
(reusing `course-graph-ingestion`'s existing data, not a second
retrieval mechanism), then runs it through six validation layers in
sequence, recording every layer's real outcome. The independent-solve
layer reuses `deterministic-grading`'s existing checkers whenever the
candidate declares a matching checker domain; otherwise a separate
"blind solver" model call stands in. Only a candidate passing every
layer is persisted to a reusable `question_bank`, RLS-keyed on
`owner_id` like every other course-owned ontology table (`course_concepts`/
`concept_edges`) — a deliberate return to that pattern, since a bank
question is course content, not per-student data like the three most
recent features' tables.

## Technical Context

**Language/Version**: TypeScript, Next.js 16.3.4, Node 24 (matches
every prior phase)

**Primary Dependencies**: `openai` (existing) for generation and the
three model-call validation layers (source-alignment when not purely
mechanical, ambiguity, similarity, plus the blind-solver fallback);
`deterministic-grading`'s existing checkers (this project's own
feature, not an npm package) for the independent-solve layer wherever a
matching domain exists. No new external dependency.

**Storage**: PostgreSQL via Supabase. New tables:
`assessment_generation_runs` (one row per generation attempt, audit
trail — mirrors `course-graph-ingestion`'s `extraction_runs`) and
`question_bank` (validated entries only, mirrors `course_concepts`'
"only confirmed rows are real course content" shape). Both RLS-keyed on
`owner_id`, not `user_id` — research.md "Question bank is course-owned
content, not student-owned data".

**Testing**: `node --test` for every pure/mechanical piece — schema
validation, the independent-solve dispatch (checker-domain routing),
answer-agreement comparison, and the bounded-regeneration loop's
control flow with injected fake generation/validation results (same
"pure logic exhaustively tested, the real model call verified live"
split `course-graph-ingestion` already established for its own
extraction call). The four real model calls (generation,
source-alignment's model-judgment cases, ambiguity, similarity,
blind-solve) are verified live per quickstart.md, not mocked.

**Target Platform**: A Trigger.dev background task (like
`course-graph-ingestion`'s `extract-course-graph.ts`), triggered from a
server action that inserts the initial `assessment_generation_runs` row
— not a synchronous server action like `tutor-agent`/`deterministic-grading`,
since up to ~5 model calls per attempt times a bounded number of
regeneration attempts is genuinely slow, external, multi-step work
needing retry/idempotency, the exact case that already justified using
Trigger.dev for extraction.

**Project Type**: Web application (existing single Next.js project)

**Performance Goals**: No hard latency target (this is a background
task, not an interactive request) — bounded by
`MAX_GENERATION_ATTEMPTS` (a tunable starting parameter, research.md)
keeping worst-case cost/time bounded rather than unbounded regeneration.

**Constraints**: Every validation layer's real outcome must be recorded
on the run (FR-006/FR-011), never collapsed into one boolean. The
independent-solve layer must call an existing `deterministic-grading`
checker, never reimplement one, whenever the candidate's declared
checker domain matches (FR-007). A candidate is never persisted to
`question_bank` with any validation layer's outcome still failing
(FR-008).

**Scale/Scope**: MVP/dogfood scale, same as every prior phase — one
owner-operated course.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Renderer-Neutral Learner Graph)**: PASS / not
  applicable — no rendering code.
- **Principle II (Evidence-Backed Learner State, NON-NEGOTIABLE)**: PASS
  / not directly applicable — this feature produces reusable *questions*,
  not learner-state mutations; it never writes
  `learner_concept_state`/`learner_edge_state`/`evidence_events` at all
  (that only happens later, when a real student actually attempts a
  bank question — a different, not-yet-specified feature, per spec.md's
  Out of Scope).
- **Principle III (Exposure Is Not Mastery)**: PASS / not applicable —
  same reasoning as Principle II; no evidence is produced here.
- **Principle IV (Deterministic Verification First)**: PASS, and
  structurally reinforced — the independent-solve layer (FR-007) is
  required to prefer an exact `deterministic-grading` checker over a
  model call wherever one exists, the same non-negotiable preference
  that principle already establishes project-wide.
- **Principle V (Course-Grounded, Provenance-Preserving Claims,
  NON-NEGOTIABLE)**: PASS, and this is this feature's own core
  guarantee — FR-001/FR-002 require every candidate to carry real
  source anchors into confirmed course material, and FR-003/FR-004
  structurally prevent both a verbatim-copy candidate and a fabricated,
  ungrounded one from ever being generated in the first place.

No violations requiring Complexity Tracking.

**Post-Phase-1 re-check**: data-model.md and
contracts/generation-actions.md introduce nothing beyond what the gates
above already covered. Worth confirming explicitly:
`runValidationLayers` (data-model.md) is the single place all six
layers execute and record outcomes — no code path persists to
`question_bank` outside that function returning an all-pass report. No
new violations; gates still PASS.

## Project Structure

### Documentation (this feature)

```text
specs/008-assessment-generation-pipeline/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── generation-actions.md
└── tasks.md             # Phase 2 output (/speckit-tasks — not yet created)
```

### Source Code (repository root)

```text
supabase/migrations/
└── 0007_assessment_generation.sql   # assessment_generation_runs,
                                        # question_bank -- RLS keyed on
                                        # owner_id (course-owned content)

trigger/
└── generate-assessment.ts            # The Trigger.dev task: candidate
                                         # generation -> six validation
                                         # layers -> persist or
                                         # regenerate/reject, per attempt

src/features/assessment-generation-pipeline/
├── candidate-generation-schema.ts     # Structured Outputs schema +
│                                         prompt for one candidate
│                                         (mirrors course-graph-ingestion/
│                                         extraction-schema.ts's pattern)
├── source-alignment-check.ts          # Pure: do claimed target
│                                         concepts/edges' real anchors
│                                         actually ground the candidate
├── independent-solve.ts                # Dispatches to a
│                                         deterministic-grading checker
│                                         when the candidate declares a
│                                         matching domain, else a blind
│                                         model solve
├── answer-agreement-check.ts           # Pure: compares the independent
│                                         solve's result against the
│                                         candidate's own stated answer
├── ambiguity-check.ts                  # Model call: multiple reasonable
│                                         interpretations/answers?
├── similarity-check.ts                 # Model call: near-copy of the
│                                         course's own source material?
├── validation-pipeline.ts              # runValidationLayers: the one
│                                         place all six layers run in
│                                         sequence and get recorded
└── actions.ts                          # Server actions:
                                          requestQuestionGeneration,
                                          getGenerationRun,
                                          getQuestionBank

tests/unit/assessment-generation-pipeline/
├── candidate-generation-schema.test.ts
├── source-alignment-check.test.ts
├── answer-agreement-check.test.ts
└── validation-pipeline.test.ts          # Bounded-regeneration control
                                            flow, with injected fakes for
                                            every model-calling layer
```

**Structure Decision**: Extends the existing single-Next.js-project
layout, same conventions as every prior feature. First feature since
`course-graph-ingestion` to add a new `trigger/` task — deliberate,
research.md explains why this pipeline needs Trigger.dev's durability
where `tutor-agent`/`deterministic-grading` didn't need it for their own
(bounded, single-request-scale) work.

## Complexity Tracking

*No Constitution Check violations — table intentionally omitted.*
