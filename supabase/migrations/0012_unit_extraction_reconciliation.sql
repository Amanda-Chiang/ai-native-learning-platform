-- supabase/migrations/0012_unit_extraction_reconciliation.sql
--
-- docs/superpowers/specs/2026-09-05-unit-extraction-reconciliation-design.md
--
-- Lets units be extracted automatically (mirroring course_concepts'
-- proposed/confirmed/archived lifecycle) instead of requiring one to
-- already exist by hand before extraction can run at all. Adds an
-- optional per-artifact unit target (hard rule, not a hint) and
-- extends reconciliation_decisions to cover unit candidates.

-- ============================================================
-- course_units: add review lifecycle + provenance
-- ============================================================

alter table public.course_units
  add column status text
    check (status in ('proposed', 'confirmed', 'archived'));

-- Backfill: every pre-existing unit was owner-authored under the old
-- (pre-this-migration) model, so it's authoritative already.
update public.course_units set status = 'confirmed' where status is null;

alter table public.course_units
  alter column status set not null;

alter table public.course_units
  add column extraction_run_id uuid references public.extraction_runs (id);

create index if not exists course_units_status_idx on public.course_units (status);

-- Service-role (the Trigger.dev extraction task) now also inserts
-- 'proposed' units, same bypass-RLS-by-design pattern
-- course_concepts/concept_edges inserts already use -- no new RLS
-- policy needed for that (service-role bypasses RLS entirely). The
-- owner-session insert policy (course_units_insert_own, from
-- 0003_course_ontology.sql) is unchanged: a manually-created unit
-- still inserts as 'confirmed' through the owner's own session.

-- ============================================================
-- artifacts: optional per-upload unit target (hard rule at
-- extraction time, not a hint)
-- ============================================================

alter table public.artifacts
  add column target_unit_id uuid references public.course_units (id);

-- ============================================================
-- reconciliation_decisions: cover unit candidates too
-- ============================================================

alter table public.reconciliation_decisions
  drop constraint if exists reconciliation_decisions_candidate_kind_check;

alter table public.reconciliation_decisions
  add constraint reconciliation_decisions_candidate_kind_check
  check (candidate_kind in ('concept', 'edge', 'unit'));

-- Separate nullable column from matched_concept_id rather than
-- reusing it for a unit id -- keeps the existing column's meaning
-- unchanged for every existing concept-reconciliation row/consumer.
alter table public.reconciliation_decisions
  add column matched_unit_id uuid references public.course_units (id);

alter table public.reconciliation_decisions
  drop constraint if exists reconciliation_decisions_check;

alter table public.reconciliation_decisions
  add constraint reconciliation_decisions_check
  check (
    (decision = 'merge' and (matched_concept_id is not null or matched_unit_id is not null))
    or (decision <> 'merge')
  );
