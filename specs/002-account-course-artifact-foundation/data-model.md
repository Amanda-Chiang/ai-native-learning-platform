# Phase 1 Data Model: Account, Course & Artifact Foundation

Source of truth for `supabase/migrations/0001_courses_artifacts.sql` and
`src/lib/supabase/database.types.ts`. Accounts themselves are managed
entirely by Supabase Auth's built-in `auth.users` table — this feature
does not define its own user table, only references `auth.uid()`.

## courses

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid`, PK | `default gen_random_uuid()` |
| `owner_id` | `uuid`, not null | `references auth.users(id)` |
| `name` | `text`, not null | |
| `created_at` | `timestamptz`, not null | `default now()` |

**RLS**: enabled. Policies scope every operation to
`owner_id = auth.uid()` — a student can `SELECT`/`INSERT` only rows they
own; no `UPDATE`/`DELETE` policy is created in this phase (spec
Assumptions: courses aren't editable/deletable yet), so those operations
are implicitly denied by RLS's default-deny.

## artifacts

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid`, PK | `default gen_random_uuid()` |
| `course_id` | `uuid`, not null | `references courses(id) on delete cascade` |
| `owner_id` | `uuid`, not null | `references auth.users(id)` — denormalized from the parent course so RLS policies here don't need a join, per research.md |
| `storage_path` | `text`, not null | Path within the Supabase Storage bucket |
| `original_filename` | `text`, not null | |
| `mime_type` | `text`, not null | |
| `size_bytes` | `bigint`, not null | |
| `status` | `text`, not null | `check (status in ('queued','processing','ready','failed'))`, `default 'queued'` — mirrors the latest `artifact_processing_runs` row for this artifact, updated in the same transaction |
| `created_at` | `timestamptz`, not null | `default now()` |
| `updated_at` | `timestamptz`, not null | `default now()`, bumped whenever `status` changes |

**RLS**: enabled, same `owner_id = auth.uid()` pattern.
`INSERT`/`SELECT`/`UPDATE` policies exist (`UPDATE` restricted to the
`status`/`updated_at` columns being writable by the Trigger.dev task's
service-role client, not by the student's own client — students never
directly set an artifact's status).

**Validation rules** (enforced in `features/artifacts/status.ts` before
any row is written, per spec FR-005): `mime_type` must be one of the
PRD §11.1 MVP types (PDF, common image types for handwritten-note
screenshots); `size_bytes` must be under the configured max (not yet
load-tested — start at 25MB per PRD's "normal lecture PDF" framing in
§6.2, revisit once real usage data exists).

## artifact_processing_runs

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid`, PK | `default gen_random_uuid()` |
| `artifact_id` | `uuid`, not null | `references artifacts(id) on delete cascade` |
| `owner_id` | `uuid`, not null | denormalized, same reasoning as `artifacts.owner_id` |
| `status` | `text`, not null | `check (status in ('queued','processing','ready','failed'))` |
| `failure_reason` | `text`, nullable | Human-readable reason, set only when `status = 'failed'` (spec FR-009) |
| `started_at` | `timestamptz`, nullable | Set when the Trigger.dev task begins |
| `completed_at` | `timestamptz`, nullable | Set when the run reaches a terminal status |
| `created_at` | `timestamptz`, not null | `default now()` |

**RLS**: enabled, `owner_id = auth.uid()`, `SELECT` only for the student's
own client — `INSERT`/`UPDATE` are performed only by the Trigger.dev
task's service-role client (which bypasses RLS by design, since it acts
on behalf of the system, not as the student).

**Append-only per artifact**: a retried processing attempt creates a *new*
`artifact_processing_runs` row rather than overwriting the failed one —
the same "immutable record, don't overwrite" pattern `EvidenceEvent` uses
in Phase 0, so a student (or a future debugging session) can see the full
history of what happened to an upload, not just its current state.

## Status state machine

```text
queued ──▶ processing ──▶ ready
                      └──▶ failed
```

- Only `queued → processing` and `processing → {ready, failed}` are valid
  transitions; `ready` and `failed` are terminal for a given
  `artifact_processing_runs` row.
- The parent `artifacts.status` always mirrors its most recent run's
  status, updated in the same transaction as the run.
- A crashed/retried Trigger.dev task (per research.md) re-reads the
  current run's status before proceeding, so a retry that resumes from
  `processing` doesn't create a duplicate `queued` state or silently skip
  updating the artifact.

## Storage: `course-artifacts` bucket

**Added during implementation** (not in the original design pass — surfaced
once the upload form in T021 needed somewhere real to upload to). A
single private Supabase Storage bucket, `course-artifacts`. Objects are
keyed `${owner_id}/${artifact_id}/${original_filename}`, and two RLS
policies on `storage.objects` (Supabase Storage's own RLS-backed access
model, same mechanism as the Postgres tables above) restrict `SELECT`/
`INSERT` to objects whose first path segment matches `auth.uid()`. This
keeps file-level isolation enforced the same way as the row-level
isolation above — one mechanism, not two different security models for
"the file" versus "the record about the file."

## Relationships

```text
auth.users (Supabase-managed) ──(owner_id)── courses ──(course_id)── artifacts ──(artifact_id)── artifact_processing_runs
```

One account owns many courses; one course owns many artifacts; one
artifact owns many processing runs (one per attempt, oldest to newest).
