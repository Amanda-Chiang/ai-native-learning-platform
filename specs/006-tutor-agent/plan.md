# Implementation Plan: Tutor Agent

**Branch**: `006-tutor-agent` | **Date**: 2026-09-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-tutor-agent/spec.md`

## Summary

A single primary tutor agent, built as a tool-calling loop over the
existing `openai` Responses API client (the same client
`course-graph-ingestion` already uses, no new package), gives a student a
grounded, paced conversation about their course. Grounding is entirely a
structured Postgres query over confirmed `course_concepts`/`concept_edges`
— that data already carries `source_anchors` (artifact id + locator +
excerpt) from ingestion, so "grounded in uploaded artifacts" is satisfied
by citing those anchors directly, not by adding a second retrieval
pipeline (embeddings/vector store) alongside data that already carries
its own provenance. Learner-state awareness and the assistance ladder are
read/derived, never written, directly by the model's tool calls; every
learner-state *effect* of a conversation goes through
`learner-graph-evidence`'s existing `commitEvidence` action, called from a
new `record_exposure`/`record_misconception_candidate` tool pair that is
a thin, validated wrapper around it — never a second evidence-writing
path.

## Technical Context

**Language/Version**: TypeScript, Next.js 16.3.4, Node 24 (matches every
prior phase)

**Primary Dependencies**: `openai` (existing — already used by
`course-graph-ingestion`'s `openai-extraction-call.ts`). No new package:
the Responses API's built-in function/tool-calling already gives one
model a bounded set of callable tools and a multi-round tool-call loop,
which is the entire orchestration this feature needs — see research.md
("Why not the separate `@openai/agents` package") for why that package's
actual value-add (named-agent handoffs, cross-agent guardrails) is
explicitly unused here (the constitution itself forbids a multi-agent
handoff architecture for this feature).

**Storage**: PostgreSQL via Supabase. New tables:
`tutor_conversations`, `tutor_conversation_turns`, `tutor_tool_calls`
(migration `0005_tutor_agent.sql`). Also attaches the FK
`evidence_events.conversation_turn_id` → `tutor_conversation_turns.id`
that `learner-graph-evidence`'s own data-model.md left deliberately
unbacked ("no conversation-turn table yet") — this is the feature that
gives it one. RLS keyed on `user_id = auth.uid()`, matching
`learner-graph-evidence`'s own precedent (this is student-owned
conversation data, not course-owner data).

**Testing**: `node --test` for the pure logic this feature's value
actually lives in — assistance-ladder step computation (recompute-from-
conversation-history, same "pure function over a config object" shape as
`learner-graph-evidence`'s `computeLearnerState`), tool-argument
validation, and the grounding query's shape. Playwright for the new chat
UI's interactive behavior (a student can send a message and see a
response, ladder escalation is visible turn-to-turn, "just explain"
works) using a test-double tutor response, not live OpenAI calls in
CI/test runs — no pixel-diff visual suite is needed here (this UI has no
graph-layout/rendering complexity comparable to Concept Atlas).

**Target Platform**: Next.js server actions, same as every prior
feature. No new background job (Trigger.dev) — like `commitEvidence`,
one conversation turn is a bounded request/response (a handful of OpenAI
round-trips capped by a tool-call round limit), not a long-running
external process.

**Project Type**: Web application (existing single Next.js project)

**Performance Goals**: SC-007's "responses begin within 3 seconds for
the common case" — bounded by capping the tool-call loop (research.md)
and by grounding being a fast indexed Postgres query, not a slow
retrieval pipeline. No streaming token-by-token response in this feature
(research.md "Streaming is deferred, not required") — the full turn is
returned once ready; revisit only if real usage shows the non-streamed
latency is actually a problem.

**Constraints**: Every conversation-driven learner-state effect MUST be
preceded by a `commitEvidence` call (Constitution Principle II) — the
tutor's own tools have no other way to touch `learner_concept_state`/
`learner_edge_state`. The tool surface MUST NOT include any
assessment-generation/grading tool (FR-014) — enforced by simply not
implementing them here, not by a runtime check (there is nothing to
runtime-check against; the tools don't exist in this feature's codebase).

**Scale/Scope**: MVP/dogfood scale, same as Phases 1-3 — one
owner-operated course, "student" and course owner are the same account
(spec.md Assumptions, no separate enrollment model exists yet).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Renderer-Neutral Learner Graph)**: PASS / not directly
  applicable — this feature reads learner/course-graph state through
  `learner-graph-evidence`'s and `course-graph-ingestion`'s existing
  actions; it introduces no new renderer coupling and touches no
  React Flow/ELK code.
- **Principle II (Evidence-Backed Learner State, NON-NEGOTIABLE)**: PASS
  — `record_exposure`/`record_misconception_candidate` are thin,
  validated wrappers that call `learner-graph-evidence`'s existing
  `commitEvidence` (never a second write path); the tutor model has no
  tool that writes `learner_concept_state`/`learner_edge_state` directly
  (FR-012).
- **Principle III (Exposure Is Not Mastery)**: PASS — this feature adds
  no new scoring logic at all; it only ever calls the already-shipped,
  already-guaranteed `computeLearnerState` via `commitEvidence`. FR-011
  requires the tutor to classify what it saw (passive mention vs.
  independent demonstration) into the correct existing `EvidenceType`,
  the same distinction every other evidence source in this project
  already makes.
- **Principle IV (Deterministic Verification First)**: PASS / not
  applicable to new work — this feature records observations as
  evidence; it does not grade anything itself (no code checker, no
  rubric grading — those are explicitly out of scope, FR-014).
- **Principle V (Course-Grounded, Provenance-Preserving Claims)**: PASS,
  and structurally so — `search_course_materials` (research.md) queries
  only `course_concepts`/`concept_edges` that already carry
  `source_anchors`, and returns those anchors alongside every result, so
  a claim with no real anchor simply isn't returned as groundable
  content in the first place, rather than being filtered by a separate
  check that could be forgotten.

No violations requiring Complexity Tracking.

**Post-Phase-1 re-check**: data-model.md and contracts/tutor-actions.md
introduce nothing beyond what the gates above already covered. Worth
confirming explicitly: `sendTutorMessage` (the one action that drives a
turn) never calls Supabase's `learner_concept_state`/`learner_edge_state`
tables directly — every write goes through `learner-graph-evidence`'s
`commitEvidence`, confirmed by `record-evidence-tools.ts` having no
Supabase import of its own beyond what it needs to call that action.
No new violations; gates still PASS.

## Project Structure

### Documentation (this feature)

```text
specs/006-tutor-agent/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── tutor-actions.md
└── tasks.md             # Phase 2 output (/speckit-tasks — not yet created)
```

### Source Code (repository root)

```text
supabase/migrations/
└── 0005_tutor_agent.sql          # tutor_conversations,
                                     # tutor_conversation_turns,
                                     # tutor_tool_calls + RLS (user_id-keyed);
                                     # adds evidence_events.conversation_turn_id FK

