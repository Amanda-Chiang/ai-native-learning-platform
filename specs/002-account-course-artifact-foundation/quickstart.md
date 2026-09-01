# Quickstart: Account, Course & Artifact Foundation

Per the confirmed 2026-09-01 scope decision, this feature is built
completely against Supabase/Trigger.dev's documented interfaces before
either account exists. That means validation splits into two groups:
scenarios verifiable right now with no live services, and scenarios that
need real credentials — both are real instructions, not placeholders.

## Group A — verifiable now, no external accounts needed

### A1. Schemas and application code typecheck

```bash
nvm use 24
npm run typecheck
```

**Expected outcome**: exits 0. All new server actions, types, and the
Trigger.dev task file typecheck cleanly.

### A2. Artifact status-transition and upload-validation logic

```bash
npm run test:unit
```

**Expected outcome**: passes, including new tests in
`tests/unit/artifacts/status.test.ts` confirming: `queued → processing`
and `processing → {ready, failed}` are accepted; `queued → ready` (skipping
a state) is rejected; a `ready`/`failed` run rejects any further
transition (terminal states stay terminal); an unsupported `mimeType` or
oversized `sizeBytes` is rejected by the upload-validation rule before any
database write would happen.

### A3. Migration SQL is syntactically valid and matches data-model.md

```bash
# Requires the Supabase CLI (`npm install -g supabase` or `brew install supabase/tap/supabase`)
supabase db lint --schema supabase/migrations/0001_courses_artifacts.sql
```

**Expected outcome**: no syntax errors. (This lints the SQL locally — it
does not require a live Supabase project, just the CLI tool.) Manually
cross-check the migration's tables/columns/policies against
`data-model.md`'s tables.

**Status as of this implementation pass**: the Supabase CLI isn't
installed in this environment, and installing a new global CLI tool
wasn't done unprompted for a one-time syntax check (same caution
`brain/decisions/ADR-0001-dev-tooling-selection.md` already applied to
similar tooling). A manual read-through of the migration substituted for
this command — every table, index, and policy matches `data-model.md`,
and the syntax (foreign keys, `using`/`with check` clauses,
`storage.foldername()`) is standard Postgres/Supabase DDL. One note from
that review: `create policy` has no `if not exists` form (unlike the
`create table`/`create index` statements above it in the same file), so
this migration isn't safe to run twice manually — fine under Supabase's
own migration model (each file runs exactly once, tracked in a migration
history table via `supabase db push`), but worth knowing if it's ever
applied by hand via `psql`. Run the real `supabase db lint` command once
the CLI is installed, as a final confirmation.

## Group B — requires a real Supabase project and Trigger.dev account

These are the actual end-to-end proof that the feature works — run them
once accounts exist and `.env.local` is filled in from
`.env.example`.

### B1. Provision the services

1. Create a Supabase project; run
   `supabase link` and `supabase db push` to apply
   `supabase/migrations/0001_courses_artifacts.sql`.
2. Create a Trigger.dev project, then replace the placeholder
   `project: "REPLACE_WITH_REAL_TRIGGER_DEV_PROJECT_REF"` in
   `trigger.config.ts` with the real project ref from the Trigger.dev
   dashboard. Run `npx trigger.dev@latest dev` to register the
   `ingest-artifact` task locally.
3. Copy `.env.example` to `.env.local` and fill in the real
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, and `TRIGGER_SECRET_KEY` values from each
   service's dashboard.

### B2. Account isolation (spec SC-004)

```bash
npm run dev
# In two separate browser profiles (or one normal + one incognito):
#   1. Sign up as student-a@example.com, create a course "Course A"
#   2. Sign up as student-b@example.com, create a course "Course B"
#   3. As student-b, try to navigate directly to student-a's course URL
```

**Expected outcome**: student-b sees a not-found/denied result for
student-a's course — never the course's content, and no way to
distinguish "exists but not yours" from "doesn't exist" (spec Edge Cases).

### B3. Upload and durable processing status (spec SC-002, SC-003 — the feature's actual exit criterion)

```bash
# With the dev server and `trigger.dev dev` both running:
#   1. Sign in, create a course, upload a real PDF
#   2. Watch the artifact's status move: queued -> processing -> ready
#      without reloading the page
#   3. Reload the page — same "ready" status shown
#   4. Stop and restart the Next.js dev server, reload again — status unchanged
```

**Expected outcome**: the status displayed after step 4 is identical to
step 2's final state — proving it was read from Postgres, not held in
server or browser memory.

### B4. Failure path (spec FR-009, Edge Cases)

```bash
# Upload a 0-byte file, or a file with an unsupported extension
```

**Expected outcome**: rejected immediately at upload time with a
readable reason (Group A's A2 already covers this at the unit level;
this confirms the same rule is wired into the real upload flow).
