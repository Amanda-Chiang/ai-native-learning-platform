-- supabase/migrations/0014_reconciliation_decision_candidate_id.sql
--
-- Correlates a reconciliation_decisions row with the specific candidate
-- row it produced.
--
-- Before this, getReviewQueue matched a decision to a card by extraction
-- run + candidate_kind only, i.e. `.find()` -- the FIRST non-merge
-- decision of the run was shown on EVERY candidate of that kind from that
-- run. Two units proposed in one run displayed the same reasoning text,
-- one of them about the other unit, and the "distinct"-only duplicate
-- mitigation (otherExistingUnitTitles) could be withheld from the very
-- candidate it was designed for. Showing candidate A's model-authored
-- reasoning on candidate B's card is exactly the plausible-looking
-- stand-in CLAUDE.md's no-silent-placeholders rule forbids.
--
-- Shape: polymorphic id paired with the existing candidate_kind column,
-- the same pattern concept_flags (target_kind, target_id) already uses in
-- 0003 -- no single FK is possible across course_concepts/course_units,
-- and validity is maintained at the application layer (the extraction
-- task is the only writer).
--
-- Nullable, deliberately, with two distinct meanings, both honest:
--   * decision = 'merge'  -> no new candidate row was produced at all;
--     the row it merged onto is identified by matched_concept_id /
--     matched_unit_id.
--   * rows written before this migration -> never captured. The review
--     queue renders no reconciliation text for those rather than
--     guessing at one.

-- Guarded rather than bare add column: same `if not exists` house style
-- 0013 established (M2) for exactly this class of re-run/dashboard-drift
-- hazard.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reconciliation_decisions'
      and column_name = 'candidate_id'
  ) then
    alter table public.reconciliation_decisions add column candidate_id uuid;
  end if;
end $$;

create index if not exists reconciliation_decisions_candidate_id_idx
  on public.reconciliation_decisions (candidate_id);
