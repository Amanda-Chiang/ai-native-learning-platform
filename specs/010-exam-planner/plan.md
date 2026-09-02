# Implementation Plan: Exam Planner

**Branch**: `010-exam-planner` | **Date**: 2026-09-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-exam-planner/spec.md`

## Summary

A student configures an exam (date + scope of concepts/units); the
plan and readiness view are both computed fresh on every request from
existing state, never stored as a generated artifact. Three of the
plan's four stages (diagnostic, timed-mixed, final-weakness) are
`review-scheduler`'s existing `rankConceptsByPriority` +
`composeDailySession`-style selection restricted to the exam's scope;
the interleaving stage reuses `composeConnectSession`'s weak-edge
detection, same restriction. Stage boundaries are computed
deterministically from real days-remaining, never estimated by an LLM
(FR-003). The one genuinely new piece of state is the exam
configuration itself (date + scope) -- everything else this feature
produces is a read, not a write.

## Technical Context

**Language/Version**: TypeScript, Next.js 16.3.4, Node 24 (matches every
prior phase)

**Primary Dependencies**: None new. Reuses `review-scheduler`'s
`rankConceptsByPriority`/`isDue`-adjacent selection and
`composeConnectSession`'s weak-edge detection (both restricted to an
exam's scope, not reimplemented); `learner-graph-evidence`'s
`getConceptState`/`getEdgeState` unchanged; `assessment-generation-pipeline`'s
`question_bank` read-only; `deterministic-grading`'s grading actions
for completing a plan item (FR-012), no second grading path. FR-005's
optional LLM-drafted stage wording is deferred (research.md) -- not
required for this feature's core deliverable, the spec itself says
"MAY".

**Storage**: PostgreSQL via Supabase. **One new table**: `exam_configs`
(migration `0008_exam_planner.sql`) -- a student's exam date + scope,
the one piece of state this feature actually needs to persist (a real,
demonstrated requirement, same bar `graph_layouts` already cleared —
a new table in the already-approved Postgres store, not a new
persistence layer, no ADR gate). RLS keyed on `user_id` (student-owned
configuration, same convention as `evidence_events`/
`assessment_attempts`). The staged plan and readiness snapshot are
**never stored** -- both are pure, on-read computations over
`exam_configs` + existing evidence/course state (FR-009).

**Testing**: `node --test` for stage-boundary computation, per-stage
concept/question selection (restricted-to-scope wrappers around
`review-scheduler`'s existing pure functions), and readiness-snapshot
bucketing -- all pure, all exhaustively testable with constructed
fixtures. Live verification (quickstart.md) confirms the real
migration/RLS and a real plan/readiness computation against real
Supabase data.

**Target Platform**: Next.js server actions, same as `review-scheduler`.
No background job -- no LLM call is required for this feature's core
path (stage/readiness selection is deterministic), so nothing here
needs Trigger.dev's retry/durability guarantees.

**Project Type**: Web application (existing single Next.js project)

**Performance Goals**: Plan/readiness generation returns in well under
a second -- bounded Postgres reads plus in-memory computation, same
performance shape as `review-scheduler`'s own sessions.

**Constraints**: Stage boundaries MUST be computed deterministically
from real days-remaining (FR-003) -- no LLM estimate. Concept/question
selection MUST reuse `review-scheduler`'s existing mechanism restricted
to the exam's scope, never a second selection method (FR-004/FR-011).
Completing a plan item MUST route through `deterministic-grading`'s
existing actions (FR-012). The plan/readiness MUST be recomputed fresh
on every request (FR-009) -- no cached/stored plan artifact to go
stale.

**Scale/Scope**: MVP/dogfood scale, same as every prior phase -- one
student, a handful of concurrently-configured exams, dozens of scoped
concepts.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Renderer-Neutral Learner Graph)**: PASS — no
  graph-rendering code touched.
- **Principle II (Evidence-Backed Learner State, NON-NEGOTIABLE)**:
  PASS — this feature writes no learner state. It reads
  `getConceptState`/`getEdgeState`'s existing output; completing a
  plan item routes through `deterministic-grading`'s existing
  `commitEvidence`-backed actions (FR-012), same as `review-scheduler`.
  The one new table (`exam_configs`) holds configuration, not learner
  state -- it is never read by `computeLearnerState` and never
  represents mastery/evidence.
- **Principle III (Exposure Is Not Mastery)**: PASS / not directly
  applicable — no new evidence types or scoring logic; reads existing
  tiers unchanged.
- **Principle IV (Deterministic Verification First)**: PASS, and
  central here — stage boundaries and concept/question selection are
  both deterministic (FR-003/FR-004); the one optional LLM use
  (drafting stage wording, FR-005) is explicitly barred from deciding
  *what* is selected, only how it's presented, and is deferred for
  this pass regardless (research.md).
- **Principle V (Course-Grounded, Provenance-Preserving Claims)**:
  PASS — every plan/readiness item is an already-validated
  `question_bank` entry or existing course concept/edge; this feature
  produces no new course-specific claims.

No violations requiring Complexity Tracking. No new external
dependency. One new table, justified above (a real, demonstrated need
— a student's exam configuration has to live somewhere, and nothing
existing represents it), not an unjustified exception to the
no-new-persistence-without-need rule.

**Post-Phase-1 re-check**: data-model.md and
contracts/exam-planner-actions.md introduce nothing beyond what the
gates above already covered — no new write path beyond
`exam_configs`' own CRUD, no second grading/evidence path. Gates still
PASS.

## Project Structure

### Documentation (this feature)

```text
specs/010-exam-planner/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── exam-planner-actions.md
└── tasks.md             # Phase 2 output (/speckit-tasks — not yet created)
```

### Source Code (repository root)

```text
supabase/migrations/
└── 0008_exam_planner.sql   # exam_configs + RLS (user_id-keyed)

src/features/exam-planner/
├── stage-boundaries.ts      # Pure: computes the 4 stages' date ranges
│                               from (examDate, now), tunable stage-share
│                               weights
├── scoped-selection.ts      # Pure: restricts review-scheduler's
│                               rankConceptsByPriority/composeConnectSession's
│                               weak-edge detection to an exam's scope --
│                               no new selection algorithm
├── readiness-snapshot.ts    # Pure: buckets scoped concepts' existing
│                               LearnerConceptState into a readiness
│                               breakdown (by tier, misconception,
│                               untouched)
├── plan-composition.ts      # Pure: assembles stage-boundaries +
│                               scoped-selection into one StagedExamPlan
└── actions.ts                # "use server" -- exam_configs CRUD,
                                 assembles real inputs (course_concepts/
                                 concept_edges/question_bank/evidence
                                 state) and calls the pure functions
                                 above

src/app/courses/[courseId]/exam-plan/
└── page.tsx                  # Exam configuration + staged plan +
                                 readiness UI

tests/unit/exam-planner/
├── stage-boundaries.test.ts
├── scoped-selection.test.ts
├── readiness-snapshot.test.ts
└── plan-composition.test.ts
```

**Structure Decision**: Single Next.js project (existing), same
`src/features/<feature>/` + `src/app/courses/[courseId]/<route>/`
shape every prior feature uses. One new migration, no new npm
dependency.
