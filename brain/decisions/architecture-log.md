# Architecture Decision Log

A single chronological place to find every large system-design decision
made on this project, across all phases. This is an index, not the full
reasoning — most entries link to the fuller Decision/Rationale/
Alternatives writeup in the relevant feature's `research.md`, where one
exists. `ADR-0001` (dev tooling) predates this log and stays where it is;
this file covers everything since.

**Update this file every time a decision here would materially change if
someone read the code without knowing why it's shaped that way** — a new
dependency, a new persistence choice, a security/enforcement boundary, a
pattern that has to be repeated correctly in future code (not a one-off
bug fix). Small implementation details belong in code comments and
`research.md`, not here.

## 2026-08-31 — Ratified stack (constitution)

- **Postgres via Supabase** for all structured/persistent data; no graph
  database without a demonstrated need and an ADR.
- **Supabase Auth + Storage**, RLS as the enforcement mechanism.
- **Trigger.dev** for durable background jobs.
- **React Flow (`@xyflow/react`) + ELK (`elkjs`)** for the concept atlas
  renderer; Cytoscape/Sigma/G6 retained as alternatives, not defaults.
- **Modular monolith**, not microservices; one primary tutor/review agent,
  not multiple named agents without a demonstrated need.
- Full reasoning: `.specify/memory/constitution.md` (Technology &
  Architecture Constraints), `docs/technical-prd.md` §9.

## 2026-09-01 — Per-user data isolation: Postgres RLS, not app-layer filtering

- Every table with owner-scoped data (`courses`, `artifacts`,
  `artifact_processing_runs`, `graph_layouts`) is enforced via RLS
  policies keyed on `owner_id = auth.uid()`, never only by an
  application-layer `WHERE` clause a future code path could forget.
- Full reasoning: `specs/002-account-course-artifact-foundation/research.md`
  ("Per-user isolation").

## 2026-09-01 — Service-role Supabase client confined to the background job only

- The service-role key (bypasses RLS) is used in exactly one place:
  `trigger/ingest-artifact.ts`, which acts on behalf of the system, not
  any student's session. No server action, no client-facing code path
  ever touches it.
- This is also the #1 real-world Supabase "vibe coding" failure mode
  (service-role key reaching client-facing or AI-agent-manipulable code
  paths) — see the Supabase security checklist below.

## 2026-09-01 — File upload: client uploads directly to Storage, server only records metadata

- Browser uploads bytes straight to a private Supabase Storage bucket;
  the server action only inserts the lightweight `artifacts` row and
  triggers the background job. Avoids double-bandwidth proxying with no
  security benefit, since Storage has its own RLS-backed policies.
- Full reasoning: `specs/002-account-course-artifact-foundation/research.md`
  ("File upload path").

## 2026-09-01 — Background job idempotency via re-read-before-act, not a second watchdog

- `ingest-artifact` re-reads its own current status before doing
  anything; a crashed/retried run either resumes correctly or exits
  without double-processing. No separate cron/sweep job for "stuck" rows.
- Full reasoning: `specs/002-account-course-artifact-foundation/research.md`
  ("Background processing").

## 2026-09-01 — Live status updates: Supabase Realtime, not polling

- The artifact list and (later) the concept atlas subscribe to Postgres
  changes directly rather than polling on an interval — same service
  already in use, no new dependency, lower latency and request volume.
- Full reasoning: `specs/002-account-course-artifact-foundation/research.md`
  ("Live status updates").

## 2026-09-01 — Renderer-neutral graph DTO lives in its own directory, structurally separate from renderer code

- `CourseGraph`/`Unit`/`Concept`/`Relationship` (`src/types/graph/`) never
  contain a coordinate, React Flow shape, or ELK output. All of that is
  computed only in `src/features/concept-atlas/adapters/`. This is
  Constitution Principle I made unable to be casually violated by an
  import, not just a naming convention.
- Full reasoning: `specs/003-concept-atlas-renderer/plan.md` (Constraints),
  `specs/003-concept-atlas-renderer/data-model.md`.

## 2026-09-01 — Graphology deliberately deferred

- Not added despite being named as an option in PRD §13.6 — nothing in
  the current feature set calls a graph-analysis function
  (neighborhoods, connected components, filtering). Add it when a
  specific feature (most likely knowledge-island detection) actually
  needs it, not preemptively.
- Full reasoning: `specs/003-concept-atlas-renderer/research.md`
  ("Graphology: deferred, not added").

## 2026-09-01 — Layout preference is its own table, separate from canonical graph data

- `graph_layouts` stores only per-student expand/collapse + position
  overrides — view state, never semantic data. New table within the
  already-approved Postgres store, not a new persistence layer, so no
  ADR gate applies.
- Full reasoning: `specs/003-concept-atlas-renderer/research.md`
  ("Layout preference persistence"), `data-model.md`.

## 2026-09-01 — Every server-side entrypoint must tolerate missing external credentials without crashing the whole app

- Discovered the hard way: `src/middleware.ts` and `SiteHeader` (in the
  root layout, so they wrap *every* page) both called the Supabase client
  unconditionally. Without a live project, this crashed every route in
  the app — including features with nothing to do with auth. Both now
  check for the env vars first and degrade to a signed-out/no-op state.
- **Standing rule going forward**: any code that runs on every request or
  every page render (middleware, root layout, shared providers) must be
  written to work correctly — not just "not throw" — when its external
  service isn't configured yet. This will matter again for
  `course-graph-ingestion`'s OpenAI-dependent code once it's built.
- Full reasoning: `specs/003-concept-atlas-renderer/research.md`
  ("Cross-phase fixes discovered while implementing this feature").

## 2026-09-01 — elkjs must use its bundled browser entry point, not the default

- `import ELK from "elkjs"` auto-detects environment and tries to
  `require('web-worker')` when bundled for the browser — unresolvable in
  Next.js's client webpack build. `elkjs/lib/elk.bundled.js` is elkjs's
  own documented fix: runs synchronously on the main thread instead.
- Full reasoning: `specs/003-concept-atlas-renderer/research.md`
  ("ELK integration").

## 2026-09-01 — Supabase security hardening checklist (adopted, to apply once a live project exists)

Researched "vibe coding" Supabase failure modes (notably CVE-2025-48757 —
RLS left disabled or loosened to `USING (true)` across ~170 AI-generated
apps) before any live Supabase project was created for this repo, so the
checklist is a setup gate, not a retrofit. Applies to
`specs/002-account-course-artifact-foundation` and every future migration:

- **RLS must be verified enabled on every new table**, not assumed —
  `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` is not automatic on
  `CREATE TABLE`. Check this explicitly after every migration, not just
  on the ones written with RLS in mind.
- **Never loosen a policy to `USING (true)` to "fix" an empty result.**
  RLS-enabled-with-no-matching-policy silently returns empty/denies — the
  correct fix is always a scoped `owner_id = auth.uid()` policy, never a
  blanket allow. `USING (true)` is only acceptable for genuinely public
  reference data, and this project currently has none.
- **Test cross-user isolation explicitly** — as `anon` and as a second,
  different real user — not just as the developer's own signed-in
  account. This is the actual blind spot behind the CVE-2025-48757 class
  of leak, and it's exactly what `quickstart.md` Group B2 (Phase 1) and
  the future atlas equivalent already exercise; keep doing it for every
  new owner-scoped table.
- **`service_role` stays confined to `trigger/ingest-artifact.ts`.**
  Never let it reach a server action, a client component, or (if any
  AI-agent tooling is ever wired to the DB directly) an AI assistant's
  own DB connection — a prompt-injected agent holding that key bypasses
  RLS entirely.
- **Once a live project is created**, before it holds real student data:
  enable leaked-password protection, set OTP/magic-link expiry ≤ 1 hour,
  restrict Auth redirect URLs to the exact dev/prod domains, confirm the
  `course-artifacts` bucket is private (not just RLS-policied), enable
  MFA on the Supabase org account, and run the dashboard's Security
  Advisor before treating the project as production-ready. Full official
  checklist: https://supabase.com/docs/guides/deployment/going-into-prod
- Storage folder-scoping (`(storage.foldername(name))[1] = auth.uid()::text`
  in `0001_courses_artifacts.sql`) already follows the recommended
  pattern — confirmed against this research, not changed.

## 2026-09-01 — Live Supabase project provisioned; RLS verified for real, not assumed

- Linked the local project to a real Supabase project (`npx supabase
  link`/`db push` via the CLI over `npx`, no global install needed) and
  applied `0001_courses_artifacts.sql`.
- **Ran the actual verification the checklist above calls for**, not just
  planned it: queried `courses`/`artifacts`/`artifact_processing_runs`
  with the anon key and no session. Result: `status=200, rows=0` for all
  three, and the `course-artifacts` Storage bucket is not listable
  anonymously either — the correct outcome (RLS blocking, not erroring or
  leaking), not a hypothetical.
