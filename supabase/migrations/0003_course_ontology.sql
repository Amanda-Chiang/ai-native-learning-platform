-- specs/004-course-graph-ingestion/data-model.md
--
-- Canonical course ontology (course_units, course_concepts, concept_edges),
-- extraction/reconciliation provenance (extraction_runs,
-- reconciliation_decisions), and student feedback (concept_flags).
--
-- RLS follows the exact pattern established in 0001/0002: owner_id
-- denormalized onto every table so policies never need a join;
-- owner_id = auth.uid() for reads; writes to extraction-produced tables
-- are service-role only (the Trigger.dev task), matching
-- artifact_processing_runs' write pattern.

-- ============================================================
-- course_units
-- ============================================================
-- Did not exist before this feature -- CourseConcept.unitId and
-- CourseGraph.Unit both already assumed units were real, addressable
-- entities (research.md "New course_units table").

create table if not exists public.course_units (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now()
);

create index if not exists course_units_course_id_idx on public.course_units (course_id);
create index if not exists course_units_owner_id_idx on public.course_units (owner_id);

alter table public.course_units enable row level security;

create policy "course_units_select_own" on public.course_units
  for select
  using (owner_id = auth.uid());

-- Units are directly authorable/renameable by the course owner (unlike
-- concepts/edges, which go through the proposed/confirmed review flow) --
-- data-model.md.
create policy "course_units_insert_own" on public.course_units
  for insert
  with check (owner_id = auth.uid());

create policy "course_units_update_own" on public.course_units
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ============================================================
-- course_concepts
-- ============================================================
-- Persisted form of CourseConcept (src/types/domain/concept.ts).

create table if not exists public.course_concepts (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  unit_id uuid not null references public.course_units (id),
  canonical_name text not null,
  aliases text[] not null default '{}',
  description text not null,
  importance_score numeric not null
    check (importance_score >= 0 and importance_score <= 1),
  -- Non-empty at all times (Constitution Principle V / FR-008), enforced
  -- here so a bug elsewhere in application code can't silently insert an
  -- unanchored claim -- not only checked in TypeScript.
  source_anchors jsonb not null
    check (jsonb_array_length(source_anchors) >= 1),
  status text not null
    check (status in ('proposed', 'confirmed', 'archived')),
  confidence numeric not null
    check (confidence >= 0 and confidence <= 1),
  extraction_run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Mirrors isCourseConcept's existing runtime check: aliases must not
  -- contain the canonical name itself.
  check (not (canonical_name = any (aliases)))
);

create index if not exists course_concepts_course_id_idx on public.course_concepts (course_id);
create index if not exists course_concepts_owner_id_idx on public.course_concepts (owner_id);
create index if not exists course_concepts_unit_id_idx on public.course_concepts (unit_id);
create index if not exists course_concepts_status_idx on public.course_concepts (status);

alter table public.course_concepts enable row level security;

create policy "course_concepts_select_own" on public.course_concepts
  for select
  using (owner_id = auth.uid());

-- The extraction task's initial "proposed" writes use the service-role
-- client (bypasses RLS). Confirm/edit/reject (US3) run as the
-- authenticated course owner's own session -- owner_id = auth.uid()
-- already covers that, so the same policy serves both the reviewer's
-- own updates and no separate service-role-only path is needed for
-- those specific actions.
create policy "course_concepts_update_own" on public.course_concepts
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- No student-facing insert policy: only the service-role extraction task
-- inserts a course_concepts row (bypasses RLS by design).

-- ============================================================
-- concept_edges
-- ============================================================
-- Persisted form of ConceptEdge (src/types/domain/concept-edge.ts).

create table if not exists public.concept_edges (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  source_concept_id uuid not null references public.course_concepts (id),
  target_concept_id uuid not null references public.course_concepts (id),
  relation_type text not null
    check (relation_type in (
      'prerequisite_for', 'part_of', 'mechanism_for', 'contrasts_with',
      'used_in', 'generalizes_to', 'example_of', 'other'
    )),
  relation_type_note text,
  explanation text not null,
  source_anchors jsonb not null
    check (jsonb_array_length(source_anchors) >= 1),
  status text not null
    check (status in ('proposed', 'confirmed', 'archived')),
  confidence numeric not null
    check (confidence >= 0 and confidence <= 1),
  extraction_run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- FR-011: database-level enforcement, redundant by design with the
  -- application-level check in the reconciliation step (research.md) --
  -- a hard invariant gets both, not a single point of failure.
  check (source_concept_id <> target_concept_id),
  -- Mirrors isConceptEdge's existing runtime rule: relation_type_note is
  -- required when relation_type = 'other' and forbidden otherwise.
  check (
    (relation_type = 'other' and relation_type_note is not null)
    or (relation_type <> 'other' and relation_type_note is null)
  )
);

