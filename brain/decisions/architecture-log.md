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
