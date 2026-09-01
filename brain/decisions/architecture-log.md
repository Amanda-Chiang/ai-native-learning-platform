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
