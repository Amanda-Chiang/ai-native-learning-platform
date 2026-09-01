# Phase 0 Research: Account, Course & Artifact Foundation

No `NEEDS CLARIFICATION` markers were left in the Technical Context. This
file records the resolutions in Decision/Rationale/Alternatives format.

## Auth integration: `@supabase/ssr` with cookie-based sessions

- **Decision**: Use `@supabase/ssr`'s `createServerClient`/
  `createBrowserClient` helpers rather than the older
  `@supabase/auth-helpers-nextjs` package, with the session stored in an
  httpOnly cookie managed by Next.js middleware.
- **Rationale**: `@supabase/ssr` is Supabase's current officially
  maintained package for App Router (the older `auth-helpers` package is
  in maintenance mode). Cookie-based sessions let Server Components and
  Server Actions read the authenticated user without the client shipping
  a token in every request, which is what makes RLS enforcement in
  `data-model.md` actually reachable from server-side code paths.
- **Alternatives considered**: `@supabase/auth-helpers-nextjs` (rejected
  — superseded); a custom JWT-in-localStorage scheme (rejected — reinvents
  what Supabase Auth already solves, and keeps the session out of
  server-readable cookies, breaking RLS-aware server actions).

## Per-user isolation: Postgres RLS policies, not app-layer filtering

- **Decision**: Every table (`courses`, `artifacts`,
  `artifact_processing_runs`) gets `ENABLE ROW LEVEL SECURITY` plus
  `SELECT`/`INSERT`/`UPDATE` policies keyed on `auth.uid() = owner-chain`.
  Application code queries tables directly through the RLS-scoped client
  with no manual `WHERE user_id = ...` as the *only* safeguard.
- **Rationale**: spec FR-002 requires isolation "under any access path"
  — an app-layer filter that one code path forgets to include is exactly
  the failure mode RLS is designed to make structurally impossible,
  matching the same "enforce via structure, not convention" approach
  Phase 0 used for evidence immutability. Plan.md's Constraints section
  states this directly.
- **Alternatives considered**: application-layer authorization checks only
  (rejected — a single missed `WHERE` clause in a new code path would
  silently leak data, exactly the class of bug RLS exists to prevent);
  a separate per-tenant schema (rejected — massive overkill for
  single-owner-per-row data, no multi-tenancy requirement exists).

## File upload path: client uploads directly to Supabase Storage, server records the row

- **Decision**: The browser uploads the file bytes directly to Supabase
  Storage using a signed upload flow (client has a short-lived,
  RLS-scoped Storage client), then calls a server action that inserts the
  `artifacts` row (referencing the Storage object path) and triggers the
  Trigger.dev task.
- **Rationale**: routing file bytes through a Next.js server action would
  double the upload bandwidth (browser → Next.js server → Storage) for no
  benefit, since Supabase Storage already enforces its own RLS-equivalent
  access policies on the bucket. The server action only needs to write
  the lightweight `artifacts` metadata row, which is what needs a
  server-trusted context (to run as the authenticated user via RLS and to
  enqueue the background task).
- **Alternatives considered**: proxying the upload through a Next.js API
  route (rejected — unnecessary bandwidth cost, no security benefit since
  Storage bucket policies already scope access); uploading directly from
  the client with no server-side record at all (rejected — spec FR-006
  requires the artifact to appear in-app immediately with a "queued"
  status, which needs a database row, not just a file sitting in Storage).

## Background processing: one Trigger.dev task, idempotent on retry

- **Decision**: One Trigger.dev task (`ingest-artifact`) is triggered by
  the server action after the `artifacts` row and its first
  `artifact_processing_runs` row (status `queued`) are created. The task
  updates that run's status to `processing`, performs deterministic
  validation (file exists in Storage, is a supported type, is non-empty
  and under the size limit), and writes a terminal status
  (`ready`/`failed`) to both the run and the parent artifact. Trigger.dev's
  built-in retry-on-crash behavior is safe because the task's first step
  re-reads current status before proceeding, so a retried run doesn't
  double-process or get stuck.
- **Rationale**: spec's Edge Cases section requires that a crashed/
  restarted job must not leave an artifact stuck at "processing" forever;
  Trigger.dev provides retries and durable execution out of the box (PRD
  §9.5), so the task only needs to be written idempotently rather than
  needing custom crash-recovery infrastructure.
- **Alternatives considered**: a database cron/polling job to sweep stuck
  "processing" rows (rejected — Trigger.dev's own retry/checkpoint
  behavior already covers this if the task is idempotent, so a second
  sweeping mechanism would be redundant infrastructure); processing
  inline in the request that accepts the upload (rejected — spec FR-007
  explicitly requires a background job, not inline processing, so the
  upload response stays fast and the UI can show "queued" immediately).

## Verifying a feature that can't run end-to-end yet

- **Decision**: split `quickstart.md`'s scenarios into what can be
  verified now (pure logic: status-transition rules, upload-validation
  rules, `npm run typecheck`, SQL migration file syntax) versus what
  requires real Supabase/Trigger.dev credentials (actual sign-up, actual
  file upload, actual background job execution) — the latter are written
  as ready-to-run instructions the product owner executes once accounts
  exist, not skipped or faked.
- **Rationale**: per the confirmed 2026-09-01 decision, building
  "completely and correctly against documented interfaces" without live
  credentials is the explicit scope — pretending to verify what can't
  actually run (e.g. a mocked Supabase client standing in for the real
  one in an "integration test") would produce false confidence and
  contradicts Constitution Principle IV's spirit of not treating a
  plausible-looking check as equivalent to real verification.
- **Alternatives considered**: building a full local mock of Supabase Auth
  /Storage/Postgres to fake end-to-end verification now (rejected — a
  mock diverges from real RLS/Storage/Auth behavior in ways that
  routinely hide real bugs, and would be thrown away once real
  credentials exist; not worth building for a one-time gap); blocking all
  work until credentials are provisioned (rejected — the schema, RLS
  policies, and application code can be fully designed, written, and
  logic-tested without live credentials, so waiting would waste the time
  between now and when the product owner provisions the accounts).

## Environment variable contract

- **Decision**: `.env.local.example` lists `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only,
  never exposed to the client), and `TRIGGER_SECRET_KEY`, each with a
  comment explaining where to find it in the respective service's
  dashboard once an account exists — no placeholder or example values
  that could be mistaken for real ones.
- **Rationale**: matches this repo's existing `.env.example` convention
  (already present, currently a placeholder) and Constitution's "no
  hardcoded secret" constraint; documents the exact provisioning steps
  the product owner needs once ready to connect real services.
- **Alternatives considered**: leaving env var names undocumented until
  credentials exist (rejected — the code needs to reference specific env
  var names now, so documenting them now costs nothing and saves
  rediscovery later).