- **Real setup mistake hit and fixed**: the Supabase dashboard's API page
  shows both a base "Project URL" and, in some views, a "REST URL"
  ending in `/rest/v1/`. Pasting the latter into
  `NEXT_PUBLIC_SUPABASE_URL` doubles the path internally (the client
  library appends `/rest/v1/` itself) and every request 404s with
  "Invalid path specified in request URL." Fixed by using the base URL
  only. Documented in `.env.example` so this doesn't recur.
- `db lint` (the check Phase 1's quickstart.md substituted with a manual
  review, since no live project existed yet) turns out to require a
  local Docker-based Supabase instance (`supabase start`), not the remote
  project — a separate, heavier workflow this project doesn't currently
  use. The anon-key query above is a more direct verification of the
  thing that actually matters (RLS behavior) anyway.

## 2026-09-01 — Layout preference: view state only, and RLS confirmed live for it too

- `graph_layouts` (per-student expand/collapse + moved positions) is the
  one table in this project a student can `UPDATE` directly, not just
  `SELECT`/`INSERT` — it's personal view state, not semantic graph data,
  so that's the correct RLS shape (unlike `artifacts.status`, which only
  the Trigger.dev service-role client may write).
- Pushed and verified live the same way as Phase 1's tables: anon-key
  query returns `status=200, rows=0`.
- A unit with no saved preference defaults to **expanded**, not
  collapsed — corrected during implementation because US1's already-
  accepted `whole-course-atlas.png` baseline shows every unit expanded
  with nothing saved yet; matching that fixed point mattered more than
  the more general "Default" wording in
  `.claude/skills/concept-atlas/references/interaction-states.md`.

## 2026-09-01 — Edge click-hitboxes must stay narrow, and nodes need an explicit zIndex

- React Flow's default 20px invisible click-hitbox around every edge can
  sit directly on top of unrelated node content (found: a cross-unit
  relationship edge routed straight through a unit's header, silently
  swallowing clicks meant for the header). Narrowed to 6px
  (`interactionWidth`) and gave unit nodes an explicit `zIndex: 10` so
  headers reliably win when something routes beneath them.
- **Standing rule going forward**: any new interactive node/edge type
  added to the atlas should default to a narrow edge interaction width
  and consider explicit zIndex if it's meant to be reliably clickable —
  don't rely on React Flow's defaults for anything the user needs to
  click precisely.
- Full reasoning: `specs/003-concept-atlas-renderer/research.md` ("Edge
  click-hitboxes can block clicks on nearby nodes").

## 2026-09-01 — Edge-label click targeting: three compounding React Flow bugs

- Getting a relationship-edge label reliably clickable (T028's
  weak-relationship detail panel) took three separate real fixes, not
  one: (1) a bent `getSmoothStepPath` edge's bounding-box center is
  often off the actual stroke, so the click target moved to the edge's
  own label instead (`labelX`/`labelY` is always a real point on the
  path); (2) React Flow paints `.react-flow__edges` above
  `.react-flow__edgelabel-renderer` by default, so an edge's own
  invisible hitbox always sat on top of its own colocated label — fixed
  with a scoped CSS `z-index` override raising the label layer above the
  edges layer; (3) React Flow's `onEdgeClick` prop hit-tests by
  pointer-to-path distance (not DOM targeting), so wiring it alongside
  the label's own click handler double-fired the same focus-toggle per
  click, silently netting no change — fixed by removing the redundant
  `onEdgeClick` prop and keeping only the label handler.
- **Standing rule going forward**: for any React Flow edge that needs a
  reliably clickable label, wire the click handler on the label element
  only — never also on `onEdgeClick` — and don't assume DOM stacking
  order follows visual expectation; check it explicitly for anything
  that must receive real pointer events.
- Also surfaced (not fixed, scoped out): two relationships between the
  same concept pair route identically and their labels fully overlap,
  so only whichever renders on top in DOM order is clickable. A general
  fix needs multi-edge/parallel-edge offsetting; the fixture was
  reordered as a workaround so the relationship with a real explanation
  wins.
- Full reasoning: `specs/003-concept-atlas-renderer/research.md`
  ("Relationship-edge click targeting: three real bugs, not one").

## 2026-09-01 — Mobile breakpoint: disable fitView rather than let it shrink everything

- Below 768px, `ConceptAtlas.tsx` disables React Flow's `fitView` and
  sets a `defaultViewport` centered on the leftmost unit at zoom 1.0
  instead. `fitView` fits every node in the viewport, which on a phone
  width forces the whole 5-unit graph down to unreadably small text —
  exactly what spec FR-013 forbids. Pan/zoom `Controls` (already
  rendered) let the student reach the rest.
- "Leftmost unit" is picked by `position.x`, not array order — the
  first unit in `graph.units` isn't necessarily where ELK places it
  visually, and picking by data order landed on the wrong unit in
  testing.
- **Known limitation, accepted**: `defaultViewport` is read once at
  mount (uncontrolled), so it won't recenter on a live window resize
  across the breakpoint — only a fresh load at a narrow width applies
  it. Treated as a device-class decision, not a live-resize feature.
- Full reasoning: `specs/003-concept-atlas-renderer/research.md`
  ("Mobile breakpoint: disable fitView, don't just shrink it").

## 2026-09-01 — Standing rule: no silent placeholders

- A fallback, default, or unknown value must never be indistinguishable
  from a genuinely computed/found one. If something can't be computed or
  found, that absence must be visible — an explicit "missing" state, a
  loud dev-facing error/warning, or a marker a caller must handle —
  never a plausible-looking stand-in value.
- **Why now**: about to build `course-graph-ingestion`, a probabilistic
  LLM extraction pipeline where "couldn't extract this" and "extracted
  successfully" must never look the same on the wire (FR-012's distinct
  failure status is one direct consequence). Applies retroactively, not
  just going forward.
- **Retroactive fixes applied**: `react-flow-adapter.ts`'s ELK-position
  unwrapping used `?? 0` for coordinates that should always be present
  post-layout (now throws loudly if they're ever actually missing,
  instead of silently rendering at a fake origin); a concept not listed
  under any unit's `conceptIds` used to render silently at `(0, 0)`
  (stacking invisibly under whatever else sits there) — now logged via
  `console.error` and omitted from the render instead of faked.
- **Standing rule going forward**: before writing `?? someDefault` or
  `|| someDefault` for a value that's supposed to be computed/looked up
  (not a genuine optional field with a meaningful default), ask whether
  the fallback branch is truly reachable and, if so, whether silently
  using it could be mistaken for real data. If yes to both, make the
  gap explicit instead (throw, warn, or an explicit "unknown" UI state)
  rather than papering over it.

## 2026-09-01 — course-graph-ingestion built end to end; first live extraction-quality numbers exist

