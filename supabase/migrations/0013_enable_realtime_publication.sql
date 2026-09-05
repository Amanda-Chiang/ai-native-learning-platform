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

alter publication supabase_realtime add table public.artifacts;
alter publication supabase_realtime add table public.extraction_runs;
