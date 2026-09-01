-- specs/002-account-course-artifact-foundation/data-model.md
--
-- Schema and row-level security for courses, artifacts, and artifact
-- processing runs. Accounts themselves are Supabase Auth's built-in
-- auth.users table -- no user table is defined here.
--
-- RLS is the enforcement mechanism for per-user data isolation (spec
-- FR-002), not application-layer filtering alone -- see research.md's
-- "Per-user isolation: Postgres RLS policies, not app-layer filtering".

create extension if not exists pgcrypto;

-- ============================================================
-- courses
-- ============================================================

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index if not exists courses_owner_id_idx on public.courses (owner_id);

alter table public.courses enable row level security;

create policy "courses_select_own" on public.courses
  for select
  using (owner_id = auth.uid());

create policy "courses_insert_own" on public.courses
  for insert
  with check (owner_id = auth.uid());

-- No update/delete policy in this phase (spec Assumptions: courses are
-- not editable/deletable yet) -- RLS default-denies both.

-- ============================================================
-- artifacts
-- ============================================================

create table if not exists public.artifacts (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  -- Denormalized from the parent course so RLS policies here don't need
  -- a join (data-model.md).
  owner_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists artifacts_course_id_idx on public.artifacts (course_id);
create index if not exists artifacts_owner_id_idx on public.artifacts (owner_id);

alter table public.artifacts enable row level security;

create policy "artifacts_select_own" on public.artifacts
  for select
  using (owner_id = auth.uid());

create policy "artifacts_insert_own" on public.artifacts
  for insert
  with check (owner_id = auth.uid());

-- Students never directly set an artifact's status -- only the
-- Trigger.dev task's service-role client updates status/updated_at
-- (service-role bypasses RLS by design, so no student-facing UPDATE
-- policy is created here).

-- ============================================================
-- artifact_processing_runs
-- ============================================================

create table if not exists public.artifact_processing_runs (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references public.artifacts (id) on delete cascade,
  -- Denormalized, same reasoning as artifacts.owner_id.
  owner_id uuid not null references auth.users (id) on delete cascade,
  status text not null
    check (status in ('queued', 'processing', 'ready', 'failed')),
  failure_reason text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists artifact_processing_runs_artifact_id_idx
  on public.artifact_processing_runs (artifact_id);
create index if not exists artifact_processing_runs_owner_id_idx
  on public.artifact_processing_runs (owner_id);

alter table public.artifact_processing_runs enable row level security;

create policy "artifact_processing_runs_select_own" on public.artifact_processing_runs
  for select
  using (owner_id = auth.uid());

-- INSERT/UPDATE are performed only by the Trigger.dev task's
-- service-role client (bypasses RLS) -- no student-facing write policy.

-- ============================================================
-- Storage: course-artifacts bucket
-- ============================================================
-- Private bucket for uploaded files (research.md: client uploads
-- directly to Storage, server only records the metadata row). Objects
-- are stored under `${owner_id}/${artifact_id}/${original_filename}`,
-- which is what the RLS policies below key off of.

insert into storage.buckets (id, name, public)
values ('course-artifacts', 'course-artifacts', false)
on conflict (id) do nothing;

create policy "course_artifacts_select_own" on storage.objects
  for select
  using (
    bucket_id = 'course-artifacts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "course_artifacts_insert_own" on storage.objects
  for insert
  with check (
    bucket_id = 'course-artifacts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
