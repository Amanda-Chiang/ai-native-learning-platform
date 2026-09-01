-- specs/005-learner-graph-evidence/data-model.md
--
-- evidence_events (append-only, persisted EvidenceEvent), plus
-- learner_concept_state/learner_edge_state -- rebuildable caches of
-- computeLearnerState's output (research.md "recompute from the full
-- evidence log, never patch a running score"), not a second source of
-- truth.
--
-- Unlike every prior migration (0001-0003), RLS here is keyed on
-- user_id = auth.uid(), not owner_id -- this data is about who the
-- evidence describes (the student), not who created the course
-- (research.md "Evidence belongs to the student, not the course owner").

-- ============================================================
-- evidence_events
-- ============================================================

create table if not exists public.evidence_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  concept_ids uuid[] not null default '{}',
  edge_ids uuid[] not null default '{}',
  evidence_type text not null
    check (evidence_type in (
      'exposure', 'retrieval', 'explanation', 'application', 'transfer',
      'relationship_explanation', 'misconception',
      'annotation_confusion_signal', 'instructor_feedback'
    )),
  correctness boolean,
  grader_confidence numeric not null check (grader_confidence >= 0 and grader_confidence <= 1),
  assistance_level numeric not null check (assistance_level >= 0 and assistance_level <= 6),
  difficulty numeric not null,
  transfer_distance numeric not null,
  student_confidence numeric,
  source_artifact_id uuid references public.artifacts (id),
  -- No assessment_attempts/conversation_turns table exists yet (future
  -- phase) -- left as bare uuid columns, not FKs, until those tables
  -- exist (data-model.md).
  assessment_attempt_id uuid,
  conversation_turn_id uuid,
  created_at timestamptz not null default now(),
  -- Mirrors isEvidenceEvent's existing "at least one target" rule.
  check (array_length(concept_ids, 1) is not null or array_length(edge_ids, 1) is not null),
  -- Mirrors isEvidenceEvent's existing "has an origin" rule.
  check (
    source_artifact_id is not null
    or assessment_attempt_id is not null
    or conversation_turn_id is not null
  )
);

create index if not exists evidence_events_user_id_idx on public.evidence_events (user_id);
create index if not exists evidence_events_course_id_idx on public.evidence_events (course_id);
create index if not exists evidence_events_concept_ids_idx on public.evidence_events using gin (concept_ids);
create index if not exists evidence_events_edge_ids_idx on public.evidence_events using gin (edge_ids);

alter table public.evidence_events enable row level security;

create policy "evidence_events_select_own" on public.evidence_events
  for select
  using (user_id = auth.uid());

create policy "evidence_events_insert_own" on public.evidence_events
  for insert
  with check (user_id = auth.uid());

-- No update/delete policy anywhere, and no application code path calls
-- .update()/.delete() on this table -- append-only by construction
-- (FR-002, data-model.md).

-- ============================================================
-- learner_concept_state
-- ============================================================

create table if not exists public.learner_concept_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  concept_id uuid not null references public.course_concepts (id) on delete cascade,
  mastery_state text not null
    check (mastery_state in ('unverified', 'exposed', 'weak', 'solid')),
  score numeric not null,
  has_unresolved_misconception boolean not null default false,
  contributing_factors jsonb not null,
  last_evidence_at timestamptz not null,
  updated_at timestamptz not null default now(),
  unique (user_id, course_id, concept_id)
);

create index if not exists learner_concept_state_user_id_idx on public.learner_concept_state (user_id);
create index if not exists learner_concept_state_course_id_idx on public.learner_concept_state (course_id);
create index if not exists learner_concept_state_concept_id_idx on public.learner_concept_state (concept_id);

alter table public.learner_concept_state enable row level security;

create policy "learner_concept_state_select_own" on public.learner_concept_state
  for select
  using (user_id = auth.uid());

-- Written by the student's own server-action request, not a service-role
-- background job (research.md "No background job needed").
create policy "learner_concept_state_insert_own" on public.learner_concept_state
  for insert
  with check (user_id = auth.uid());

create policy "learner_concept_state_update_own" on public.learner_concept_state
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- learner_edge_state
-- ============================================================

create table if not exists public.learner_edge_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  edge_id uuid not null references public.concept_edges (id) on delete cascade,
  learner_state text not null
    check (learner_state in ('weak', 'strong')),
  score numeric not null,
  has_unresolved_misconception boolean not null default false,
  contributing_factors jsonb not null,
  last_evidence_at timestamptz not null,
  updated_at timestamptz not null default now(),
  unique (user_id, course_id, edge_id)
);

create index if not exists learner_edge_state_user_id_idx on public.learner_edge_state (user_id);
create index if not exists learner_edge_state_course_id_idx on public.learner_edge_state (course_id);
create index if not exists learner_edge_state_edge_id_idx on public.learner_edge_state (edge_id);

alter table public.learner_edge_state enable row level security;

create policy "learner_edge_state_select_own" on public.learner_edge_state
  for select
  using (user_id = auth.uid());

create policy "learner_edge_state_insert_own" on public.learner_edge_state
  for insert
  with check (user_id = auth.uid());

create policy "learner_edge_state_update_own" on public.learner_edge_state
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
