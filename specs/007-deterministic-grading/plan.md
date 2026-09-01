# Implementation Plan: Deterministic Grading

**Branch**: `007-deterministic-grading` | **Date**: 2026-09-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-deterministic-grading/spec.md`

## Summary

Five pure, exactly-checkable reference functions (BFS/DFS, heap, tree,
topological sort, bounded shortest-path) grade structured DSA responses
by direct computation, never LLM judgment (Constitution Principle IV).
Code responses run in a real E2B sandbox — a genuinely new dependency,
justified because nothing in this project can safely execute untrusted
code today — with an LLM permitted only to explain the real pass/fail
result afterward, never to override it. Free-text responses are graded
against a structured rubric via the existing `openai` client (no new
LLM-calling infrastructure), with a confidence check that flags,
rather than silently trusts, an ambiguous grading. Every path ends in
one call to `learner-graph-evidence`'s existing `commitEvidence` — this
feature never writes learner state directly.

## Technical Context

**Language/Version**: TypeScript, Next.js 16.3.4, Node 24 (matches every
prior phase)

**Primary Dependencies**: `@e2b/code-interpreter` (**new** — see
research.md "Why E2B is a justified new dependency"; nothing else in
this project can safely execute untrusted student/generated code).
`openai` (existing, already used by `course-graph-ingestion` and
`tutor-agent`) for rubric-based text grading — no second LLM client.

**Storage**: PostgreSQL via Supabase. New table: `assessment_attempts`
(migration `0006_deterministic_grading.sql`) — this is the feature that
finally backs the FK on `evidence_events.assessment_attempt_id`, left
deliberately unconstrained since `0004_learner_evidence.sql` ("no
assessment_attempts table exists yet"). Holds a lightweight snapshot of
the question/response/grading result rather than a FK into a question
bank, since `assessment-generation-pipeline` (which will own that bank)
doesn't exist yet — see research.md.

**Testing**: `node --test` for all five checkers, exhaustively (pure
functions, the highest-value test surface here, same reasoning as
`learner-graph-evidence`'s `computeLearnerState`) and for the rubric
grader's pure validation/confidence-threshold logic. E2B sandbox
execution gets a small number of live smoke tests requiring a real
`E2B_API_KEY` (quickstart.md Group B), since sandbox behavior can't be
meaningfully faked without losing the point of using a real sandbox.

**Target Platform**: Next.js server actions, same as every prior
feature. No new background job — a single sandbox run or checker call
is a bounded request/response, not a long-running process.

**Project Type**: Web application (existing single Next.js project)

**Performance Goals**: Checkers run in well under a second on
classroom-scale inputs (dozens of nodes, not web-scale graphs — spec.md
Assumptions); no stricter target justified without real usage data.
Sandbox execution has real cold-start/network latency (E2B's own
infrastructure) — no aggressive latency target beyond "reasonable for
interactive grading," matching this project's existing non-strict-
latency stance for external-service calls elsewhere (e.g.
`course-graph-ingestion`'s extraction timeout).

**Constraints**: No checker may call an LLM for primary correctness
(FR-004). A code grading result must come from an actual sandbox
execution, never a model-invented summary (FR-006). Every grading
result of any response type must end in a real `commitEvidence` call
(FR-011) — enforced structurally by having exactly one grading-evidence
composition function all three grading paths funnel through, not left
to each path to remember independently.

**Scale/Scope**: MVP/dogfood scale, same as every prior phase.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Renderer-Neutral Learner Graph)**: PASS / not
  applicable — this feature touches no rendering code at all.
- **Principle II (Evidence-Backed Learner State, NON-NEGOTIABLE)**: PASS
  — every grading path (checker, sandbox, rubric) composes down to one
  shared `commitEvidenceFromGradingResult` function that is the only
  caller of `learner-graph-evidence`'s `commitEvidence`; no code in this
  feature writes `learner_concept_state`/`learner_edge_state` directly.
- **Principle III (Exposure Is Not Mastery)**: PASS / not directly
  applicable — this feature introduces no new evidence types or scoring
  logic; it derives `correctness`/`assistanceLevel`/`graderConfidence`
  from the real grading outcome and passes them into the
  already-guaranteed `computeLearnerState` unchanged.
- **Principle IV (Deterministic Verification First)**: PASS, and this
  is this feature's entire reason to exist — five domains get exact
  checkers; code gets a real sandbox run; only free text (genuinely
  no exact checker possible) gets LLM-based grading, and only against a
  structured rubric with a required low-confidence flag, never
  free-form judgment.
- **Principle V (Course-Grounded, Provenance-Preserving Claims)**: PASS
  / not directly applicable — this feature grades a response against a
  question's already-authored answer key/rubric; it doesn't produce new
  course-specific claims itself (that's `assessment-generation-pipeline`'s
  job).

No violations requiring Complexity Tracking. The one new external
dependency (`@e2b/code-interpreter`) is justified above and in
research.md, not a Constitution violation — the "no new dependency"
rule requires justification, not prohibition, when no existing
dependency solves the problem.

**Post-Phase-1 re-check**: data-model.md and contracts/grading-actions.md
introduce nothing beyond what the gates above already covered. Worth
confirming explicitly: `commitEvidenceFromGradingResult` (data-model.md)
is structurally the only path from a `CheckerResult`/`CodeGradingResult`/
`RubricGradingResult` to `commitEvidence` — no grading action calls
`commitEvidence` directly. No new violations; gates still PASS.

## Project Structure

### Documentation (this feature)

```text
specs/007-deterministic-grading/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── grading-actions.md
└── tasks.md             # Phase 2 output (/speckit-tasks — not yet created)
```

### Source Code (repository root)

```text
supabase/migrations/
└── 0006_deterministic_grading.sql   # assessment_attempts + RLS
                                        # (user_id-keyed); adds
                                        # evidence_events.assessment_attempt_id FK

src/features/deterministic-grading/
├── checkers/
│   ├── bfs-dfs-checker.ts             # Pure: traversal state/order
│   ├── heap-checker.ts                # Pure: heap ops + property validity
│   ├── tree-checker.ts                # Pure: traversal + insertion
│   ├── topological-sort-checker.ts    # Pure: ordering validity
│   └── shortest-path-checker.ts       # Pure: bounded-graph shortest paths
├── code-sandbox-grader.ts             # E2B execution -> CodeGradingResult
├── rubric-grader.ts                   # openai call -> RubricGradingResult
├── grading-evidence.ts                # Any grading result -> commitEvidence
│                                         input (the one structural funnel,
│                                         Constitution Principle II)
└── actions.ts                          # Server actions: gradeStructuredResponse,
                                          gradeCodeResponse, gradeTextResponse

tests/unit/deterministic-grading/
├── bfs-dfs-checker.test.ts
├── heap-checker.test.ts
├── tree-checker.test.ts
├── topological-sort-checker.test.ts
├── shortest-path-checker.test.ts
├── rubric-grader-validation.test.ts    # Pure confidence-threshold/rubric-shape logic
└── grading-evidence.test.ts
```

**Structure Decision**: Extends the existing single-Next.js-project
layout, same conventions as every prior feature. No new UI route (this
feature has no interactive surface of its own yet — it's a grading
capability called by `tutor-agent`/`assessment-generation-pipeline`,
same relationship `learner-graph-evidence` has to its own callers). No
`trigger/` background task — a grading call is a bounded request/response.

## Complexity Tracking

*No Constitution Check violations — table intentionally omitted. The
new `@e2b/code-interpreter` dependency is justified above, not a
violation requiring this table.*
