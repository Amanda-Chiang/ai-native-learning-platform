# Implementation Roadmap

**Status:** Active
**Date:** 2026-09-01
**Scope decision (confirmed with product owner 2026-09-01):** Full MVP per
`docs/technical-prd.md` §24 (Phases 0–6). Solo build. Dogfood domain: data
structures & algorithms.

## How this doc is used

This is a sequencing/roadmap document, not a bite-sized execution plan. Per
`CLAUDE.md`: *"Use Spec Kit (`/speckit-*` skills) for meaningful features
(concept atlas, ingestion, learner graph/evidence, assessment generation,
grading, review scheduler, exam planner, integrations)."* Every row below
maps to one or more Spec Kit feature specs — the actual task-by-task,
TDD-level plan is generated per feature by `/speckit-plan` +
`/speckit-tasks` when that feature's turn comes, not written wholesale here.
Writing six months of bite-sized code now, before Phase 1's real schema
exists, would be fiction that goes stale before it's read.

This roadmap exists to answer: *what order do features get built in, what
does each depend on, and when is each phase actually done.*

## Feasibility note (recap)

Flagged before this roadmap was written, still true: the PRD's "MVP" is the
full core product loop, not a thin slice — expect a multi-month solo build,
not weeks. Highest-risk single component is freehand-drawing → structured
graph/tree extraction (§16.5); build it last, after text/code grading has
already proven the evidence loop, exactly as the PRD's own Phase 6 ordering
has it.

## Correction to carry into Phase 2 planning

The PRD is internally inconsistent on the concept-atlas renderer:
- §13.7 and the decision log (§31) decide **React Flow + ELK**.
- §24 Phase 2 step 6 says "Cytoscape.js + ELK" (leftover from an earlier
  draft — §13.8 lists Cytoscape as the retained *alternative*, not the
  pick).

Use **React Flow + ELK**, per §13.7 and the decision log, and per
`.claude/skills/concept-atlas/`. When running `/speckit-specify` for the
concept atlas feature, state this explicitly so the generated spec doesn't
re-import the stale Cytoscape reference from §24.

## Phase → Spec Kit feature map

| PRD Phase | Deliverable | Spec Kit feature(s) to run | Depends on | Exit criterion (from PRD §24) |
|---|---|---|---|---|
| 0 | Core schemas (`CourseConcept`, `ConceptEdge`, `EvidenceEvent`, `Assessment`) + 30-concept/30-edge/20-question benchmark corpus from one real DSA course + evaluation rubrics | `course-domain-schemas` | none | Schemas + benchmark stable enough to diff prompt/pipeline changes against |
| 1 | Next.js app (already scaffolded) + Supabase Auth + Postgres schema/RLS + Storage upload + Trigger.dev + ingestion status UI | `account-course-artifact-foundation` | Phase 0 schemas | User uploads files, sees durable processing states |
| 2 | File-search indexing, concept extraction (Structured Outputs), dedupe/reconciliation, edge extraction + source anchors, internal review queue + student "report issue" action, React Flow + ELK course-graph render, layout persistence | `course-graph-ingestion`, `concept-atlas-renderer` | Phase 1 | Real course materials produce a legible, correct-enough map a student can navigate |
| 3 | `learner_concept_state` / `learner_edge_state` / `evidence_events` tables, weighted evidence algorithm, tutor agent tools (course search, learner-state lookup, record exposure, misconception candidate), grounded chat, concept detail panel with evidence provenance | `learner-graph-evidence`, `tutor-agent` | Phase 2 | Conversation affects exposure/misconception state but never fabricates mastery |
| 4 | Assessment blueprint schema, candidate generation, independent solve/reviewer step, deterministic checkers (BFS/DFS/heap/tree), question bank + validation status, text/code grading, evidence commit | `assessment-generation-pipeline`, `deterministic-grading` | Phase 3 | System generates and grades trustworthy DSA practice |
| 5 | Review-priority function, spaced review dates, daily session generation, weekly "Connect" session (weak edges), exam date/scope config, staged exam-plan generation, readiness dashboard | `review-scheduler`, `exam-planner` | Phase 4 | System answers "what should I study for 30 minutes today, and why?" |
| 6 | Graph/tree question renderer, web drawing/annotation input, vision parser → structured node/edge JSON, low-confidence confirmation UX, structural grading, evidence update | `visual-assessment-graph-tree` | Phase 4 (grading pipeline), Phase 2 (graph rendering) | One strong visual demo works end-to-end |

Phase 7 (Notion, iPad, Goodnotes, Canvas, VS Code) stays post-MVP per PRD
§21/§27 — out of scope for this roadmap; revisit after Phase 6 ships.

## Cross-cutting constraints every feature spec inherits

These come from `CLAUDE.md` and apply to every phase above without
restating per-feature:

- Canonical graph DTO stays renderer-neutral; renderer coordinates/state
  only in view adapters (`brain/architecture/graph-model.md`).
- Every learner-state mutation is backed by an immutable evidence record;
  no direct writes (`brain/architecture/learner-evidence.md`).
- Exposure ≠ mastery; only independent retrieval/application/transfer
  produces mastery-grade evidence.
- Deterministic verification wherever a domain is exactly checkable; LLM
  grading only where no exact checker exists, and only via structured
  rubric (`brain/architecture/ai-boundaries.md`).
- Course-specific claims carry source anchors to uploaded material.
- Student flags are signal, not ontology truth — never mutate canonical
  concepts/edges from a student's assertion alone.
- No graph database or new persistence layer without an ADR in
  `brain/decisions/` first.
- No new external dependency duplicating one already in the project.
- Run the relevant test suite (+ visual QA for Concept Atlas changes)
  before declaring any feature complete.

## Immediate next actions

1. **Run `/speckit-constitution`** to convert the still-template
   `.specify/memory/constitution.md` into real principles, seeded from the
   `CLAUDE.md` invariants above and PRD §3 (P1–P6). This has not been done
   yet — the constitution file is currently unfilled placeholders, and
   Spec Kit's other commands read it.
2. **Run `/speckit-specify` for `course-domain-schemas`** (Phase 0) — the
   only phase with no upstream dependency. Its output (schemas + benchmark
   corpus) gates everything else, including whether Phase 1's Postgres
   schema needs revision.
3. Do not start Phase 1 scaffolding work in parallel — Postgres tables in
   §10 are derived directly from the Phase 0 schemas; sequencing matters
   here even though this is a solo build.

## Housekeeping

`ai_learning_project_summary.md` and `ai_learning_system_technical_prd.md`
at the repo root are untracked duplicates, byte-identical to
`docs/product-overview.md`'s source and `docs/technical-prd.md`. Safe to
delete once confirmed — not deleted here since that's a discard of files
this session didn't create.
