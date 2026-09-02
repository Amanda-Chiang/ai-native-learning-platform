-- specs/010-exam-planner/data-model.md
--
-- exam_configs -- a student's own exam date + scope. Unlike
-- evidence_events/assessment_attempts (append-only historical
-- records), this is current state a student manages directly -- full
-- CRUD for their own rows, RLS keyed on user_id = auth.uid().
--
-- The staged plan and readiness snapshot are never stored (research.md
-- "Exactly one new table") -- both are computed fresh on every
-- request from this row plus existing evidence/course state.

create table if not exists public.exam_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  exam_date date not null,
  scope_concept_ids uuid[] not null default '{}',
  scope_unit_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Mirrors evidence_events' existing "at least one target" rule.
  check (array_length(scope_concept_ids, 1) is not null or array_length(scope_unit_ids, 1) is not null)
);

create index if not exists exam_configs_user_id_idx on public.exam_configs (user_id);
create index if not exists exam_configs_course_id_idx on public.exam_configs (course_id);

alter table public.exam_configs enable row level security;

create policy "exam_configs_select_own" on public.exam_configs
  for select
  using (user_id = auth.uid());

create policy "exam_configs_insert_own" on public.exam_configs
  for insert
  with check (user_id = auth.uid());

create policy "exam_configs_update_own" on public.exam_configs
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "exam_configs_delete_own" on public.exam_configs
  for delete
  using (user_id = auth.uid());