src/features/tutor-agent/
├── assistance-ladder.ts            # Pure: turn history for one concept
│                                      -> current ladder step (0-6)
├── search-course-materials.ts      # Pure query builder + row->result
│                                      mapping over confirmed
│                                      course_concepts/concept_edges
├── tutor-tools-schema.ts           # JSON-schema tool definitions passed
│                                      to the Responses API (mirrors
│                                      course-graph-ingestion/extraction-schema.ts's
│                                      pattern)
├── tool-call-validation.ts         # Pure: validates each tool call's
│                                      arguments before executing it
├── run-tutor-turn.ts               # The tool-calling loop: calls the
│                                      model, executes requested tools,
│                                      feeds results back, capped rounds
└── actions.ts                       # Server actions: startConversation,
                                       sendTutorMessage, getConversation

src/app/courses/[courseId]/tutor/
└── page.tsx                        # Chat UI (new interactive surface)

tests/unit/tutor-agent/
├── assistance-ladder.test.ts
├── search-course-materials.test.ts
└── tool-call-validation.test.ts

tests/e2e/tutor-agent.spec.ts        # Playwright, test-double model
                                        response, not live OpenAI calls
```

**Structure Decision**: Extends the existing single-Next.js-project
layout, same conventions as every prior feature. New `src/app/.../tutor/`
route (this feature's first genuinely new interactive UI surface). No
`trigger/` task (Technical Context — no background job needed) and no
new `tests/visual/` Playwright project (Technical Context — no
graph-layout rendering to pixel-diff here).

## Complexity Tracking

*No Constitution Check violations — table intentionally omitted.*
