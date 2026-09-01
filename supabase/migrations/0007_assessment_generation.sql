-- specs/008-assessment-generation-pipeline/data-model.md
--
-- assessment_generation_runs -- one row per generation ATTEMPT (not per
-- request); a blueprint that regenerates 3 times produces 3 rows
-- sharing the same request_id. Append-only.
--
-- question_bank -- only a fully-validated (passed) attempt is ever
-- persisted here.
--
-- Both RLS-keyed on owner_id = auth.uid(), NOT user_id
-- (research.md "Question bank is course-owned content, not
-- student-owned data" -- deliberately the opposite of
-- learner-graph-evidence/tutor-agent/deterministic-grading's tables,
-- matching course_units/course_concepts/concept_edges/extraction_runs
-- instead). Only the service-role Trigger.dev task writes either
-- table -- no insert/update/delete policy exists for authenticated
-- users, same pattern as extraction_runs/course_concepts's own
-- proposed-candidate writes.

create table if not exists public.assessment_generation_runs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  course_id uuid not null references public.courses (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  attempt_number integer not null check (attempt_number >= 1),
  blueprint jsonb not null,
  candidate jsonb not null,
  validation_report jsonb not null,
  outcome text not null check (outcome in ('passed', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists assessment_generation_runs_owner_id_idx on public.assessment_generation_runs (owner_id);
create index if not exists assessment_generation_runs_request_id_idx on public.assessment_generation_runs (request_id);
create index if not exists assessment_generation_runs_course_id_idx on public.assessment_generation_runs (course_id);

alter table public.assessment_generation_runs enable row level security;

create policy "assessment_generation_runs_select_own" on public.assessment_generation_runs
  for select
  using (owner_id = auth.uid());

-- No insert/update/delete policy for authenticated users -- only the
-- service-role Trigger.dev task writes this table.

create table if not exists public.question_bank (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  generation_run_id uuid not null references public.assessment_generation_runs (id) on delete cascade,
  question_text text not null,
  rubric jsonb not null,
  hints text[] not null default '{}',
  common_mistakes text[] not null default '{}',
  source_anchors jsonb not null check (jsonb_array_length(source_anchors) >= 1),
  response_modality text not null check (response_modality in ('text', 'code', 'graph', 'tree', 'diagram')),
  checker_domain text check (checker_domain in ('bfs-dfs', 'heap', 'tree-traversal', 'tree-insertion', 'topological-sort', 'shortest-path')),
  checker_input jsonb,
  validation_report jsonb not null,
  created_at timestamptz not null default now(),
  constraint question_bank_checker_domain_input_paired
    check ((checker_domain is null) = (checker_input is null))
);

create index if not exists question_bank_owner_id_idx on public.question_bank (owner_id);
create index if not exists question_bank_course_id_idx on public.question_bank (course_id);

alter table public.question_bank enable row level security;

create policy "question_bank_select_own" on public.question_bank
  for select
  using (owner_id = auth.uid());

-- No insert/update/delete policy for authenticated users -- only the
-- service-role Trigger.dev task writes this table, and only for a
-- fully-passed attempt.
