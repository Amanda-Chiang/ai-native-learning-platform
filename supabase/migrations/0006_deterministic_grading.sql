-- specs/007-deterministic-grading/data-model.md
--
-- assessment_attempts -- a self-contained snapshot of what was graded
-- (question config, response, grading result), not a foreign key into
-- a question-bank table (research.md "a lightweight snapshot, not a
-- question-bank FK" -- assessment-generation-pipeline, which will own
-- a real question bank, doesn't exist yet). Also attaches the FK
-- evidence_events.assessment_attempt_id -> assessment_attempts.id that
-- 0004_learner_evidence.sql left deliberately unconstrained.
--
-- RLS keyed on user_id = auth.uid(), matching learner-graph-evidence/
-- tutor-agent's precedent (this is student-owned data).

create table if not exists public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  response_modality text not null
    check (response_modality in ('structured', 'code', 'text')),
  question_snapshot jsonb not null,
  response jsonb not null,
  grading_result jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists assessment_attempts_user_id_idx on public.assessment_attempts (user_id);
create index if not exists assessment_attempts_course_id_idx on public.assessment_attempts (course_id);

alter table public.assessment_attempts enable row level security;

create policy "assessment_attempts_select_own" on public.assessment_attempts
  for select
  using (user_id = auth.uid());

create policy "assessment_attempts_insert_own" on public.assessment_attempts
  for insert
  with check (user_id = auth.uid());

-- No update/delete policy -- an attempt is a historical record of what
-- happened, append-only, same convention as evidence_events.

-- ============================================================
-- Backfill the FK learner-graph-evidence deliberately left unconstrained
-- ============================================================

alter table public.evidence_events
  add constraint evidence_events_assessment_attempt_id_fkey
  foreign key (assessment_attempt_id) references public.assessment_attempts (id);
