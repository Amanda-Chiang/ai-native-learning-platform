-- specs/003-concept-atlas-renderer/data-model.md
--
-- Per-student layout preference (expand/collapse state, moved
-- positions) for the concept atlas. View state only -- never semantic
-- graph data. New table within the already-approved Postgres store, not
-- a new persistence layer (see brain/decisions/architecture-log.md).

create table if not exists public.graph_layouts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  entity_id text not null,
  entity_type text not null check (entity_type in ('unit', 'concept')),
  collapsed boolean,
  x double precision,
  y double precision,
  updated_at timestamptz not null default now(),
  unique (owner_id, course_id, entity_id)
);

create index if not exists graph_layouts_owner_course_idx
  on public.graph_layouts (owner_id, course_id);

alter table public.graph_layouts enable row level security;

-- Unlike Phase 1's artifact tables, a student's own layout preference is
-- exactly the kind of thing they should be able to write directly --
-- it's personal view state, not semantic graph data or a system-derived
-- status. Full SELECT/INSERT/UPDATE for the owner.

create policy "graph_layouts_select_own" on public.graph_layouts
  for select
  using (owner_id = auth.uid());

create policy "graph_layouts_insert_own" on public.graph_layouts
  for insert
  with check (owner_id = auth.uid());

create policy "graph_layouts_update_own" on public.graph_layouts
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
