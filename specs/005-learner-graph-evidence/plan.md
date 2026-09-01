# Implementation Plan: Learner Graph Evidence

**Branch**: `005-learner-graph-evidence` | **Date**: 2026-09-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-learner-graph-evidence/spec.md`

## Summary

Every commit of student evidence appends an immutable `evidence_events`
row, then a pure, weights-as-config algorithm recomputes that concept's
or edge's full learner state **from its entire evidence history**, not by
incrementally patching a running score — `learner_concept_state`/
`learner_edge_state` are a rebuildable cache of that computation, never
the source of truth. Exposure is capped at the "exposed" tier by
construction (the algorithm's own tier math, not a special-cased check
layered on top); misconception detection runs as part of the same
recompute. A new overlay function composes this real per-student state
on top of `course-graph-ingestion`'s existing baseline `CourseGraph`,
leaving that feature's own baseline logic untouched.

## Technical Context

**Language/Version**: TypeScript, Next.js 16.3.4, Node 24 (matches Phases 0-2)

**Primary Dependencies**: None new — `@supabase/supabase-js` (existing).
This feature is pure computation plus Postgres reads/writes; no LLM call,
no background job, no new package.

**Storage**: PostgreSQL via Supabase. New tables: `evidence_events`,
`learner_concept_state`, `learner_edge_state` (data-model.md). Keyed by
`user_id`, not `owner_id` — see research.md "Evidence belongs to the
student, not the course owner" for why this differs from every prior
table's RLS pattern in this project, and why that's the more robust
choice given multi-student support is an explicit, already-planned
future need (not speculative).

**Testing**: `node --test` for the state-computation algorithm (pure,
the highest-value thing to test exhaustively here — every FR in this
spec is really a claim about this one function's behavior) and the
CourseGraph overlay function; no new Playwright suite (this feature adds
no new interactive UI of its own — it changes what data an already-tested
UI, `concept-atlas-renderer`'s `ConceptDetailPanel`, displays, covered by
extending that existing visual suite, not a new one).

**Target Platform**: Next.js server actions only. Evidence commit is a
synchronous read-recompute-write within one request — not a background
job like `course-graph-ingestion`'s OpenAI calls, since it's pure
computation over a bounded evidence history, not an external API call.

**Project Type**: Web application (existing single Next.js project)

**Performance Goals**: Recompute-from-full-history (research.md) means
commit latency scales with how much evidence exists for one
concept/edge for one student — bounded by realistic classroom use (tens
to low hundreds of events per concept over a course), not unbounded
growth. No stricter target justified without real usage data, same
reasoning already used for `course-graph-ingestion`'s extraction timeout.

**Constraints**: Every learner-state write MUST be preceded by an
evidence_events insert in the same operation (Constitution Principle II)
— enforced structurally (research.md), not by convention. No new
external credential is required by this feature.

**Scale/Scope**: MVP/dogfood scale, same as Phases 1-2 — one
owner-operated course, "student" and course owner are the same account
for now (no separate enrollment/multi-student model exists anywhere in
this project yet — spec.md Assumptions).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Renderer-Neutral Learner Graph)**: PASS. Learner state
  overlays the existing `CourseGraph` DTO through a new, separate pure
  function (`applyLearnerState`) — no renderer-specific field is added
  anywhere in this feature's data model, and `course-graph-ingestion`'s
  own baseline-materialization logic is not modified, only composed with.
- **Principle II (Evidence-Backed Learner State, NON-NEGOTIABLE)**: PASS
  — this is this feature's entire reason to exist. The single write path
  (`commitEvidence`, contracts/evidence-actions.md) always inserts an
  `evidence_events` row before ever touching `learner_concept_state`/
  `learner_edge_state`, in one transaction. No other code path in this
  feature writes those two tables.
- **Principle III (Exposure Is Not Mastery)**: PASS, and structurally so
  rather than by a bolt-on check: research.md's tier-mapping design means
  exposure-tier evidence mathematically cannot produce a score above the
  "exposed" cutoff, because only retrieval/application/transfer evidence
  types carry a strength weight above that cutoff in the first place —
  there's no `if (exposure) cap-at-exposed` special case to forget to
  maintain.
- **Principle IV (Deterministic Verification First)**: PASS / not
  applicable to new work — this feature doesn't grade anything; it
  records the *result* of grading (already decided elsewhere, e.g. a
  future `assessment-generation-pipeline` evidence commit) as evidence.
  The state-computation algorithm itself is fully deterministic given its
  inputs (no LLM call anywhere in this feature).
- **Principle V (Course-Grounded, Provenance-Preserving Claims)**: PASS /
  not directly applicable — this feature doesn't produce course-specific
  claims (concepts/edges); it produces learner-specific state derived
  from evidence, which is a different kind of provenance
  (evidence-to-state, not claim-to-source-artifact) already covered by
  Principle II above.

No violations requiring Complexity Tracking.

**Post-Phase-1 re-check**: data-model.md and contracts/evidence-actions.md
introduce nothing beyond what the gates above already covered. Worth
confirming explicitly: `computeLearnerState` enforces Principle III by
construction (exposure's strength weight sits below the exposed/weak
cutoff in the shipped default `EvidenceWeights`, so no exposure-only
input can mathematically cross it — not a runtime `if` that could be
forgotten in a future edit), and `commitEvidence` is the single write
path touching `learner_concept_state`/`learner_edge_state`, always
preceded by the `evidence_events` insert in the same operation
(Principle II). No new violations; gates still PASS.

## Project Structure

### Documentation (this feature)

```text
specs/005-learner-graph-evidence/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── evidence-actions.md
└── tasks.md             # Phase 2 output (/speckit-tasks — not yet created)
```

### Source Code (repository root)

```text
supabase/migrations/
└── 0004_learner_evidence.sql   # evidence_events, learner_concept_state,
                                  # learner_edge_state + RLS (user_id-keyed)

src/features/learner-graph-evidence/
├── evidence-weights.ts          # The algorithm's config: evidence-type
│                                  # strengths, recency half-life,
│                                  # independence threshold, tier cutoffs,
│                                  # misconception threshold -- one place,
│                                  # not scattered magic numbers
├── compute-learner-state.ts     # Pure: EvidenceEvent[] + weights + now
│                                  # -> LearnerConceptState/LearnerEdgeState
├── apply-learner-state.ts       # Pure: CourseGraph (baseline) +
│                                  # state maps -> CourseGraph (overlaid)
└── actions.ts                    # Server actions: commitEvidence,
                                   # getConceptState, getEdgeState,
                                   # getCourseGraphForLearner

tests/unit/learner-graph-evidence/
├── compute-learner-state.test.ts
└── apply-learner-state.test.ts
```

**Structure Decision**: Extends the existing single-Next.js-project
layout, same conventions as `course-graph-ingestion`. No `trigger/` task
this time (Technical Context) and no new `tests/visual/` suite (extends
`concept-atlas-renderer`'s existing one instead) — both deliberate
absences, not oversights, explained above and in research.md.

## Complexity Tracking

*No Constitution Check violations — table intentionally omitted.*
