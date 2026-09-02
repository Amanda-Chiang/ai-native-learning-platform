-- specs/011-visual-assessment-graph-tree/data-model.md
--
-- assessment-drawings -- private Storage bucket for a student's
-- drawn visual-assessment responses, retained for audit (spec.md
-- Assumptions). No new Postgres table -- the drawing's storage path
-- and extracted/confirmed structure live in the existing
-- assessment_attempts.response jsonb column (0006_deterministic_grading.sql).
--
-- Same shape course-artifacts' own bucket already established
-- (0001_courses_artifacts.sql): client uploads directly to Storage,
-- objects stored under ${user_id}/${attempt_id}/drawing.png, RLS keyed
-- off the first path segment.

insert into storage.buckets (id, name, public)
values ('assessment-drawings', 'assessment-drawings', false)
on conflict (id) do nothing;

create policy "assessment_drawings_select_own" on storage.objects
  for select
  using (
    bucket_id = 'assessment-drawings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "assessment_drawings_insert_own" on storage.objects
  for insert
  with check (
    bucket_id = 'assessment-drawings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
