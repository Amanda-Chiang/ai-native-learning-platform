-- Found live while verifying the unit-extraction-reconciliation feature's
-- Task 12 (extraction status visibility): `supabase_realtime`'s publication
-- has zero tables in it in the real live project. artifact-board.tsx's own
-- Supabase Realtime subscription (claimed live since account-course-
-- artifact-foundation, FR-011 "updates without manual reload") has
-- therefore never actually delivered a single event -- a pre-existing gap
-- this session's live testing surfaced, not something introduced by this
-- feature. extraction_runs (this feature's own new live-status component)
-- would have had the identical silent-no-op problem.
--
-- No prior migration ever added a table to this publication -- it was
-- never configured at all, in code or otherwise.

-- Guarded rather than bare: `alter publication ... add table` errors with
-- "relation is already member of publication" on a re-run, or on any
-- project where the table was added through the dashboard instead. Same
-- `if not exists` house style every other migration in this repo uses.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'artifacts'
  ) then
    alter publication supabase_realtime add table public.artifacts;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'extraction_runs'
  ) then
    alter publication supabase_realtime add table public.extraction_runs;
  end if;
end $$;
