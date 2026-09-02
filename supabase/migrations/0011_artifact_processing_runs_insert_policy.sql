-- Found live (a real first-ever authenticated upload through the real
-- UI): 0001_courses_artifacts.sql's own comment claimed "INSERT/UPDATE
-- are performed only by the Trigger.dev task's service-role client --
-- no student-facing write policy", but that was never actually true --
-- trigger/ingest-artifact.ts requires its processingRunId to already
-- exist (it fetches the row and fails if missing, by design, for its
-- own idempotency guard), so the calling action
-- (features/artifacts/actions.ts's uploadArtifact) has always had to
-- create that initial "queued" row itself, as the real signed-in
-- student -- RLS blocked every real attempt at this, invisibly, since
-- everything else touching this table in this project's own testing
-- used the service-role client directly.
--
-- UPDATE still stays service-role only (the Trigger.dev task is what
-- transitions status queued -> processing -> ready/failed) -- only
-- INSERT of the initial row is a real, needed student-facing write.

create policy "artifact_processing_runs_insert_own" on public.artifact_processing_runs
  for insert
  with check (owner_id = auth.uid());
