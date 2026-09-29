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

**Post-MVP work (2026-09-04 through 2026-09-14), outside this roadmap's
phase numbering:**

- **Lightweight daily MCQ quiz** (new, additive generation path closing
  a real gap: `question_bank` had zero rows in every real course because
  `assessment-generation-pipeline`'s `requestQuestionGeneration` was
  real but never wired to any UI). Fires automatically once an
  extraction run's review popup is dismissed or every concept/unit from
  it leaves `proposed`, generating grounded 4-option multiple-choice
  questions (one model call per concept scoring `importance_score >=
  0.6`) for the existing Study tab/spaced-repetition flow — deliberately
  a separate, cheaper pipeline from the heavy one, keeping only its
  ambiguity check. Full design, schema changes, and a real bug found
  live (a missing `evidence_events` origin on first real answer): see
  `docs/superpowers/specs/2026-09-12-lightweight-daily-quiz-design.md`
  and `brain/decisions/architecture-log.md`'s 2026-09-12/14 entry.
  `assessment-generation-pipeline`'s own heavy pipeline is still
  unwired to any UI — a real, separate, still-open gap this work
  deliberately did not close.

- **UI polish/bug-fix batch (2026-09-11 through 2026-09-14)**, several
  independent real bugs found via direct use, not a single feature:
  the header still showed a leftover "AI-Native Learning Platform"
  link and unstyled sign-in/out markup (removed/restyled, and moved
  into the `(app)` route group's own layout so sign-in/sign-up don't
  show it); `body` used `min-height:100%` instead of `height:100%`, so
  the sidebar and centered page content fell short of the viewport on
  any page shorter than the screen (Today, sign-in, an empty course);
  a course's tab bar could keep a stray underline on an inactive tab
  after navigating away, and later the same root cause (mixing a CSS
  shorthand base style with a longhand override — React's inline-style
  diffing doesn't safely handle that pairing across renders) recurred
  twice more in one component (`MultipleChoiceForm`, below) and one
  unrelated one (`artifact-board.tsx`'s upload dropzone) — all fixed
  the same way, with a standing rule logged so it isn't repeated again;
  a course-detail page fell back to displaying the raw course UUID as
  its name when the lookup failed (now "Demo course"/"Unknown course",
  never the id); the exam-plan config form required typing raw concept
  UUIDs into a text field (replaced with a real multi-select dropdown
  of confirmed concept names, plus a related bug where its checkboxes
  unmounted on panel-close and silently dropped the selection); and a
  real extraction run had produced a concept with an empty name/
  description that Structured Outputs' `type: "string"` doesn't forbid
  (added non-empty-string validation across every model-produced string
  field in `course-graph-ingestion`'s extraction parser). Full account
  of each: `brain/decisions/architecture-log.md`'s 2026-09-11 and
  2026-09-14 entries.

- A full design-system + reskin pass: every real route now renders through
  shared tokens/shell components instead of bare HTML, plus two genuinely
  new real pages (`/` Today dashboard aggregating exam dates across
  courses; `/courses/{id}/review` spaced-repetition due-queue), both
  reading existing `review-scheduler`/`exam-planner`/`courses` data —
  no new domain logic. Plan: `.claude/plans/staged-wibbling-melody.md`
  (kept outside `docs/` — a design/reskin pass, not a Spec Kit feature).
- **Unit extraction & reconciliation** (`course-graph-ingestion`,
  Phase 2): fixed a real structural bug — extraction had no way to create
  a `course_units` row and threw on any course with zero units, and there
  was no UI path to create one. Built via `superpowers:brainstorming` →
  `superpowers:writing-plans` → `superpowers:subagent-driven-development`
  rather than `/speckit-*` (an enhancement to an already-shipped feature,
  not a new one). `course_units` now has the same proposed/confirmed/
  archived review lifecycle as concepts; edges left manual review
  entirely and auto-confirm once both endpoint concepts are confirmed.
  Full rationale for both decisions, plus a live-testing finding that
  Supabase Realtime had never actually been enabled project-wide (fixed,
  pre-existing gap): `brain/decisions/architecture-log.md`'s 2026-09-05
  entries. Design/plan: `docs/superpowers/specs/
  2026-09-05-unit-extraction-reconciliation-design.md`,
  `docs/superpowers/plans/2026-09-05-unit-extraction-reconciliation.md`.
  `specs/004-course-graph-ingestion/{spec,data-model}.md` were amended in
  place to match current reality — read those, not the original spec/plan
  history, for current requirements.
- **Review-queue fix + units-only review gate** (`course-graph-ingestion`,
  Phase 2): a real reported bug (editing a proposed concept/unit and
  clicking Save silently discarded the edit) traced to duplicate DOM ids
  across the review queue's always-visible list and its popup, both
  rendering the same candidate at once. Fixed, then the always-visible
  list was removed outright (the popup is now the only review surface;
  `proposed` is a valid indefinitely-resting status, so dismissing the
  popup is a safe deferral, not a forced decision). Separately, reverses
  part of the 2026-09-05 unit-review decision above: units alone are now
  the review-gated side of extraction — a routine concept under an
  already-confirmed unit auto-confirms immediately (at insert time, or via
  a confirm-time cascade once its unit catches up), while an uncertain
  reconciliation match (either kind) still always needs individual review.
  `rejectCandidate` can now archive an already-confirmed concept too, not
  only a proposed one. `specs/004-course-graph-ingestion/{spec,data-model}.md`
  amended in place again. Full rationale: `brain/decisions/
  architecture-log.md`'s 2026-09-07 entries. Known gap: no UI yet exists
  to edit/reject a concept once it has left the review popup (the server
  actions support it; nothing calls them from elsewhere yet).
- **`quality-gates` CI actually goes green for the first time** (no
  feature scope — every run of this workflow, since it was introduced,
  had failed, always at a different point because each failure was
  masking the next one). Found and fixed, in order: Typecheck ran before
  `next typegen` ever generated `.next/types/`, so `layout.tsx`'s
  `LayoutProps` could never resolve; the E2E job had no Supabase/OpenAI
  secrets wired in at all; Playwright had no `testMatch` and was also
  trying to load `tests/unit/**/*.test.ts` as specs; `uploadArtifact`
  crashed the whole page when `TRIGGER_SECRET_KEY` isn't set (a 5th
  instance of the 2026-09-02 hardening pass's unguarded-external-call
  bug class); `AppShell`'s sidebar was a fixed 220px with no mobile
  collapse at all (and the first fix attempt introduced a real SSR
  hydration bug, fixed with a shared `useMobileBreakpoint`
  `useSyncExternalStore` hook, `src/lib/use-mobile-breakpoint.ts`);
  `review-queue.spec.ts`'s wrong-route bug (`specs/004-course-graph-
  ingestion/tasks.md`'s own 2026-09-08 addendum) turned out to have a
  second, compounding cause; every checked-in visual snapshot was
  `-darwin`-only with no Linux baseline, so the suite could never have
  passed on CI's own `ubuntu-latest` runner regardless of app
  correctness. Separately (a genuine test-design question, not a CI-
  wiring one): 3 `concept-atlas` visual tests clicked nodes off-screen
  on mobile by FR-013's own deliberate design (confirmed against
  `specs/003-concept-atlas-renderer/tasks.md` — the feature is fully
  implemented, this was never a completeness gap), now skipped on
  mobile with that reason; `tutor-agent-e2e`'s entire suite was stale
  relative to the reskin (wrong placeholder text, an icon-only Send
  button with no accessible name) plus one genuine data-timing race
  fixed by waiting on a real completion signal instead of a fixed
  sleep. Full account, in the order each was found: `brain/decisions/
  architecture-log.md`'s 2026-09-08 and 2026-09-09 entries.

**Post-MVP work (2026-09-15 through 2026-09-27), continued:**

- **A real, direct-feedback UI simplification batch (2026-09-17 through
  2026-09-21)**, `review-scheduler`/`courses`: Home's daily-session
  preview was leaking each session item's raw `questionText` (effectively
  the answer) before the student ever opened Study — fixed by resolving
  concept names separately in `today.ts` instead, leaving
  `review-scheduler`'s own domain types untouched. The course shell's
  "Study" nav tab was removed as a genuine duplicate of Review's own
  "Start review" button (both led to the same page) — the route/page
  itself stayed, only the redundant top-level entry point went, along
  with its now-unused `IconStudy`. The weekly Connect session then moved
  from Study to Review (as its own non-overlapping panel, only shown
  once the viewport is wide enough to avoid covering the due list) and
  had two of its four categories (`lowConnectivityConcepts`,
  `confusedPairs`) cut outright after the panel was reported as
  showing more than a student needed. Full rationale for each:
  `brain/decisions/architecture-log.md`'s 2026-09-17, 09-18 (two
  entries), 09-20, and 09-21 entries. `specs/009-review-scheduler`
  amended in place (see its own addendum) for the Connect changes.
- **An unused-variable sweep (2026-09-23)** across the whole project
  (`tsc --noUnusedLocals --noUnusedParameters`, not on by default) found
  4 hits outside `review-scheduler`/`courses` (already clean). 2 were
  real bugs, not dead code: `visual-assessment`'s `[questionId]/page.tsx`
  had an unused `TREE_DOMAINS` because its layout-choice ternary silently
  treated "not graph" as "must be tree," so a `"heap"`-domain question
  (in neither list) would have hit `layoutTree(undefined)` instead of
  the page's own "not supported" message — fixed by checking membership
  in either list explicitly. `exam-planner`'s `ExamPlanner.tsx` had three
  `useState` setters (`setConfig`/`setPlan`/`setReadiness`) nobody ever
  called — genuine dead weight, replaced with plain const aliases of the
  props. Full account: `brain/decisions/architecture-log.md`'s
  2026-09-23 entry.
- **Multiple exams per course (2026-09-26/27)**, `exam-planner`: a
  student could previously configure only one exam per course —
  `configureExam` looked up any existing row for that course and
  overwrote it. No migration was needed (`exam_configs` never had a
  uniqueness constraint forcing this; it was pure application logic).
  Built via `superpowers:brainstorming` → `superpowers:writing-plans` →
  `superpowers:subagent-driven-development` (a 10-task plan, executed
  with a fresh subagent per task plus a final whole-branch review that
  caught 3 real cross-task integration gaps — a dropdown selection lost
  across mutation reloads, a loading state that could latch forever on a
  failed fetch, and a stale contract doc — all fixed in one follow-up
  pass). `configureExam` is insert-only now; `getExamConfig` is gone,
  replaced by `listExamConfigs`/`updateExamConfig`/`deleteExamConfig`;
  `getExamPlan`/`getExamReadiness` are keyed by `examConfigId`, deriving
  `courseId` from the fetched row itself. Today's dashboard now lets
  every exam (not just one per course) compete for the nearest-exam
  banner and Upcoming top-3. Live verification also found and fixed one
  genuinely pre-existing accessibility bug (`ConceptScopeSelect`'s
  trigger button had a static accessible name instead of its real
  dynamic selection state). Design: `docs/superpowers/specs/
  2026-09-26-multiple-exams-per-course-design.md`; plan:
  `docs/superpowers/plans/2026-09-26-multiple-exams-per-course.md`;
  full account: `brain/decisions/architecture-log.md`'s 2026-09-26
  entries. `specs/010-exam-planner/tasks.md` amended with an addendum.

Known open items, not yet resolved as of 2026-09-29:
- **Two `-linux` visual baselines are stale and will fail CI.**
  `tests/visual/quick-review.spec.ts-snapshots/quick-review-skip-dialog-{chromium,mobile}-linux.png`
  still depict the progress bar at 0%. The bar now counts skipped
  questions, so that capture reads 100%; only the `-darwin` pair could
  be regenerated locally, because macOS cannot produce `-linux`
  baselines. Regenerating them needs the temporary-workflow dispatch on
  `main`, which needs the product owner's authorization. Until then
  those two comparisons fail legitimately — the baselines are stale and
  the UI is correct, which is the opposite of the usual reason a visual
  test goes red, so check this entry before debugging the component.
- **`main` is ahead of `origin/main` and unpushed** as of this writing,
  so CI has not run on the Phase 4 merge at all. The local full suite is
  green (typecheck clean, eslint 0 errors / 8 pre-existing warnings,
  405/405 unit, Playwright 31 passed / 3 skipped / 0 failed).
- `quality-gates` is green except for
  `tests/e2e/course-graph-ingestion-pipeline.spec.ts` (both projects),
  and the cause is **operational, not a code defect**: the OpenAI
  account has no credits, so the one spec that makes a real (un-doubled)
  model call gets `429 You have no credits remaining`. Confirmed
  identically locally and on CI. Adding credits should turn it green
  with no code change; nothing in the ingestion pipeline is known to be
  broken. See `brain/decisions/architecture-log.md`'s 2026-09-28 entry
  for the full diagnosis, including why the `tutor-agent` suite is
  unaffected (it uses a test double).
- `assessment-generation-pipeline`'s heavy (checker-domain/free-text)
  generation path is real and tested but still unwired to any UI —
  `requestQuestionGeneration` exists, but no page/button anywhere calls
  it. The lightweight-quiz work above deliberately built a separate,
  cheaper path rather than closing this gap.
- ~~No integration-shaped test composes the full extract → reconcile →
  confirm → materialize pipeline end-to-end~~ — closed 2026-09-15:
  `tests/e2e/course-graph-ingestion-pipeline.spec.ts` runs the real
  mechanism (a real OpenAI extraction call, real reconciliation, a real
  Review Queue confirm, a real `/atlas` render) end-to-end against a
  real Supabase project. Required factoring `extractCourseGraphTask`'s
  inline `run` body into an exported `executeExtraction` function
  (`trigger/extract-course-graph.ts`), matching the pattern
  `generate-assessment.ts`/`generate-lightweight-quiz.ts` already used
  for the same no-live-Trigger.dev-queue reason. See
  `brain/decisions/architecture-log.md`'s 2026-09-15 entry.
- Task 13 of the unit-extraction plan (a formal 6-scenario live
  walkthrough) has no recorded "all pass" checkpoint — live testing found
  and fixed real bugs organically instead, which is arguably stronger
  coverage, but nothing was formally signed off scenario-by-scenario.
- Two narrow, pre-existing gaps in `exam-planner`, deferred rather than
  fixed during the 2026-09-26/27 multiple-exams-per-course final review
  (both judged real but out of scope for that change): editing an exam's
  scope can silently drop a previously-scoped concept if it's since been
  unconfirmed/deleted (`ConceptScopeSelect` only renders checkboxes for
  currently-confirmed concepts, but seeds `selected` from every id the
  exam still references); and `today-selection.ts`'s `daysUntil`
  (day-granularity, `Math.ceil`) can disagree with `getExamPlan`'s own
  exact-time "has this exam passed" check for an exam dated today,
  around midnight — Today may show a same-day exam as due while the
  Exam Plan page itself reports it already passed. Neither is new;
  both predate this branch.
- **`listCourses` and `getDueQueue` still return `[]` on a query error**,
  which is indistinguishable from "nothing found". This is a deliberate,
  product-owner-ruled deferral from Orca Phase 2, not an oversight: the
  fix pattern is established (`listCoursesResult`, `getDueQueueResult`
  and `listExamConfigsResult` are additive siblings that report the
  error while the originals keep their behavior for existing callers),
  so closing it is a matter of migrating each remaining caller and
  deciding what each page should show on failure. Until then, any screen
  reading through the original functions can render an empty state for a
  failed query.
- **The Phase 7 calendar ADR is still owed.** Showing many future review
  dates across a month reverses the review-scheduler's documented
  decision never to persist a future schedule
  (`specs/009-review-scheduler/data-model.md`: everything is computed on
  read). Phase 3's rail deliberately shows only one *nearest* date per
  course, which is a fact about current state rather than a projected
  schedule — that choice avoided the question but did not settle it.
- **The heavy assessment-generation path is still unwired to any UI** —
  see the earlier entry; unchanged by the Orca redesign work.
- **A persisted skip/avoidance signal was deliberately deferred, not
  built, in Orca Phase 4.** Quick review's Skip is currently pure UI
  state: it commits no evidence and leaves review priority untouched,
  because a skip is the absence of evidence rather than evidence of
  failure, and writing a penalty from a non-event would fabricate a
  signal the student never produced. A student who repeatedly skips the
  same concept is still a real, useful signal for review priority to
  see — but recording it honestly needs a new evidence type carrying
  zero mastery weight (so it can move ranking without ever being read as
  a mastery observation) plus a weights decision about how much an
  avoidance signal should influence ranking relative to failed or absent
  attempts. Both belong with the later configurable-weights phase
  (Phase 6), not with Phase 4's UI work.
- **Quick review can serve a slow, structured-checker question inside
  a "quick" session**, because every due concept is paginated regardless
  of its response modality (Orca Phase 4 rejected filtering the session
  down to multiple-choice-only, since that would silently drop due
  concepts and make an incomplete session look finished). This is
  question-bank composition — how many slow-modality questions exist for
  a given concept, and how the review-priority function selects among
  them — not a UI defect, and is out of scope for the quiz-flow work
  that surfaced it.

**Orca redesign — Phases 1–3 shipped 2026-09-27/28; phases 4–9 scoped only**:
Phase 1 (rebrand + app shell) is **built and committed**: `globals.css`
now carries the real Orca token system (6 brand tokens, plus the
`--accent*` / `--status-*` split that replaced the overloaded `--clay`),
`AppShell` is a bottom icon nav bar, and a shared `BrandLogo` renders a
deliberate text-only placeholder wordmark (no real logo asset exists
yet). The `-linux.png` visual baselines were regenerated on CI's own
runner and committed, so the visual suite is green on both platforms.
See
`brain/decisions/architecture-log.md`'s 2026-09-27 "Orca rebrand Phase 1"
entry and the execution addendum in
`docs/superpowers/plans/2026-09-27-orca-rebrand-app-shell.md`.

Phase 2 (concepts screen, chat entry, create-course modal) is also
**built and committed**: `/courses/[courseId]` is now the Concepts
screen (`ConceptPath`, concepts grouped under unit headers with an
explicit "Unassigned" section, plus `DueRail` for due-today/tomorrow);
the former course-detail material-upload page moved to
`/courses/[courseId]/material`, carrying its visual spec with it; `/chat`
is a new third bottom-nav tab with a `CoursePicker` that routes into a
course's Tutor page rather than relaxing `tutor_conversations.course_id`
off its NOT NULL grounding constraint; and course creation moved into
`CreateCourseModal` behind an "Add class" trigger on `/courses`. Both ▷
("start review") controls on the Concepts screen ship visibly disabled,
each with its own stated reason — Quick review and Deep review are
Phases 4 and 9 respectively, not built yet. Visual baselines are current
on both platforms: macOS regenerated locally with `--update-snapshots=all`,
and the `-linux.png` baselines regenerated on CI's own `ubuntu-latest`
runner via the one-off `regen-linux-snapshots.yml` workflow (which can
only be dispatched from `main` — see the 2026-09-28 "Orca Phase 2" entry
in `brain/decisions/architecture-log.md` for why, and for the exact
temporary-commit sequence that worked). See also
`docs/superpowers/plans/2026-09-28-orca-phase2-concepts-chat.md` (the
implementation plan) and `docs/superpowers/specs/
2026-09-28-orca-phase2-concepts-chat-design.md` (the design).

Phase 3 (home dashboard) is also **built and committed**: `/` now renders
`IslandHome` — one placeholder island per course (`IslandCanvas`,
deterministic scatter, shape from a stored `island_shape_index` column
via migration `0016_course_island_shape.sql`, color hashed from the
course id) and a right-hand rail (`HomeReviewRail`) listing every
course's next review session soonest-first, with a pinned "Upcoming
exams" section below the rail's own scroll region. `TodayDashboard` and
`today.ts` (the pre-redesign Home, which predates the Orca work
entirely) are deleted, not kept alongside the new
one. An island opens that course's Concepts screen; the rail's ▷ opens
Study (Quick review's existing, working page — unlike Phase 2's disabled
▷ controls, this one had a real destination to link to). A count next to
a course's due date appears only when that work is due *now*; a future
date renders with no count, because no session that far out is ever
persisted (see `brain/decisions/architecture-log.md`'s 2026-09-28 "Orca
Phase 3" entry for the full reasoning, including why this doesn't
discharge the calendar ADR Phase 7 still owes).

Visual baselines are current on **both** platforms: macOS regenerated
locally with `--update-snapshots=all`, and the `-linux.png` set
regenerated on CI's own runner and committed. Every `-linux` baseline
changed in that run, which is expected rather than alarming — the final
branch review found that the baselines had been capturing the Next.js
dev-mode indicator overlay, so snapshots churned with no code change
behind them. `next.config` now sets `devIndicators: false`, and the
regenerated set is the first without that overlay.

Four defects found by the final whole-branch review, all fixed before
merge and each worth knowing because the class of bug recurs:

- **Islands moved when due dates changed.** The canvas laid out by array
  position and was being handed the due-date-sorted list, so studying a
  course permanently relocated its island — contradicting the layout
  module's own doc comments. The canvas now orders by `createdAt` while
  the rail orders by due date.
- **The exam section's "failed" state was unreachable**, because
  `listExamConfigs` returns `[]` rather than throwing. A failed
  `exam_configs` query would have rendered "No exams scheduled." to a
  student with an exam in three days. Fixed with a
  `listExamConfigsResult` sibling, the same additive pattern as
  `listCoursesResult` and `getDueQueueResult`.
- **`tests/e2e/global-setup.ts`'s Supabase client was untyped**, which
  is why a missing `not null` column there failed at runtime instead of
  at typecheck — and it broke Playwright's *global* setup, so every
  spec. Typing it surfaced three further missing-column bugs.
- **Mobile Home rendered no islands at all** below ~768px: the rail's
  fixed width plus an unbreakpointed canvas squeezed the archipelago to
  nothing. Caught by the new Home visual spec, which is the argument for
  having added it. The layout now stacks — islands above, rail below —
  following the `<style>` + `className` + media-query pattern
  `ConceptDetailPanel` and `DueQueue` already use, since inline styles
  cannot express a breakpoint.

`tests/visual/home.spec.ts` now covers the Home route at both desktop
and mobile, using a checked-in fixture — before this, the redesign's
main deliverable had no visual regression coverage at all.

Pending: the settings gear seen in earlier design mockups has no route
yet — it's still waiting on Phase 6's Configurations screen, not a Phase
3 gap. See `docs/superpowers/plans/2026-09-28-orca-phase3-home-dashboard.md`
and the corresponding design doc for the full spec.

Phase 4 (quick-review quiz flow) is also **built and merged to `main`**:
`/courses/<id>/study` was replaced in place rather than given a sibling
route — every entry point (Home's ▷ control, the Review page, the e2e
specs) already pointed here, so the change is to what this route
renders, not to where anything links, and keeping one UI over one data
source avoids two screens drifting apart. `StudySession.tsx`'s
scrolling, all-items-at-once list is deleted; the route now renders one
question at a time behind `QuickReviewSession`, with a progress
percentage, back-anywhere navigation whose forward control is `Skip`
until a question is answered and `Next`/`Finish` afterwards (a bare
"Next" past an unanswered question does not exist — it used to, and it
created a third state neither answered nor skipped, letting a student
reach the end with nothing recorded and no confirmation; the
whole-branch review caught that before merge),
immediate per-answer feedback
(the outcome is already known the moment an answer commits, so nothing
is held back for an end screen), a Skip that commits no evidence and
never penalizes mastery (a skip is the absence of evidence, not
evidence of failure), a skip-confirmation dialog before finishing, and
an end screen reporting the real score, the concepts covered, and a
visibly-disabled deep-review offer whose copy is derived from the
session's mastery-band enum rather than the wireframe's numeric
"level 4," because this codebase has no numeric levels. Every response
modality is paginated, not just multiple choice — filtering the session
down to MCQs would silently drop due concepts from a student's review
while making the session look complete. The backend needed no changes:
`getDailyReviewSession` already returned an ordered array, so this is
pagination over data that already existed, and Yes/No is handled as a
two-option `multiple_choice` row rather than a new answer type. The
load-more plumbing (`loadMore` prop, `excludeConceptIds` option and
parameter, its unit test) was deleted end to end rather than kept for a
hypothetical future Deep-review caller — see this doc's own plan-doc
correction below and the architecture log's Task 11 entry for why that
reasoning didn't hold. Mobile hides the bottom nav for this route only,
in CSS via the same injected-`<style>` + `@media` + class pattern
`ConceptDetailPanel` and `DueQueue` already use, so the page stays a
server component. Two real bugs were found and fixed during the build,
both written into the plan document's own code samples and both since
corrected there: a stale-closure bug in the skip/confirm state machine,
and an inline `style={{ display: "flex" }}` on the nav element that
silently defeated the mobile-hide media rule until the visual-regression
pass rendered real mobile screenshots. Full account, including three
Supabase seeding defects the typed admin client caught while writing the
e2e spec and a `SessionItem`-shaped gap `exam-planner/actions.ts` needed
closing: `brain/decisions/architecture-log.md`'s Task 11 entry for this
plan. Design: `docs/superpowers/specs/2026-09-29-orca-phase4-quick-review-design.md`;
plan: `docs/superpowers/plans/2026-09-29-orca-phase4-quick-review.md`.

Amended immediately after the merge, on direct product-owner feedback:
**the progress bar counts skipped questions.** It reports how far
through today's review the student is, not how well they are doing, and
a skipped question has been dealt with — excluding it left the bar
reading 0% for someone halfway through the session. Correctness stays a
separate number (the end screen's `N/M correct` and skipped count), so
nothing is overstated; a submission that failed to grade still does not
advance the bar, because it stays answerable. The design doc carries a
matching amendment at its end rather than a silent edit, and
`progressPercent`'s parameter was renamed `answeredCount` →
`addressedCount` so the name still describes what it receives.

The paragraph below describes the original scoping pass:

**Orca redesign (2026-09-27, scoped and planned)**:
a full brand + UI/UX flow redesign is scoped and sequenced into 9
phases (rebrand/app shell, concepts screen, home dashboard,
quick-review flow, material upload/reflection, review configuration,
calendar, onboarding, deep review) — design doc and a live
backend-compatibility audit are done; a detailed task-by-task
implementation plan exists for Phase 1 only, not yet executed. See
`docs/superpowers/specs/2026-09-27-orca-redesign-design.md` (full
sequencing/decisions), `docs/superpowers/plans/
2026-09-27-orca-rebrand-app-shell.md` (Phase 1's real plan, ready to
run via `superpowers:subagent-driven-development` or
`superpowers:executing-plans`), and `brain/decisions/
architecture-log.md`'s 2026-09-27 entries. Nothing in `src/` reflects
any of phases 4–9 yet (Phases 1–3 above have since shipped). Existing
routes/pages described elsewhere in this doc and in `specs/` are
unaffected until each phase actually ships.

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