-- Multiple edges between the same (source, target) pair are valid and
-- expected (multigraph -- matches ConceptEdge's own doc comment and
-- concept-atlas-renderer's duplicate-edge handling); no uniqueness
-- constraint on that pair.
create index if not exists concept_edges_course_id_idx on public.concept_edges (course_id);
create index if not exists concept_edges_owner_id_idx on public.concept_edges (owner_id);
create index if not exists concept_edges_source_concept_id_idx on public.concept_edges (source_concept_id);
create index if not exists concept_edges_target_concept_id_idx on public.concept_edges (target_concept_id);
create index if not exists concept_edges_status_idx on public.concept_edges (status);

alter table public.concept_edges enable row level security;

create policy "concept_edges_select_own" on public.concept_edges
  for select
  using (owner_id = auth.uid());

create policy "concept_edges_update_own" on public.concept_edges
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ============================================================
-- extraction_runs
-- ============================================================
-- One row per attempt to extract from one artifact.

create table if not exists public.extraction_runs (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  artifact_id uuid not null references public.artifacts (id) on delete cascade,
  -- Deliberately its own enum, not reusing artifacts.status
  -- ('queued','processing','ready','failed'): 'completed' here means
  -- "extraction finished producing candidates," a different claim than
  -- the artifact being 'ready' (readable/valid) -- research.md.
  status text not null
    check (status in ('queued', 'processing', 'completed', 'failed')),
  failure_reason text,
  concepts_extracted integer not null default 0,
  edges_extracted integer not null default 0,
  edges_dropped_self_referential integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists extraction_runs_course_id_idx on public.extraction_runs (course_id);
create index if not exists extraction_runs_owner_id_idx on public.extraction_runs (owner_id);
create index if not exists extraction_runs_artifact_id_idx on public.extraction_runs (artifact_id);

alter table public.extraction_runs enable row level security;

create policy "extraction_runs_select_own" on public.extraction_runs
  for select
  using (owner_id = auth.uid());

-- INSERT/UPDATE are performed only by the Trigger.dev task's
-- service-role client, same as artifact_processing_runs.

-- Now that course_concepts/concept_edges exist, attach the FK
-- extraction_runs references were deferred until this table existed.
alter table public.course_concepts
  add constraint course_concepts_extraction_run_id_fkey
  foreign key (extraction_run_id) references public.extraction_runs (id);

alter table public.concept_edges
  add constraint concept_edges_extraction_run_id_fkey
  foreign key (extraction_run_id) references public.extraction_runs (id);

-- ============================================================
-- reconciliation_decisions
-- ============================================================
-- One row per candidate concept/edge reconciliation classification
-- (research.md's three-way merge/distinct/uncertain outcome).

create table if not exists public.reconciliation_decisions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  extraction_run_id uuid not null references public.extraction_runs (id) on delete cascade,
  candidate_kind text not null
    check (candidate_kind in ('concept', 'edge')),
  decision text not null
    check (decision in ('merge', 'distinct', 'uncertain')),
  matched_concept_id uuid references public.course_concepts (id),
  -- The model's own stated rationale, kept verbatim for auditability --
  -- never a generic placeholder like "auto-decided".
  reasoning text not null,
  created_at timestamptz not null default now(),
  check (
    (decision = 'merge' and matched_concept_id is not null)
    or (decision <> 'merge')
  )
);

create index if not exists reconciliation_decisions_course_id_idx on public.reconciliation_decisions (course_id);
create index if not exists reconciliation_decisions_owner_id_idx on public.reconciliation_decisions (owner_id);
create index if not exists reconciliation_decisions_extraction_run_id_idx on public.reconciliation_decisions (extraction_run_id);

alter table public.reconciliation_decisions enable row level security;

create policy "reconciliation_decisions_select_own" on public.reconciliation_decisions
  for select
  using (owner_id = auth.uid());

-- INSERT is service-role only (the Trigger.dev task); no update/delete --
-- a reconciliation decision is a historical record of what happened, not
-- an editable one.

-- ============================================================
-- concept_flags
-- ============================================================
-- A student's reported concern about a specific concept or relationship
-- (spec.md's "Student Flag"). Feedback evidence only -- never mutates
-- course_concepts/concept_edges (FR-010).

create table if not exists public.concept_flags (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  target_kind text not null
    check (target_kind in ('concept', 'edge')),
  -- References course_concepts.id or concept_edges.id depending on
  -- target_kind -- no single FK possible across two tables; validity is
  -- checked at the application layer in actions.ts (data-model.md).
  target_id uuid not null,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (length(trim(reason)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists concept_flags_course_id_idx on public.concept_flags (course_id);
create index if not exists concept_flags_target_id_idx on public.concept_flags (target_id);
create index if not exists concept_flags_reporter_id_idx on public.concept_flags (reporter_id);

alter table public.concept_flags enable row level security;

-- A signed-in user can only flag as themselves.
create policy "concept_flags_insert_own" on public.concept_flags
  for insert
  with check (reporter_id = auth.uid());

-- The reviewer (course owner) sees flags on their own course's content.
create policy "concept_flags_select_course_owner" on public.concept_flags
  for select
  using (
    exists (
      select 1 from public.courses
      where courses.id = concept_flags.course_id
        and courses.owner_id = auth.uid()
    )
  );

-- No update/delete policy -- a flag is never editable/deletable by
-- anyone at the application layer in this feature (matches
-- courses/artifacts' existing "not editable yet" pattern).