- `course-graph-ingestion` (Phase 2's ingestion half) is fully
  implemented: OpenAI Structured Outputs extraction, LLM-based
  reconciliation against existing course ontology, a review queue gating
  what reaches the rendered atlas, student flags as feedback-only
  evidence, and `scripts/score-extraction.ts` as the offline scoring
  harness Constitution Principle IV requires.
- The scoring harness was run live (not just typechecked) against all 7
  `benchmark/dsa-course/` artifacts with real `gpt-4.1` calls. First real
  numbers, recorded as the baseline: **concept recall 96.8%, edge recall
  10.0%**. Edge recall is low partly because the harness requires exact
  `relationType` match between extracted and expected edges — a stricter
  bar than concept matching allows, and real edge quality may be
  better than the number alone suggests. Concept precision (40%) is
  dragged down by problem-set artifacts having 0 expected concepts in
  the corpus (concepts are anchored to the lectures that introduced
  them, not the problem sets that exercise them) — a corpus-construction
  fact, not an extraction defect. Recorded honestly rather than adjusted
  to look better; full reasoning in
  `specs/004-course-graph-ingestion/research.md`.
- **Known, pre-existing gap, not new to this feature**: `trigger.config.ts`
  still has a placeholder Trigger.dev project ref, so the full upload →
  Trigger.dev-triggered-extraction → review → render path has never run
  live end-to-end — only its individual pieces have (extraction itself,
  called directly; the review queue, against a seeded fixture). Same
  category of gap Phase 1 shipped with for `ingest-artifact.ts`.

## 2026-09-01 — learner-graph-evidence built end to end (all 5 user stories)

- `learner-graph-evidence` (Phase 3) implemented per
  `specs/005-learner-graph-evidence/`: `evidence_events`,
  `learner_concept_state`, `learner_edge_state` (migration
  `0004_learner_evidence.sql`, RLS keyed on `user_id`, not `owner_id` —
  the first table in this project keyed that way, since this data is
  about who the evidence describes, not who owns the course); a pure
  `computeLearnerState` recompute-from-full-history algorithm; a
  `commitEvidence` server action that always inserts the evidence row
  before any state upsert (Constitution Principle II, structurally, one
  operation); `applyLearnerState` overlaying real per-student state onto
  `course-graph-ingestion`'s baseline `CourseGraph` without touching that
  feature's own logic; evidence-provenance display and a misconception
  badge added to the existing Concept Atlas renderer via its established
  optional-prop pattern (`onFlag`'s precedent), keeping that renderer
  unaware of this feature by name (Constitution Principle I).
- Two real, documented divergences from the original design docs (full
  reasoning in `specs/005-learner-graph-evidence/data-model.md`'s new
  "Divergences from this document" section): `ContributingFactor`
  gained an `evidenceType` field beyond the original 5-field sketch
  (needed for FR-009's provenance display), and
  `tierCutoffs.exposed` (0.15) was set **above**
  `strengthByType.exposure`'s ceiling (0.1) rather than below a lower
  cutoff — meaning exposure-only evidence never crosses into the
  "exposed" tier itself, staying at "unverified" indefinitely no matter
  how much accumulates. This is the strictest reading of the literal
  invariant tasks.md's T001/T012 require
  (`strengthByType.exposure < tierCutoffs.exposed`), verified directly by
  a dedicated test, not just implied by it.
- `difficultyFactor` is deliberately bounded to `[0.5, 1]` (never
  amplifies above `strengthByType[evidenceType]`) — this is what makes
  Constitution Principle III a structural guarantee that holds for any
  future weight recalibration, not just true for today's shipped
  defaults by coincidence.
- Migration pushed and RLS verified live (`status=200, rows=0` on all
  three new tables for a signed-out anon query). Group B of
  `quickstart.md` was run live against the real Supabase project (two
  real throwaway accounts, real insert/read/cleanup) confirming: an
  evidence commit is readable back immediately by its own student, a
  second signed-in account sees zero rows for the same concept (SC-005
  isolation), and exposure-only evidence inserts cleanly. All 110 unit
  tests and the Concept Atlas visual regression suite pass (diffs opened
  and confirmed as the intended new provenance text / misconception
  badge, not regressions, before accepting new baselines).
- **Known, pre-existing gap, not new to this feature**: the mobile
  Playwright project has never had passing baselines for the
  unit-collapse, weak-relationship-focus, or (now) misconception-badge
  interaction tests — elements land outside the 390px mobile viewport
  without a scroll step the test never added. Same category of
  pre-existing gap as `course-graph-ingestion`'s un-run Trigger.dev path;
  not fixed here since it predates this feature and isn't in scope for
  it.

## 2026-09-01 — tutor-agent built end to end (all 4 user stories)

- `tutor-agent` (Phase 3's other half) implemented per
  `specs/006-tutor-agent/`: a single primary tutor agent driving a
  tool-calling loop directly on the existing `openai` Responses API
  client (no `@openai/agents` package added — see research.md's
  reasoning: that package's headline feature, named-agent handoffs, is
  constitutionally forbidden here anyway). New tables
  `tutor_conversations`/`tutor_conversation_turns`/`tutor_tool_calls`
  (migration `0005_tutor_agent.sql`, RLS keyed on `user_id`, matching
  `learner-graph-evidence`'s precedent) — this migration also attaches
  the real FK on `evidence_events.conversation_turn_id` that
  `0004_learner_evidence.sql` deliberately left unconstrained.
- Grounding (`search_course_materials`) needed no new retrieval
  infrastructure at all: confirmed `course_concepts`/`concept_edges`
  already carry real `source_anchors` from ingestion, so it's a plain
  Postgres `ilike` query over existing data — no embeddings, no vector
  store, no `pgvector`.
- The assistance ladder (`computeLadderStep`) is recomputed from a
  conversation's own turn history every call, same recompute-from-log
  reasoning as `learner-graph-evidence`'s `computeLearnerState` — no
  persisted ladder-step counter anywhere.
- Every learner-state effect of a conversation goes through
  `learner-graph-evidence`'s existing `commitEvidence`, called from
  `record_exposure`/`record_misconception_candidate` tool executions —
  those are staged during the tool-calling loop and actually committed
  only after the student's turn is inserted (its real id is the required
  `conversationTurnId` origin), never a second evidence-writing path.
- A real sequencing subtlety worth remembering: a turn's `concept_ids`/
  `ladder_step_used` can only be known once the loop resolves them via a
  tool call, so both the student and tutor turns for one exchange are
  inserted *after* the loop completes, not before — this keeps
  `tutor_conversation_turns` genuinely append-only (no update policy
  needed) at the cost of not having a turn id to reference mid-loop,
  which is exactly why evidence commits had to be staged rather than
  committed inline.
- Verification actually run, not just typechecked: 136 unit tests pass;
  migration pushed and RLS verified live; a full Playwright E2E suite
  (7 scenarios, the first authenticated Playwright coverage in this
  project — `tests/e2e/global-setup.ts` provisions a real throwaway
  student + course + seeded evidence and captures a real signed-in
  session) covers all four user stories against real Supabase data using
  a scripted test-double model response
  (`test-double-openai-client.ts`, gated by `TUTOR_AGENT_USE_TEST_DOUBLE`,
  never on by accident); separately, one real live `gpt-4.1` call through
  the actual conversation flow was run manually (no test double) and
  produced a correctly grounded, source-cited answer — confirming the
  tool schemas and response-parsing work against the real API, not only
  the double.
- Concept Atlas's own visual regression suite was re-run alongside this
  feature's E2E suite and shows no new regressions from this work (one
  flaky ~1%-pixel diff on `expanded-unit.png`, confirmed by inspection to
  be pre-existing node-selection-highlight jitter unrelated to
  tutor-agent, left as-is).

## 2026-09-01 — deterministic-grading built end to end (all 4 user stories, Phase 4 begins)

- `deterministic-grading` (Phase 4's grading half) implemented per
  `specs/007-deterministic-grading/`: five pure, property-validating
  reference checkers (BFS/DFS, heap, tree, topological-sort, bounded
  shortest-path), real sandboxed code execution via `@e2b/code-interpreter`
  (a new, justified dependency — nothing else in this project can
  safely execute untrusted code), and rubric-constrained text grading
  via the existing `openai` client. Every path funnels through one
  shared mapping function, `toCommitEvidenceInput`, before
  `actions.ts` calls `learner-graph-evidence`'s existing
  `commitEvidence` — no grading path invents its own evidence mapping.
- Real design insight worth remembering: most of these domains have
  more than one correct answer (BFS/DFS tie-breaking, equally-short
  paths, multiple valid topological orders), so every checker validates
  a *property* the claimed answer must satisfy rather than doing
  exact-match against one canonical reference answer. Malformed
  question input (a cyclic graph claiming to need a topological sort,
  a nonexistent start node) gets its own `invalid_input` outcome,
  distinct from "wrong answer" — a broken question is never miscounted
  as a student mistake.
- `assessment_attempts` (new table) is a self-contained snapshot, not a
  question-bank foreign key — `assessment-generation-pipeline` (which
  will own a real question bank) doesn't exist yet, so this feature
  doesn't block on it. This is also the migration that finally gives
  `evidence_events.assessment_attempt_id` its real foreign key,
  deliberately left unconstrained since `0004_learner_evidence.sql`.
- `grading-evidence.ts`'s pure mapping function had to be split from
  the actual `commitEvidence` call (which lives in `actions.ts`)
  specifically so it stays testable by plain `node --test` — importing
  `commitEvidence` directly would transitively pull in the `"@/"` path
  alias that only resolves under Next.js's bundler, the same
  constraint that already shaped `commit-evidence-validation.ts`/
  `flag-validation.ts`'s split from their own actions files.
- Verification actually run, not just typechecked: 174 unit tests pass
  across the whole repo (38 new in this feature); migration pushed and
  RLS/FK verified live; a full live walkthrough was run against the
  real Supabase project, the real OpenAI API, and a real E2B sandbox —
  a structured BFS answer produced real evidence traceable through a
  real `assessment_attempts` row; rubric grading returned real,
  varying confidence values (1.0 / 0.9 / 0.85) across a clear-correct,
  a vague-wrong, and a borderline-partial response; and code grading
  was confirmed against a real passing case, a real failing case (with
  real captured error output), and a real timeout (`did_not_complete`,
  never faked as a pass or fail).
- The E2B sandbox grader (`code-sandbox-grader.ts`) deliberately has no
  unit test of its own — mocking the one thing E2B was added for would
  test nothing real; its correctness is proven entirely by the live
  walkthrough above, called out explicitly in tasks.md rather than
  silently skipped.

## assessment-generation-pipeline (008) — US1/US2 (MVP) implemented

- `assessment_generation_runs`/`question_bank` are RLS-keyed on
  `owner_id`, not `user_id` — a deliberate *return* to the
  `course_units`/`course_concepts`/`concept_edges`/`extraction_runs`
  pattern, reversing the last three features' `user_id` convention,
  because a question-bank entry is course content (generated once,
  reused across students), not one student's own data. Same "the right
  key depends on what the data describes" reasoning
  `learner-graph-evidence` used in the opposite direction.
- `runValidationLayers` (`validation-pipeline.ts`) takes an injected
  `LayerRunners` object rather than calling the six real layers
  directly — this is what lets the bounded-regeneration/short-circuit
  control flow (never a fabricated pass for a layer that didn't run)
  be exhaustively unit tested with canned per-layer results, while
  `trigger/generate-assessment.ts` supplies the real runners bound to
  live OpenAI/Supabase clients. Same "pure control flow, injectable
  dependencies" shape as `deterministic-grading`'s
  `toCommitEvidenceInput`, one level up.
- Independent-solve dispatches directly to one of
  `deterministic-grading`'s five existing checkers when the candidate
  declares a `checkerDomain` (never re-solving with a model call for a
  domain an exact checker already covers, FR-007) — the checker call on
  the candidate's own `checkerInput` doubles as the "is this claim
  actually correct" verification, so `answerAgreement` for a
  checker-domain candidate is a pure comparison against that same
  checker result, not a second model call. Only a `checkerDomain: null`
  candidate (no exact checker applies) falls back to a blind-solver
  model call, shown only the question text, never the rubric.
- `trigger/generate-assessment.ts`'s real work is exported as a plain
  `executeGeneration(payload)` function, with the Trigger.dev `task()`
  wrapper just calling it — `trigger.config.ts` still has no real
  Trigger.dev project (same placeholder gap
  `course-graph-ingestion`'s `extractCourseGraphTask` already has), so
  this is what lets the real generate-validate-persist mechanism be
  invoked directly for live verification against real Supabase/OpenAI
  without needing a real queue.
- Live walkthrough (quickstart.md Group B, T024) against a real
  throwaway course/concept, real OpenAI, real Supabase — found two real
  bugs a typecheck/unit-test pass alone would have missed:
  1. The first real generation call failed outright:
     `400 Invalid schema ... 'additionalProperties' is required to be
     supplied and to be false'`. OpenAI Structured Outputs strict mode
     has no "any object" escape hatch — `rubric`/`checkerInput` can't
     be declared as open-ended objects at all. Fixed by transmitting
     both as JSON-encoded strings, decoded by `parseCandidateResult`.
  2. The second real call crashed the whole task: the model declared
     `checkerDomain: "shortest-path"` but produced a `checkerInput`
     missing `graph`, so `checkShortestPath` threw on
     `graph.nodeIds.includes(...)` with an uncaught `TypeError`.
     `checkerInput` is untrusted model output, not a trusted caller —
     `runIndependentSolve` now catches a dispatch failure and reports
     it as a real failed layer (regenerated next attempt), never an
     uncaught exception that would kill the run.
  After both fixes: B1 (RLS) and B2 (a real blueprint → one real,
  fully-validated `question_bank` entry, `sourceAnchors` traceable to
  the real confirmed concept) both succeeded live; B3 (a candidate with
  a deliberately malformed `checkerInput` claim) correctly failed
  `independentSolve` and never reached the bank, with every later
  layer recorded `not reached`, confirming the short-circuit really
  holds under real model + real checker calls, not just injected fakes.
  B4 (FR-012's pre-trigger rejection) confirmed by inspection, per
  quickstart.md's own "not required to automate every combination"
  allowance — `requestQuestionGeneration` resolves target/prerequisite
  ids against real confirmed rows before ever calling `.trigger()`.
  Whole-repo typecheck clean; full 192-test unit suite passes (18 new
  across this feature, including a new test for the checkerInput-crash
  fix).
- US3/US4 (T020/T021) — exhaustive live scenario checks on the
  already-built ambiguity/similarity mechanism, no new production code.
  All four scenarios behaved exactly as designed on the first live
  run: an unambiguous BFS-complexity question passed ambiguity; a
  question claiming "THE unique shortest path" on a graph with two
  genuinely equal-length paths (A-B-D and A-C-D) was correctly flagged
  ambiguous, naming both real paths; a candidate closely mirroring the
  course's own source excerpt failed similarity; a candidate covering
  the same underlying concept from a genuinely new angle (a
  mark-on-dequeue-vs-enqueue correctness question, not a restatement of
  any excerpt) passed. Feature complete: all 24 tasks
  (T001-T024) done, whole-repo typecheck clean, 192-test unit suite
  passes, every live scenario in quickstart.md Groups A and B
  confirmed against the real Supabase project and real OpenAI API.

## review-scheduler (009) -- complete, Phase 5's adaptive-review half

- No new database table, no new npm dependency (research.md) --
  confirmed true through implementation: `review-priority.ts`,
  `next-review-date.ts`, `daily-session.ts`, `connect-session.ts` are
  all pure functions; `actions.ts` composes them with real reads from
  `course_concepts`/`concept_edges`/`question_bank` and
  `learner-graph-evidence`'s existing `getConceptState`/`getEdgeState`.
  "Next review date" is genuinely derived on read from
  `computeLearnerState`'s score/`lastEvidenceAt`/
  `hasUnresolvedMisconception` -- no stored, incrementally-patched
  column exists anywhere in this feature.
- Real design gap found and resolved while wiring the `/study` page
  (T009): `question_bank`'s rubric is free-form JSON the generation
  model wrote, not `deterministic-grading`'s structured `GradingRubric`
  shape, and a bank entry's `checkerInput` still holds the *original
  candidate's* claimed answer from generation-time validation, not a
  slot for a real student's fresh response. Casting one shape into the
  other would have been a silent, fake-typed placeholder. Resolved by
  scoping T009 to text-modality answering only for now: a coarse,
  honest rubric adapter (`bankRubricToGradingRubric`) carries the whole
  rubric through as one required idea rather than guessing at
  structured fields. Structured (graph/tree) items are shown but
  honestly marked not-yet-answerable; the real fix (a generic
  claimed-field-stripping form -- every deterministic-grading checker
  input already names its answer fields with a `claimed*` prefix, so
  this is one reusable mechanism, not five bespoke per-domain adapters)
  is real, scoped-out follow-up work, not silently faked.
- Also caught while wiring the UI: `SessionItem` didn't originally
  carry the bank entry's rubric through to the client, which would
  have forced submitting an empty `{}` rubric to grading -- a real
  silent placeholder, fixed before it shipped (added `rubric` to
  `QuestionBankEntrySummary`/`SessionItem`).
- Live verification (T010, T017) hit a real infrastructure limit:
  `actions.ts`'s exported functions call `createClient()`, which reads
  Next's `cookies()` -- only valid inside an actual Next.js request, so
  they can't be invoked directly from a plain script (the same class
  of gap `assessment-generation-pipeline`'s missing live Trigger.dev
  project already established a precedent for, but a different cause
  here). Resolved by calling the exact same pure functions `actions.ts`
  calls (`computeLearnerState`, `rankConceptsByPriority`, `isDue`,
  `composeDailySession`, `composeConnectSession`) against real rows
  fetched via the service-role client -- proves the real logic against
  real data; the cookie-based auth boundary itself is already proven
  by `tutor-agent`'s existing authenticated E2E suite, not re-tested
  here.
- Live walkthrough found two fixture bugs, not production bugs, worth
  recording because they double-confirm the actual logic is correct:
  (1) forgetting to backdate every "old" concept in the test fixture
  made everything look "introduced this week," which
  `composeConnectSession` correctly reflected -- not a bug, a fixture
  gap; (2) the verification script's own `fetchEdgeState` initially
  returned `computeLearnerState`'s raw `tier` field instead of
  remapping it to `learnerState` the way the real `getEdgeState` does,
  which silently broke the weak-connection check until traced back to
  the harness itself, not `connect-session.ts`.
- After both fixture fixes: a real blueprint's daily session correctly
  included the due concept with a real question and skipped the due
  concept with none; the weekly Connect session's all four categories
  populated correctly against real concepts/edges (a real new concept,
  a real weak new-to-old edge, a real low-connectivity concept, a real
  `contrasts_with` pair); and US2's live check showed a real correct
  rubric-graded answer producing a materially higher score and later
  next-due date than a real incorrect one, using the real OpenAI API.
  Feature complete: all 17 tasks (T001-T017) done, whole-repo
  typecheck clean, 210-test unit suite passes.

## exam-planner (010) -- complete, Phase 5's exam-prep half

- Exactly one new table (`exam_configs`) -- a student's exam date +
  scope, full CRUD for their own rows since it's current
  configuration state, not an append-only log. Confirmed through
  implementation: the staged plan and readiness snapshot are both
  genuinely computed fresh on every read, nothing else persisted.
- Confirmed live and structurally: three of the four plan stages are
  literally `review-scheduler`'s existing selection --
  `selectDiagnosticConcepts`/`selectFinalWeaknessConcepts` are the
  *same function* (`rankConceptsByPriority`, scope-restricted) called
  at two different points in time, naturally surfacing different
  concepts as real practice accumulates between the calls, with no
  stage-awareness needed inside the function itself.
  `selectInterleavingEdges` reuses `composeConnectSession`'s exact
  `learnerState.learnerState === "weak"` predicate, just restricted to
  "both endpoints in scope" instead of "new this week." Only
  `selectTimedMixedConcepts`'s mastery-spread and the stage-boundary
  percentage math are genuinely new.
- Same infrastructure limit as `review-scheduler`'s own verification:
  `actions.ts` needs Next's `cookies()`, unusable from a plain script.
  Resolved the same way -- calling the exact pure functions
  (`computeExamStages`, `currentStage`, the four `scoped-selection.ts`
  selectors, `composeStagedPlan`, `computeReadinessSnapshot`) against
  real rows via the service-role client.
- The live walkthrough repeated the exact same fixture-harness mistake
  found during `review-scheduler`'s own verification -- the
  verification script's `fetchConceptState` returned
  `computeLearnerState`'s raw `tier` field instead of remapping it to
  `masteryState` the way the real `getConceptState` does, crashing
  `computeReadinessSnapshot`. Worth calling out twice now: any live
  verification script that reimplements a "use server" action's real
  DB-fetch-plus-pure-function logic must also reimplement that
  action's own field renaming exactly, or the mismatch surfaces as a
  crash in the *pure* function being tested, not in the harness code
  that actually has the bug.
- After the fix: a real ~20-day staged plan correctly surfaced both
  weak/thin-evidence concepts in the diagnostic stage (each with a
  real, specific reason) and the real weak edge in the interleaving
  stage; a 2-day-out exam correctly compressed to only
  `timed-mixed`/`final-weakness`, summing to exactly 2 days, never
  inventing time; real readiness distinctly separated an
  unresolved-misconception concept, an untouched concept, and normal
  tier buckets; and T017 (US3) confirmed live that committing new
  evidence moved a concept out of `untouched` on the next read with no
  reconfiguration, and that a past-dated exam correctly reported
  `exam_date_passed`. Feature complete: all 20 tasks (T001-T020) done,
  whole-repo typecheck clean, 226-test unit suite passes.

## visual-assessment-graph-tree (011) -- complete, Phase 6, final roadmap item

- No new npm dependency (vision extraction reuses the existing
  `openai` client, not a handwriting-recognition library or a headless-
  canvas package) and no new Postgres table -- confirmed through
  implementation: the drawing's storage path and extracted structure
  live in `assessment_attempts.response`'s existing `jsonb` column. The
  one new piece of infrastructure is a Storage bucket
  (`assessment-drawings`), same shape `course-artifacts`'s bucket
  already established.
- The generic "strip every `claimed*`-prefixed field" mechanism
  (`problem-setup.ts`) that `review-scheduler`'s own research.md
  flagged and deliberately deferred during that feature's UI wiring
  turned out to be exactly what this feature needed to render a
  question without leaking its embedded answer -- built here, not
  invented ad hoc, closing a loop from two features ago.
- Real bug found live (T017, quickstart.md B5): the vision model
  reported confidence 1.0 for a blank drawing while returning an empty
  extracted order -- `needsConfirmation` alone (gating only on
  self-reported confidence) would have silently accepted this as a
  confident, if empty, answer, violating FR-007's "no coherent
  structure could be extracted" requirement. Fixed two ways: (1) the
  extraction prompt now explicitly instructs the model to report low
  confidence when the drawing shows no legible answer, which alone
  fixed both the blank-image case and a separately-tested genuinely-
  ambiguous scribbled drawing on re-test; (2) `isImplausibleExtraction`
  adds a deterministic backstop -- checking real structural plausibility
  (e.g. an order that doesn't visit every real node) independent of
  whatever confidence the model reports -- so honesty about "nothing
  found" doesn't depend solely on the model behaving well (Constitution
  Principle IV extended to the extraction step's own self-report, not
  just final grading).
- Verified live end to end using a real headless browser (Playwright,
  already a project dependency) to render an actual HTML5 canvas
  drawing -- a real PNG a real student's browser would produce, not a
  synthetic stand-in -- so the vision extraction call was genuinely
  exercised: a real correct and a real incorrect BFS drawing graded
  correctly via the existing `checkTraversal`; a real correct
  tree-traversal drawing graded correctly via `checkTreeTraversal`
  (T017/US3's cross-domain proof); a blank drawing and a genuinely
  ambiguous one both correctly triggered confirmation after the fix
  above. Feature complete: all 20 tasks (T001-T020) done, whole-repo
  typecheck clean, 243-test unit suite passes. This closes out every
  item on `docs/implementation-roadmap.md`.

## 2026-09-02 — Hardening pass: domain-generality audit + unhandled-external-call sweep

Prompted by a direct question: is the ingestion/tutoring/grading
pipeline genuinely reusable for a course this project hasn't
specifically encountered (e.g. a history or biology syllabus), not
hardcoded to the DSA dogfood domain? Audited by grep, not memory, then
fixed what was found.

- **Real bug**: `course-graph-ingestion`'s `EXTRACTION_PROMPT` literally
  told the model "you are extracting... for a data-structures-and-
  algorithms course" on every single artifact, regardless of subject —
  a real bias risk for any non-CS upload. Fixed to explicitly instruct
  the model to infer the subject from the artifact itself. Verified
  live: a French Revolution history excerpt now extracts clean,
  subject-appropriate concepts with zero DSA leakage; a DSA excerpt
  still extracts correctly (BFS, FIFO queue) -- no regression.
- Confirmed everywhere else already generic on inspection: reconciliation
  classification, the tutor's system instructions, question generation,
  rubric grading, ambiguity/similarity checks, blind-solve — none
  assume a subject. `deterministic-grading`'s 5 DSA-specific checkers
  are an intentional, documented MVP scope choice (PRD D6), not
  hardcoding — anything outside those 5 domains already falls back
  correctly to general LLM-rubric grading, which works for any subject.

While auditing, found the same class of bug independently in four
different places: **a real external-service call inside a loop/action
with no try/catch, whose failure silently threw past the code that
would have recorded an honest failure state**, leaving the affected
row stuck at a non-terminal status ("processing"/"pending") forever
instead of an honest "failed":

1. `deterministic-grading`'s `gradeTextResponse` — the rubric-grading
   OpenAI call had no guard (unlike `gradeCode`, which already caught
   its own failures). Fixed: `RubricGradingResult` gained a
   `did_not_complete` variant; the existing `toCommitEvidenceInput`
   funnel already handled that outcome shape from the code-grading
   side, so no further changes were needed there. Live-verified with a
   fake client forcing a throw.
2. `assessment-generation-pipeline`'s per-attempt loop
   (`trigger/generate-assessment.ts`) — a failure in candidate
   generation or any of the six validation layers skipped the
   `assessment_generation_runs` insert entirely, leaving
   `getGenerationRun`'s derived status stuck at "pending" forever with
   zero attempts recorded. Fixed: each attempt is now individually
   caught and recorded as a real failed row, then the bounded loop
   continues. Verified live by forcing a real OpenAI auth failure
   (invalid API key): all 3 attempts were honestly recorded as failed.
3. `tutor-agent`'s `sendTutorMessage` — no guard around `runTutorTurn`,
   and `TutorChat.tsx` has none either, so a failure would leave the
   chat UI's pending spinner stuck forever with no error shown. Fixed
   at the `actions.ts` boundary (not inside `run-tutor-turn.ts`, keeping
   that file's return type unchanged) to resolve the same
   `{ turn: null, error }` shape every other failure path there already
   produces. Not independently live-verified (same cookies()-based
   auth limitation as `review-scheduler`/`exam-planner`'s own
   verification scripts) — typecheck-verified and pattern-matched
   against the already-tested rubric-grader fix.
4. `course-graph-ingestion`'s `writeExtractionCandidates` (the
   reconciliation classifier's per-concept loop) — no guard, so a
   failure partway through left `extraction_runs` stuck at
   "processing" forever with partial concepts/edges already inserted
   and no completion signal. Fixed by routing through this file's own
   already-proven `markFailed` helper, the same one already used for
   this task's other three failure modes.

Swept every remaining `openai.responses.create`/`openai.files.create`
call site in the codebase afterward to confirm no other gap of this
class remains — each is now either directly guarded or covered by an
enclosing caller's guard. E2B's sandbox grader was already correctly
guarded from when it was first built. No fixes needed beyond the four
above.

## 2026-09-02 — Hardening pass, continued: RLS completeness, client error-display, unbounded inputs

- **RLS audit**: every table's policy set checked against what the
  application code actually does with it, not just "is RLS enabled."
  No `using (true)` anywhere. `courses`/`artifacts` have no
  update/delete policy, but no code path calls `.update()`/`.delete()`
  on either table yet (no rename-course/delete-artifact feature
  exists) -- a real future gap to close when that feature is built,
  not a live bug today, so left alone rather than speculatively adding
  policies for a capability that doesn't exist (YAGNI).
- **Real bug**: `StudySession.tsx` (`review-scheduler`) and
  `ExamPlanner.tsx` (`exam-planner`) both rendered
  `submitTextAnswer`'s `result.outcome` unconditionally, never
  checking its `error` field -- meaning a real failure (signed-out, or
  the rubric-grader's new `did_not_complete` outcome from the earlier
  fix in this same pass) would render as a plausible-looking grading
  verdict instead of a visible error. Both fixed to check `error`
  first, matching the pattern every other client component in the
  codebase already used correctly (`TutorChat.tsx`,
  `ConceptDetailPanel.tsx`, `QuestionCanvas.tsx`).
- **Real bug**: neither Storage bucket (`course-artifacts`,
  `assessment-drawings`) had a `file_size_limit` set -- an unbounded
  upload could cost real storage/egress. Fixed with a generous 50 MiB
  cap for real course material and a tight 5 MiB cap for a single
  canvas snapshot; verified live against the real project.
- **Real bug**: no upper bound existed on a student's tutor message
  before it's sent directly to a paid model call -- `sendTutorMessage`
  is a reachable server action, not gated by the chat UI's own input
  alone. Added `validateStudentMessage` (4000-char cap), mirroring the
  existing `validateFlagReason` convention
  (`course-graph-ingestion/flag-validation.ts`) -- noted that
  `validateFlagReason` itself has no upper bound either, a lower-
  priority, lower-cost analog left as a known gap rather than expanded
  into scope now.

Nine real issues found and fixed across this two-part hardening pass
(one domain-generality bug, four unhandled-external-call crashes, two
client-side error-masking bugs, one missing storage limit, one
unbounded-input gap). Full unit suite (248 tests) and whole-repo
typecheck both pass after every fix.

## 2026-09-02 — Closed the deferred generic structured-answer form

`review-scheduler` and `exam-planner` originally showed graph/tree
(checker-domain) session items as "not yet answerable here" --
deliberately deferred during `review-scheduler`'s own build pending a
generic (not per-domain-hardcoded) mechanism.
`visual-assessment-graph-tree` later built exactly that mechanism for
its own drawing-based flow: `extractProblemSetup` strips a checker
input's `claimed*` answer fields to get a safe-to-render problem
setup, and `mergeStructure` recombines a student's answer with it
before grading.

That mechanism doesn't care whether the "claim fields" came from a
vision extraction or a typed form -- so this session wired the same
two pure functions into a generic `StructuredAnswerForm` (a JSON
textarea pre-filled with an empty per-domain template, same "edit the
real structure directly" pattern `ConfirmExtraction.tsx` already
established) in `review-scheduler`, reused unchanged by `exam-planner`
the same way it already reuses `submitTextReviewAnswer`. No new
checker, no new grading path, no new table -- `SessionItem`/
`QuestionBankEntrySummary` just needed to carry `question_bank`'s
already-existing `checker_domain`/`checker_input` through, which
nothing previously threaded end to end. Verified live: a real
`bfs-dfs` question_bank entry's problem setup merges correctly with a
simulated student's typed claim and grades correctly (both directions)
through the real, unchanged checker.

## 2026-09-02 — Real bugs found via actual manual + Playwright use, not scratch scripts

Every prior "live verification" this project did used a service-role
client directly in throwaway scripts -- proving the deterministic
logic works against real data, but never exercising the real
authenticated browser flow end to end. The first time a real person
(and then Playwright) actually clicked through the app, three
real bugs surfaced that no amount of scratch-script verification could
have caught, because RLS-as-the-real-user and passing functions across
the Server/Client Component boundary are exactly the two things a
service-role script never exercises:

- **`/atlas` and `/study`'s "load more"** both passed a plain inline
  arrow function (wrapping a real server action) as a prop to a Client
  Component -- React's RSC boundary silently rejects that unless the
  function has its own `"use server"` directive. 500 error on every
  real (non-demo) course, invisible because visual regression only
  ever hit the demo fixture route. Fixed with an inline `"use server"`
  directive, matching the one already-correct example
  (`demoEvidenceProvenance`) in the same file.
- **Course creation** silently discarded `createCourse`'s real
  `{course}|{error}` result and never navigated anywhere on success --
  fixed by converting to a client component matching the error-display
  convention every other form already used.
- **The first real authenticated upload** hit
  "new row violates row-level security policy for table
  \"artifact_processing_runs\"" -- that table's own migration comment
  claimed only the service-role Trigger.dev task writes it, but
  `trigger/ingest-artifact.ts`'s own idempotency guard requires the row
  to already exist, so the real student-facing upload action has
  always needed to create it first. RLS silently blocked every real
  attempt. Added the missing insert-own policy
  (`0011_artifact_processing_runs_insert_policy.sql`).

Also found and fixed: `tests/e2e/global-setup.ts`'s evidence-seeding
fixture had been silently broken since `deterministic-grading` added a
real FK constraint its placeholder UUID no longer satisfied -- nobody
had re-run the full E2E suite since that migration shipped.

New coverage added to prevent regressions on any of these:
`tests/e2e/basic-flows.spec.ts` (sign-in, course creation, every
feature page) and `tests/e2e/upload-course-material.spec.ts` (a real
PDF upload, `tests/fixtures/dummy-syllabus.pdf`). Both pass on
chromium and mobile.

**Takeaway for future work**: scratch-script live verification proves
business logic is correct against real data, but does not prove the
real user-facing path (RLS as an ordinary authenticated user, Server-
to-Client Component prop boundaries, real form submission) actually
works. A feature isn't done-done until it's been clicked through for
real at least once.

## 2026-09-02 — Real upload found by the product owner: filename with "#" silently truncated in Storage

The RLS fix above unblocked uploads, but the very next real upload
(a file literally named `HW#1.pdf`) still failed:
`artifact_processing_runs.failure_reason` read "The uploaded file
could not be found in storage." Root-caused by re-uploading the same
bytes/path with a service-role script and listing the real Storage
folder afterward: the object landed named `HW`, not `HW#1.pdf` --
Supabase's storage-js client builds the upload request's URL by
concatenating the key without encoding it, so an unencoded `#` is
read as a URL fragment delimiter and everything after it is dropped.
Tried `encodeURIComponent(file.name)` first; that made storage-js
itself reject the upload with `InvalidKey` (Supabase decodes the key
before validating it, so `%23` still resolves to a rejected `#`).
Landed on sanitizing the storage key instead -- replacing anything
outside `[a-zA-Z0-9._-]` with `_` -- while leaving `original_filename`
in the DB untouched for display (`artifact-board.tsx`). Verified live:
the same upload/list round-trip that reproduced the bug (a real file
named `HW#1.pdf`) succeeds with the sanitized key and lists back
correctly.

Also found while diagnosing this: the product owner's *first* upload
attempt (before the RLS fix above landed) left a permanently dead
`artifacts` row stuck at `queued` with no `artifact_processing_run`
at all -- an orphan from hitting the RLS bug mid-write. Not a bug to
fix (uploadArtifact() correctly returns an error in that path today,
matching every other write in this project's convention of never
partially applying a multi-step write silently); the dead row itself
is real leftover data, not a code defect -- decided to leave orphan
cleanup out of scope rather than add a reconciliation job for a
failure mode this specific bug can no longer produce.

## 2026-09-05 — `course_units` gains a proposed/confirmed/archived review lifecycle

Reverses this project's original position that units are "organizational
metadata, not an extracted claim," and so exempt from the review flow
concepts and edges go through (stated in `0003_course_ontology.sql`'s own
comment and `specs/004-course-graph-ingestion/data-model.md`). Two things
forced the reversal: extraction had **no path to create a unit at all**, so
a course whose owner hadn't hand-authored units first could not be
extracted into; and auto-creating units without review runs straight into
the "confidently-wrong `distinct`" duplicate-unit problem the feature's own
design doc names as its main residual risk. Units now mirror
`course_concepts` exactly (`status`, `extraction_run_id`, migration
`0012_unit_extraction_reconciliation.sql`), with manual `createUnit` still
inserting `'confirmed'` directly — the student is the authority on their
own course structure, so there is nothing there to review.

Consequence that has to be enforced in code, not by a constraint: a
confirmed concept may never reference a non-confirmed unit, because
`getCourseGraph` selects only confirmed rows of both and
`materializeCourseGraph` throws on the dangling reference — a whole-course
Atlas outage. `confirmCandidate` refuses a concept until its unit is
confirmed (it deliberately does not auto-confirm the unit, which would
throw away the review gate this decision exists to create), and
`rejectCandidate` refuses to archive a unit confirmed concepts still point
at.

## 2026-09-05 — Edges leave human review entirely and auto-confirm from their endpoints

Relationships no longer appear in the review queue (2026-09-05 amendment to
FR-006, `specs/004-course-graph-ingestion/spec.md`). An edge auto-confirms
exactly when both concepts it connects are themselves `'confirmed'`.

Rationale: per-edge review was redundant once concept-level trust exists —
a reviewer who has confirmed both endpoints has already vouched for the
claim's vocabulary, and reviewing the relationship separately was work
without a distinct decision behind it. This preserves the human-reviewed
trust chain *transitively* rather than dropping it: nothing enters the
graph that a human didn't confirm, but confirmation happens at the level
where the human actually has an opinion.

Cost, accepted knowingly: the auto-confirm decision is now the only path an
edge has into the graph, so a missed decision loses a relationship
silently. Mitigated by making it a decision made in three places from one
shared rule (insert-time in the extraction task, the confirm-time cascade,
and `sweepEligibleEdges` — one deterministic post-batch pass), so
correctness doesn't depend on the order or concurrency in which individual
confirms happened to run.

## 2026-09-05 — Supabase Realtime had never actually been enabled, project-wide

Found while live-testing this feature's extraction-status UI: the
`supabase_realtime` publication had **zero tables in it** on the real
project, and no migration had ever added one. Every Realtime subscription
in this codebase — including `artifact-board.tsx`'s, claimed live since
`account-course-artifact-foundation` (FR-011, "updates without manual
reload") — had therefore never delivered a single event. A pre-existing gap
this branch's live testing surfaced, not one this branch introduced. Fixed
by `0013_enable_realtime_publication.sql`, which enables `artifacts` and
`extraction_runs`.

The takeaway is the one already recorded on 2026-09-02: a feature that
depends on infrastructure state is not verified by typechecking or unit
tests around it. Anything Realtime-backed added from here needs its table
added to that publication in the same migration that introduces it, or it
is a silent no-op.

## 2026-09-07 — Real bug: duplicate DOM ids broke the review-queue Edit/Save flow

Reported directly: clicking Save after editing a proposed concept/unit in
`ReviewQueue.tsx` discarded the edit. Root cause: the same candidate can be
on-screen twice at once — the always-visible list and the run-scoped popup
both rendered off the same `items` state, and every real item has a
non-null `extractionRunId`, so the overlap was the default case, not an
edge case. `CandidateCard`'s edit `<form id="edit-form-${id}">` was built
from the item id alone, so both copies got the identical DOM id; a
duplicate id makes the `form="..."` attribute on the input/textarea bind
to whichever element the browser matches first, so a Save from one copy
could submit the *other* copy's stale, unedited values. Fixed by
qualifying the form id by which surface it's on.

## 2026-09-07 — The plain always-visible list is removed; the popup is the only review surface

Once the duplicate-id bug above made the dual-surface design's cost
visible, the product call was to drop the persistent list entirely rather
than just fix the id collision. `proposed` is a valid, indefinitely
resting status (`course_concepts`/`course_units`' own check constraints
have no default/expiry), so dismissing the popup (`×`) is a deferral, not
a forced decision — it never mutates status, and nothing auto-reopens it
for the same leftover run afterward. The only way back to a dismissed
run's candidates is a fresh navigation/reload of that course's Material
page, which recomputes `activeModalRunId` from real current data.
Consequence accepted knowingly: there is now no persistent affordance
elsewhere signaling that candidates are waiting — a reviewer has to land
on that specific page to see them.

Bulk-confirm was also hardened in the same pass: it now excludes any
candidate whose reconciliation decision is `"uncertain"` (and any concept
whose *unit* is uncertain, since it wouldn't be confirmable anyway) —
previously a bulk click could confirm an uncertain match right alongside
routine candidates. The button's displayed count is deliberately the full
per-kind total in the popup, not just the bulk-confirmable subset (every
candidate, uncertain or not, is already visible on its own card right
above the button), with a post-click "N uncertain skipped — review
individually" notice when applicable. Each concept card also now shows
the extraction pipeline's own per-item confidence score, separate from the
uncertain flag — surfacing scrutiny-worthy candidates even when the
dedup-matcher didn't flag them.

## 2026-09-07 — Units become the sole review-gated side of extraction; concepts auto-confirm

Reverses part of the 2026-09-05 decision that gave units the same
proposed/confirmed/archived review lifecycle as concepts. Prompted by a
direct product complaint: reviewing both concepts and units in the same
popup was confusing, and users don't want the extra per-concept work.

Rather than drop review entirely (considered and rejected — see below),
the fix is to keep exactly one side gated, chosen by which side is
actually more error-prone. That's units, not concepts, per this
project's own prior documentation: `docs/superpowers/specs/
2026-09-05-unit-extraction-reconciliation-design.md`'s "Mitigation for
the 'confidently-wrong distinct' residual risk" section names unit
reconciliation as the still-open risk, because a unit candidate is
classified against nothing but a bare title — thin signal, easy to
misjudge "new" vs. "same unit, different phrasing" (e.g. "Graphs" vs.
"Graph Algorithms"). Concepts get the same three-way merge/distinct/
uncertain classifier, but with much richer signal (full description,
aliases, source anchors), so their classification is meaningfully more
trustworthy — and concepts were the original, more mature half of this
review design (US3/FR-005) to begin with.

Mechanism (mirrors the edge auto-confirm pattern this feature already
established, applied one level up):
- **Insert time** (`trigger/extract-course-graph.ts`,
  `shouldAutoConfirmConcept(unitStatus, reconciliationDecision)`): a
  freshly-extracted concept inserts straight to `'confirmed'` when the
  unit it files under is already `'confirmed'` AND its own reconciliation
  decision isn't `"uncertain"`. Otherwise it inserts `'proposed'` as
  before.
- **Confirm time** (`actions.ts`'s `autoConfirmEligibleConcepts`, called
  from `confirmCandidate`'s unit branch, decision logic factored into
  `concept-auto-confirm.ts`): the moment a reviewer confirms a unit,
  every `'proposed'` concept under it is re-checked and auto-confirms
  unless it's itself an uncertain match — cascading again into
  `autoConfirmEligibleEdges` for every edge that concept completes, with
  zero changes needed to the edge cascade itself.
- No sweep/backstop pass was needed for this cascade the way edges needed
  one: a concept depends on exactly one unit, never two units converging,
  so there's no two-sided race to backstop — the per-confirm cascade
  alone is deterministic.
- `ReviewQueue.tsx`'s concept bulk-confirm became dead code under this
  model (every concept that would qualify gets swept by its sibling
  unit-confirm cascade first) and was removed; the popup's only bulk
  action is now "Confirm N Units". Confirming a unit can now cascade-
  confirm sibling concepts the client didn't touch, so `handleConfirm`
  refetches the whole review queue after a unit confirms rather than
  locally splicing just that one item — a local patch can't reflect a
  server-side side effect it doesn't know happened.
- `rejectCandidate`'s "'proposed'-only" guard gained one deliberate
  exception: a concept can now be archived from `'confirmed'` too (not
  only edges/units, which stay `'proposed'`-only), since a concept is
  very often already confirmed by the time anyone looks at it. Gained the
  matching dependents guard `rejectCandidate` already had for units
  (refuses if confirmed relationships still reference it — the same
  `materializeCourseGraph` dangling-reference throw, reached from the
  concept side instead of the unit side).

Considered and rejected: removing the `proposed` review gate entirely
(insert everything as `'confirmed'`, review only by manual override
after the fact). Rejected because an uncertain reconciliation match would
then go live in the Atlas/tutor/assessment pipeline immediately, with no
signal it might be wrong — indistinguishable from something a human
actually checked. The chosen design keeps that gate for exactly the
candidates it exists to catch (uncertain matches, either kind) while
removing it for the case it was genuine overhead for (routine concepts
under an already-trusted unit).

Known gap, not yet resolved: `editCandidate`/`rejectCandidate` are now
capable of acting on an already-confirmed concept, but there is currently
no UI surface to reach them once a concept has left the review popup (no
edit/archive affordance exists yet on the Atlas or elsewhere). "Editable
after confirmation" is a real requirement this session did not fully
close — the backend is ready, the UI placement is an open question
(Concept Atlas's `ConceptDetailPanel`? A separate manage-concepts view?)
deliberately left for a dedicated decision rather than bolted on here.

## 2026-09-08 — `quality-gates` had never actually passed; found and fixed every real reason why

Prompted by a direct question after pushing the work above: the CI run
on that push failed. Checked the run history — every single run since
this workflow was introduced had failed, always at a different point,
because each earlier failure was masking the next one. Fixed them in
the order they were actually blocking:

1. **Typecheck ran before anything generated `.next/types/`.**
   `src/app/layout.tsx`'s `LayoutProps<"/">` (Next 15+'s auto-generated
   typed-route helper) doesn't exist until `next build` or `next dev`
   has run once — a bare `tsc --noEmit` in a fresh checkout has never
   been able to resolve it. Added a `next typegen` step
   (`.github/workflows/ci.yml`) before Typecheck; also pinned
   `node-version` to `"24"` (GitHub already force-runs everything on 24
   regardless — Node 20 is deprecated on Actions runners — the old `"20"`
   pin was just lying about what actually ran, and 24 is what this
   project's own local dev setup already uses).
2. **The E2E job had no Supabase (or OpenAI) credentials at all** — a
   fresh checkout has no `.env.local`, and nothing was wired from GitHub
   repository secrets into the job's env. Added
   `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/
   `SUPABASE_SERVICE_ROLE_KEY`/`OPENAI_API_KEY` as real secrets, wired
   into the E2E step's `env:` block. `TRIGGER_SECRET_KEY` was
   deliberately left unset (see #4) — a real environment gap this
   project has always had (no live Trigger.dev project yet), not
   something to add a secret for.
3. **Playwright had no `testMatch`**, so its default pattern also
   matched `tests/unit/**/*.test.ts` (node:test files) — it tried to
   load every one of them too, alongside whatever real spec failures
   were happening, failing on `node:test`'s own syntax
   (`import.meta`, etc.) it doesn't support. Scoped `playwright.config.ts`
   to `**/*.spec.ts`, matching this project's own existing test/spec
   naming split.
4. **`uploadArtifact` crashed the whole page** the moment credentials
   existed enough to actually reach real UI interaction: CI has no
   `TRIGGER_SECRET_KEY`, so `ingestArtifactTask.trigger()` throws
   `ApiClientMissingError` — uncaught, so it crashed the whole Server
   Action (and with it the page, Next's generic "This page couldn't
   load" boundary) instead of leaving a real, visible failure. This is
   the fifth instance of the exact bug class the 2026-09-02 hardening
   pass already found and fixed four times (an unguarded external-
   service call leaving a row stuck non-terminal forever) — it just had
   no real browser E2E reaching it until now. Fixed the same way: wrap
   in try/catch, mark `artifacts`/`artifact_processing_runs` `'failed'`
   with the real reason (rows already exist by this point — the upload
   itself genuinely succeeded) — `getDisplayStatus`/`listArtifacts`
   already render an artifact-level `'failed'` status distinctly
   ("Upload failed") using exactly that reason, so no new display logic
   was needed.
5. **`AppShell`'s sidebar was a fixed 220px, never responsive at all** —
   on a phone-width viewport it left as little as ~90px for actual page
   content, which is what was really breaking the upload test on the
   `mobile` Playwright project (the uploaded filename existed in the DOM
   but had collapsed to 0 width). Added a 56px icon-only collapsed rail
   below the same 768px breakpoint concept-atlas already uses
   (`--sidebar-w-collapsed`, `globals.css`).

   First attempt at the mobile-detection logic used a `useState` lazy
   initializer reading `window.matchMedia()` directly (mirroring a fix
   already made to `ConceptAtlas.tsx` earlier the same session for a
   `react-hooks/set-state-in-effect` lint error) — both had the same
   real bug, not just a lint nit: the server always renders `isMobile =
   false` (no `window` at SSR time), but a client whose real viewport IS
   mobile-sized hydrates with a different, already-`true` value, which
   React correctly flags as a genuine hydration mismatch. Replaced both
   with a shared `useMobileBreakpoint` hook
   (`src/lib/use-mobile-breakpoint.ts`, `useSyncExternalStore`) — its
   `getServerSnapshot` argument is the API React actually provides for
   "the answer can differ between server and client": SSR and the
   client's first render both honestly report `false`, then the client
   corrects itself immediately after hydration, with no manual
   `setState` call for that lint rule to flag either.
6. **`tests/visual/review-queue.spec.ts` had two compounding,
   pre-existing bugs**, not one — it navigated to
   `/courses/demo/review` (`review-scheduler`'s unrelated `DueQueue`,
   already tracked as a known gap), *and* the correct route
   (`/courses/demo`, the Material page) had no demo-fixture branch at
   all, unlike `atlas/page.tsx`'s existing `courseId === "demo"`
   pattern — so fixing the route alone still wouldn't have worked.
   Added the missing branch (`loadDemoReviewQueue`, mirrors
   `loadDemoCourseGraph` exactly), fixed the route, fixed a broken
   locator (`.locator("..")` from a card's title only reaches its own
   wrapper div, never the sibling column the Confirm button actually
   lives in — rewrote to scope from the shared `<li>` card instead), and
   fixed the fixture itself (its two concepts had different
   `extractionRunId` values, so the review queue's one-run-at-a-time
   popup would only ever show one of them — both now share a run).
7. **Every checked-in visual snapshot was `-darwin` only** — Playwright
   snapshot names are platform-suffixed by design (font rendering
   differs enough between OSes to fail a byte-for-byte compare), so
   `toHaveScreenshot` could never have passed on this project's own
   `ubuntu-latest` CI runner regardless of app correctness, for any
   commit, ever. Generated real `-linux.png` baselines via a one-off,
   temporary `workflow_dispatch` workflow run once against this exact
   commit (matching CI's own environment exactly, not an approximation
   via local Docker), spot-checked by eye before committing, then
   deleted the temporary workflow.

Result: lint/typecheck/build fully green; all real `e2e` specs passing
on both `chromium` and `mobile`; `review-queue.spec.ts` fully passing on
both. 3 `concept-atlas` mobile tests and all 7 `tutor-agent-e2e` tests
still failing at this point — carried into the next day's entry below,
since they turned out to be two more distinct, real, unrelated findings
rather than more of the same CI-wiring problem.

## 2026-09-09 — Two more real bugs, not more CI wiring: a test-design mismatch and stale reskin-era assertions

Continuation of the above — asked directly whether the 3 remaining
`concept-atlas` mobile failures meant the feature wasn't finished.
Checked `specs/003-concept-atlas-renderer/tasks.md` first rather than
guessing: all 5 user stories, including US5 (mobile), are marked done,
and disabling `fitView` on mobile is a **deliberate** FR-013
requirement (`ConceptAtlas.tsx`'s `isMobile` branch) — shrinking the
whole multi-unit graph to fit a phone screen would make it unreadable,
so the initial view instead centers on only the leftmost unit, per
task T029's own documented design.

The real bug was in the *tests*: 3 of them click "Sorting &
Searching"/"Trees", a specific weak-relationship edge, and "Depth-First
Search" — none of them the leftmost unit, so they're genuinely outside
the initial mobile viewport, and a canvas panned via CSS transform
isn't something Playwright's normal scroll-into-view can reach. These
were written assuming desktop's fitView-shows-everything behavior and
had never actually run against the `mobile` project's real constraints
until the previous day's Linux-baseline fix let them execute for the
first time. The interaction itself has nothing mobile-specific about it
and stays fully verified on `chromium`; skipped the 3 on `mobile` with
an explicit `test.skip` reason rather than reworked, since the actual
mobile claim (a concept is reachable without panning) is already its
own correctly-written dedicated test ("phone-sized viewport"), which
deliberately only ever clicks the leftmost concept for exactly this
reason.

Separately, all 7 `tutor-agent-e2e` tests were still failing. Earlier
assumption (that they needed `OPENAI_API_KEY`) was wrong — that suite's
own doc comment says it uses a scripted test-double, never a real model
call. Two real, compounding staleness bugs, same class as
`smoke.spec.ts`/`basic-flows.spec.ts`'s earlier reskin-drift fixes:
- The chat input's real placeholder is `"Ask a question…"`; the test
  looked for `"Ask the tutor something..."` (different wording,
  different ellipsis) on all 9 of its own `fill()` calls.
- The send button is icon-only with no accessible name at all —
  `getByRole('button', { name: 'Send' })` could never have matched it,
  reskin or not. Same accessibility gap as `CreateCourseForm`/
  `AddUnitForm`, fixed earlier in the 2026-09-08 entry above (`aria-
  label="Send"`, matching the convention this codebase already uses for
  `ReviewQueue`/`ConceptDetailPanel`'s own icon-only close buttons).

Fixing those got 6 of 7 passing immediately; the 7th ("independent
correct retrieval and repeated confident wrong answers") failed with a
genuine data-timing race, a different assertion failing on each retry.
Root cause: after the 2nd/3rd chat message, the test waited a fixed
500ms (or nothing at all before the 3rd message's DB query) instead of
waiting for that message's own server round-trip to actually finish.
`TutorChat.tsx`'s textarea is disabled for the exact duration of the
awaited `sendMessage()` call, which itself awaits every
`pendingEvidenceCommits` write (`actions.ts`) before resolving — so
waiting for it to re-enable is an exact, deterministic signal the
evidence commit has really landed, unlike a fixed sleep. Couldn't wait
for specific response text here (unlike the first message in the same
test) since the exact wording for these two depends on the assistance-
ladder step reached, which isn't fixed across the conversation. 500ms
was apparently enough locally but not against CI's slower/more-loaded
runner — and retries made it worse, not better, since they reuse the
same fixture course rather than resetting it, so a failed attempt's
partial evidence carried into the next retry rather than starting
clean. Verified with 4 consecutive local runs after the fix, all
passing, then confirmed in a real CI run: fully green.

Also added a small `maxDiffPixelRatio: 0.02` to `playwright.config.ts`'s
global `expect` — the one flake seen along the way (a consistent, small
~1% pixel diff on the "phone-sized viewport" screenshot) turned out to
be Next.js dev mode's own transient "Compiling…" badge caught mid-
screenshot on that route's first-ever compile in a fresh CI dev server
(this project deliberately uses `npm run dev`, not a build+start
server, as the E2E `webServer.command`) — not a product regression.
Every real regression this suite has ever actually caught has produced
a 50%+ pixel diff, so this tolerance doesn't meaningfully weaken
detection.

**`quality-gates` is fully green as of this entry** — lint, typecheck,
build, and the complete `e2e`/`visual`/`tutor-agent-e2e` suite across
all three Playwright projects.
