-- supabase/migrations/0015_lightweight_daily_quiz.sql
--
-- Adds a lightweight, auto-generated multiple-choice quiz path,
-- additive to the existing (still UI-unwired) heavy
-- assessment-generation-pipeline. See
-- docs/superpowers/specs/2026-09-12-lightweight-daily-quiz-design.md
-- for the full design and why each piece is shaped this way.

-- 'multiple_choice' joins the existing response_modality enum on
-- question_bank. Dynamic constraint lookup/drop (not a hardcoded
-- constraint name) because the original check was declared inline at
-- table-creation time in 0007 and Postgres auto-names it -- this way
-- the migration doesn't depend on guessing that name right.
do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'public.question_bank'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%response_modality%'
  loop
    execute format('alter table public.question_bank drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.question_bank
  add constraint question_bank_response_modality_check
  check (response_modality in ('text', 'code', 'graph', 'tree', 'diagram', 'multiple_choice'));

-- Every question must be tagged to at least one real concept (no
-- unanchored claim, same invariant course_concepts.source_anchors
-- already enforces) -- this is also what the reject-cascade (a
-- concept's rejection deletes any question left with zero
-- non-archived tagged concepts) queries against. Nullable default so
-- the ALTER succeeds against any pre-existing row, though in practice
-- every real course has zero question_bank rows today.
alter table public.question_bank
  add column if not exists target_concept_ids uuid[] not null default '{}';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.question_bank'::regclass
      and conname = 'question_bank_target_concept_ids_not_empty'
  ) then
    alter table public.question_bank
      add constraint question_bank_target_concept_ids_not_empty
      check (array_length(target_concept_ids, 1) is not null);
  end if;
end $$;

create index if not exists question_bank_target_concept_ids_idx
  on public.question_bank using gin (target_concept_ids);

-- A lightweight-quiz row has no assessment_generation_runs row (that
-- table's shape -- a full candidate + 6-layer validation report --
-- doesn't apply to this separate, cheaper generation path).
-- generation_run_id IS NULL is exactly the rows this path produced;
-- no separate "source" column needed to distinguish them.
alter table public.question_bank
  alter column generation_run_id drop not null;

-- Idempotency for the two generation triggers (review-popup dismissed,
-- or every concept/unit from the run has left 'proposed') -- both call
-- sites check this is still null before generating and set it
-- immediately after, so whichever fires first wins and the other is a
-- no-op.
alter table public.extraction_runs
  add column if not exists quiz_generated_at timestamptz;

-- question_bank previously had no delete policy for authenticated users
-- at all (0007's own comment: "only the service-role Trigger.dev task
-- writes this table") -- correct at the time, since nothing ever
-- deleted from it. This feature is the first real case of a course
-- owner needing to: the reject-cascade (rejectCandidate's concept
-- branch) deletes a question the instant every concept it's tagged to
-- has been archived, since that question never had independent
-- standing -- it was only ever a claim about now-rejected concepts.
-- Same owner_id = auth.uid() scoping every other owner-scoped delete/
-- update policy in this project already uses.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'question_bank'
      and policyname = 'question_bank_delete_own'
  ) then
    create policy "question_bank_delete_own" on public.question_bank
      for delete
      using (owner_id = auth.uid());
  end if;
end $$;
