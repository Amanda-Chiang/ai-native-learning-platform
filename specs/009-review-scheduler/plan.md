# Implementation Plan: Review Scheduler

**Branch**: `009-review-scheduler` | **Date**: 2026-09-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-review-scheduler/spec.md`

## Summary

A deterministic review-priority ranking (forgetting risk, course
importance, evidence thinness, prerequisite centrality, unresolved
misconception, and a neutral exam-weight placeholder until
`exam-planner` exists) drives two read-only session-generation
functions: a time-bounded daily session and a weekly "Connect" session.
Both are pure computations over data this project already has —
`evidence_events` (via the existing `computeLearnerState`),
`course_concepts`/`concept_edges` (importance, prerequisite edges,
`contrasts_with` edges), and `assessment-generation-pipeline`'s
`question_bank` — so this feature introduces **no new database table**.
"When a concept is next due" is likewise derived on read from evidence
history, not stored and incrementally patched, matching the project's
established recompute-from-log discipline. Completing a session item
goes through the existing grading/evidence-commit pipeline unchanged
(FR-010) — this feature only decides *what* to show and *why*, never
how an answer is judged.

## Technical Context

**Language/Version**: TypeScript, Next.js 16.3.4, Node 24 (matches every
prior phase)

**Primary Dependencies**: None new. Reuses `learner-graph-evidence`'s
`computeLearnerState` (unchanged) for per-concept/per-edge mastery,
recency, and misconception state; reads
`assessment-generation-pipeline`'s `question_bank` (read-only, no
write path added here); reuses `deterministic-grading`'s existing
grading/evidence-commit actions when a student completes a session
item (FR-010) — this feature adds no second grading path.

**Storage**: PostgreSQL via Supabase. **No new table.** Every input the
review-priority ranking needs (mastery/recency/misconception state,
course importance, prerequisite/contrast edges, validated questions)
already exists in `course_concepts`, `concept_edges`, `evidence_events`,
and `question_bank`. "Next review date" is a pure function of
`computeLearnerState`'s existing `lastEvidenceAt`/tier/score output, not
a new stored, incrementally-patched column — see research.md
"Why no new persistence layer."

**Testing**: `node --test` for the priority-ranking function, the
next-review-date function, daily/weekly session composition, and the
time-budget bounding logic — all pure, all exhaustively testable with
constructed evidence/course fixtures, no live call required (same
"pure logic vs. live-verified" split as every prior feature). Live
verification (quickstart.md) confirms the real read queries against a
real Supabase project and a real `question_bank` populated by
`assessment-generation-pipeline`.

**Target Platform**: Next.js server actions, same as every prior
feature. No background job — ranking and session composition are
synchronous, bounded reads with no LLM call anywhere in this feature's
own code (FR-002).

**Project Type**: Web application (existing single Next.js project)

**Performance Goals**: Session generation returns in well under a
second — it's a handful of bounded Postgres reads plus pure in-memory
ranking, no external model call, unlike
`assessment-generation-pipeline`'s multi-call pipeline.

**Constraints**: The ranking function MUST be deterministic (FR-002) —
no LLM call may influence which concepts are due or their order. Every
session item MUST be a real `question_bank` entry (FR-006), never a
question invented for the session. Completing an item MUST route
through the existing grading/evidence-commit pipeline (FR-010) — no
second write path to `evidence_events`. The exam-relevance ranking
factor MUST default to a neutral, non-distorting constant until
`exam-planner` exists (FR-012) — never a fabricated exam date/scope.

**Scale/Scope**: MVP/dogfood scale, same as every prior phase — one
student, one course, dozens of concepts, not web-scale.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Renderer-Neutral Learner Graph)**: PASS — this feature
  touches no graph-rendering code. Its own UI (a session page) presents
  ranked questions, not the concept graph itself.
- **Principle II (Evidence-Backed Learner State, NON-NEGOTIABLE)**:
  PASS — this feature writes no learner state at all. It reads
  `computeLearnerState`'s existing output and, when a session item is
  completed, calls the existing grading actions' own
  `commitEvidence`-backed path (FR-010) — no direct write, no second
  evidence-producing code path.
- **Principle III (Exposure Is Not Mastery)**: PASS / not directly
  applicable — this feature introduces no new evidence types or scoring
  logic; the priority ranking reads `computeLearnerState`'s
  already-guaranteed tiers unchanged.
- **Principle IV (Deterministic Verification First)**: PASS, and
  central to this feature — the review-priority ranking and next-review
  date are pure, deterministic functions of stored state (FR-001/FR-002);
  no LLM judgment decides what's due or in what order.
- **Principle V (Course-Grounded, Provenance-Preserving Claims)**: PASS
  — every session item is an already-validated `question_bank` entry
  carrying its own source anchors from `assessment-generation-pipeline`;
  this feature produces no new course-specific claims of its own.

No violations requiring Complexity Tracking. No new external dependency,
no new persistence layer — the "no new dependency/persistence without
demonstrated need" rule is satisfied by there being no demonstrated need
at all, not by an unjustified exception.

**Post-Phase-1 re-check**: data-model.md and contracts/scheduler-actions.md
introduce nothing beyond what the gates above already covered — no new
table, no new write path. Gates still PASS.

## Project Structure

### Documentation (this feature)

```text
specs/009-review-scheduler/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── scheduler-actions.md
└── tasks.md             # Phase 2 output (/speckit-tasks — not yet created)
```

### Source Code (repository root)

```text
src/features/review-scheduler/
├── review-priority.ts          # Pure: computes the per-concept/edge
│                                  priority score from
│                                  computeLearnerState + course_concepts/
│                                  concept_edges inputs
├── next-review-date.ts         # Pure: derives "when is this concept
│                                  next due" from computeLearnerState's
│                                  lastEvidenceAt/tier/score, no new
│                                  stored column
├── daily-session.ts             # Pure: composes a time-bounded, ranked
│                                  daily session from due concepts +
│                                  available question_bank entries
├── connect-session.ts           # Pure: composes the weekly session's
│                                  four categories (new concepts, weak
│                                  new-to-old edges, low-connectivity
│                                  concepts, contrasts_with pairs)
└── actions.ts                    # "use server" -- reads
                                    course_concepts/concept_edges/
                                    evidence_events/question_bank,
                                    calls the pure functions above

src/app/courses/[courseId]/study/
└── page.tsx                      # Daily + weekly session UI -- routed
                                    under /study, not /review, since
                                    /review already exists
                                    (course-graph-ingestion's ontology
                                    confirmation queue, an unrelated
                                    "review" -- research.md)

tests/unit/review-scheduler/
├── review-priority.test.ts
├── next-review-date.test.ts
├── daily-session.test.ts
└── connect-session.test.ts
```

**Structure Decision**: Single Next.js project (existing), following
the same `src/features/<feature>/` + `src/app/courses/[courseId]/<route>/`
shape every prior feature uses. No new migration, no new npm
dependency.
