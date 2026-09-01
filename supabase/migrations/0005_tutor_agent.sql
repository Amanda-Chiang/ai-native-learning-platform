-- specs/006-tutor-agent/data-model.md
--
-- tutor_conversations / tutor_conversation_turns / tutor_tool_calls --
-- RLS keyed on user_id = auth.uid(), matching learner-graph-evidence's
-- precedent (this is student-owned conversation data, not course-owner
-- data). Also attaches the FK evidence_events.conversation_turn_id ->
-- tutor_conversation_turns.id that 0004_learner_evidence.sql left
-- deliberately unconstrained ("no conversation-turn table yet").

-- ============================================================
-- tutor_conversations
-- ============================================================

create table if not exists public.tutor_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tutor_conversations_user_id_idx on public.tutor_conversations (user_id);
create index if not exists tutor_conversations_course_id_idx on public.tutor_conversations (course_id);

alter table public.tutor_conversations enable row level security;

create policy "tutor_conversations_select_own" on public.tutor_conversations
  for select
  using (user_id = auth.uid());

create policy "tutor_conversations_insert_own" on public.tutor_conversations
  for insert
  with check (user_id = auth.uid());

-- The only mutation after creation is bumping updated_at when a turn is
-- appended -- no other column is ever changed.
create policy "tutor_conversations_update_own" on public.tutor_conversations
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- tutor_conversation_turns
-- ============================================================
-- Append-only (no update/delete policy or code path), same convention as
-- evidence_events.

create table if not exists public.tutor_conversation_turns (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.tutor_conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('student', 'tutor')),
  content text not null,
  concept_ids uuid[] not null default '{}',
  correct boolean,
  requested_direct_answer boolean not null default false,
  ladder_step_used numeric,
  created_at timestamptz not null default now()
);

create index if not exists tutor_conversation_turns_conversation_id_idx on public.tutor_conversation_turns (conversation_id);
create index if not exists tutor_conversation_turns_user_id_idx on public.tutor_conversation_turns (user_id);

alter table public.tutor_conversation_turns enable row level security;

create policy "tutor_conversation_turns_select_own" on public.tutor_conversation_turns
  for select
  using (user_id = auth.uid());

create policy "tutor_conversation_turns_insert_own" on public.tutor_conversation_turns
  for insert
  with check (user_id = auth.uid());

-- ============================================================
-- tutor_tool_calls
-- ============================================================
-- One row per tool invocation during a tutor turn -- auditability
-- (spec.md Key Entities), append-only.

create table if not exists public.tutor_tool_calls (
  id uuid primary key default gen_random_uuid(),
  turn_id uuid not null references public.tutor_conversation_turns (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  tool_name text not null
    check (tool_name in (
      'search_course_materials', 'get_concept_state', 'get_concept_neighbors',
      'record_exposure', 'record_misconception_candidate'
    )),
  arguments jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists tutor_tool_calls_turn_id_idx on public.tutor_tool_calls (turn_id);
create index if not exists tutor_tool_calls_user_id_idx on public.tutor_tool_calls (user_id);

alter table public.tutor_tool_calls enable row level security;

create policy "tutor_tool_calls_select_own" on public.tutor_tool_calls
  for select
  using (user_id = auth.uid());

create policy "tutor_tool_calls_insert_own" on public.tutor_tool_calls
  for insert
  with check (user_id = auth.uid());

-- ============================================================
-- Backfill the FK learner-graph-evidence deliberately left unconstrained
-- ============================================================

alter table public.evidence_events
  add constraint evidence_events_conversation_turn_id_fkey
  foreign key (conversation_turn_id) references public.tutor_conversation_turns (id);
