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

## Current status (snapshot, not a live tracker — verify against `specs/` before acting on it)

**As of 2026-09-01:**

- `.specify/memory/constitution.md` is filled in (v1.0.0) — the "run
  `/speckit-constitution`" step below is done, not pending.
- Phase 0 (`course-domain-schemas`), Phase 1
  (`account-course-artifact-foundation`), and Phase 2
  (`course-graph-ingestion`, `concept-atlas-renderer`) are fully
  implemented — every task in their `specs/NNN-*/tasks.md` is checked off,
  migrations pushed and RLS-verified live, visual regression suites
  passing.
- Phase 3 is fully implemented — both `learner-graph-evidence` and
  `tutor-agent` have every task in their `specs/NNN-*/tasks.md` checked
  off, migrations pushed and RLS-verified live (including a live
  two-account isolation check for evidence, and a live real-`gpt-4.1`
  conversation check for the tutor agent), unit tests and an E2E suite
  (the project's first authenticated Playwright coverage) passing.
- Phase 4 is fully implemented — both `deterministic-grading` and
  `assessment-generation-pipeline` have every task in their
  `specs/NNN-*/tasks.md` checked off, migrations pushed and
  RLS/FK-verified live. `deterministic-grading`'s live walkthrough
  confirmed real structured-answer evidence, real E2B-sandboxed code
  execution (pass/fail/timeout), and real rubric-based text grading.
  `assessment-generation-pipeline`'s live walkthrough confirmed a real
  blueprint reaching a fully-validated `question_bank` entry
  (independent-solve dispatching to `deterministic-grading`'s own
  checkers, never re-implementing one), a deliberately-wrong-answer
  candidate correctly rejected before the bank, and the ambiguity/
  similarity layers each correctly distinguishing a genuine case from a
  clean one against real model behavior. It has no live Trigger.dev
  project yet (`trigger.config.ts`'s own placeholder, same
  pre-existing gap as `course-graph-ingestion`'s extraction task) —
  live verification called `executeGeneration` directly rather than
  through a real queue, exercising the identical real
  generate-validate-persist logic the queue would run.
- Phase 5's `review-scheduler` (the adaptive-review half) is fully
  implemented — every task in `specs/009-review-scheduler/tasks.md` is
  checked off. It needed no new database table and no new npm
  dependency: the priority ranking, next-review-date, and both session
  types are pure functions over data `learner-graph-evidence`/
  `assessment-generation-pipeline` already produce. Live verification
  confirmed a real daily session (due concept with a question
  included, due concept with none correctly skipped), a real weekly
  Connect session (all four categories populated against real
  concepts/edges), and US2's spaced-review guarantee (a real correct
  vs. incorrect rubric-graded answer producing a later vs. sooner
  next-due date) against the real Supabase project and real OpenAI
  API. Phase 5's `exam-planner` half is also fully implemented — every
  task in `specs/010-exam-planner/tasks.md` is checked off, migration
  pushed and RLS-verified live. It needed exactly one new table
  (`exam_configs`, a student's exam date + scope) — the staged plan
  and readiness view are both computed fresh on every read, never
  stored. Three of its four plan stages are `review-scheduler`'s own
  ranking/weak-edge selection, scope-restricted, not reimplemented.
  Live verification confirmed a real ~20-day staged plan (diagnostic
  stage correctly surfacing thin-evidence concepts, interleaving
  correctly surfacing a real weak edge), a 2-day-out exam correctly
  compressing to only its final two stages summing to exactly 2 days,
  real readiness distinctly separating an unresolved misconception, an
  untouched concept, and normal tier buckets, and the plan/readiness
  genuinely reflecting new evidence and a past exam date without any
  reconfiguration step. Phase 5 is now fully done.
- Phase 6's `visual-assessment-graph-tree` — the final roadmap item —
  is fully implemented. Every task in
  `specs/011-visual-assessment-graph-tree/tasks.md` is checked off,
  migration pushed and RLS-verified live. It needed no new npm
  dependency (vision extraction reuses the existing `openai` client)
  and no new Postgres table — only a new Storage bucket
  (`assessment-drawings`) for retaining the drawing image itself.
  Grading reuses `deterministic-grading`'s existing checkers unchanged;
  rendering safely strips a question's embedded answer via the generic
  "claimed-field" mechanism `review-scheduler` had earlier deferred.
  Live verification (a real headless-browser-drawn canvas image, not a
  synthetic stand-in) confirmed a real correct and incorrect BFS
  drawing graded correctly, a real tree-traversal drawing graded
  correctly (proving the mechanism isn't hardcoded to one domain), and
  — after a real bug found live (a blank drawing initially reported
  confidence 1.0 with an empty extraction) was fixed with both a
  stricter prompt and a deterministic plausibility backstop — both a
  blank and a genuinely ambiguous drawing correctly triggered
  confirmation instead of silently grading. This closes out every item
  on this roadmap.

**This section will go stale the moment more work lands** — it is a
snapshot taken on the date above, not a maintained tracker. The
authoritative source for "what's actually done" is always each
`specs/NNN-*/tasks.md`'s own checkbox state (and, for *why* something was
built the way it was, `brain/decisions/architecture-log.md`), not this
prose. Don't re-run a Spec Kit command against a feature whose `tasks.md`
already shows it complete without checking first.

### Original "immediate next actions" (historical, both items now done)

1. ~~Run `/speckit-constitution`~~ — done, `.specify/memory/constitution.md` v1.0.0.
2. ~~Run `/speckit-specify` for `course-domain-schemas`~~ — done, see
   `specs/001-course-domain-schemas/`.

## Housekeeping

`ai_learning_project_summary.md` and `ai_learning_system_technical_prd.md`
at the repo root are untracked duplicates, byte-identical to
`docs/product-overview.md`'s source and `docs/technical-prd.md`. Safe to
delete once confirmed — not deleted here since that's a discard of files
this session didn't create.
