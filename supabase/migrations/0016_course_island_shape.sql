-- supabase/migrations/0016_course_island_shape.sql
--
-- Adds the per-course island shape index behind the Phase 3 Home
-- dashboard. See
-- docs/superpowers/specs/2026-09-28-orca-phase3-home-dashboard-design.md
--
-- Why a stored column rather than hash(course.id) % library_size:
-- a pure hash re-points every existing course the moment the shape
-- library grows (adding shape #9 would reshuffle every mod-8
-- assignment). The index is assigned ONCE at course creation from the
-- library size at that moment, and never recomputed, so a course keeps
-- its island forever. The library in island-shapes.ts is append-only
-- for the same reason.
--
-- NOT NULL with no default: the application assigns the index on
-- insert. A default here would silently hand every future course the
-- same island if the application code were ever changed to stop
-- assigning one.

alter table public.courses
  add column island_shape_index int;

-- Backfill existing rows. Spread them across the 8 placeholder shapes
-- deterministically by creation order, so existing courses get varied
-- islands rather than all sharing one.
update public.courses c
set island_shape_index = sub.ordinal % 8
from (
  select id, (row_number() over (order by created_at)) - 1 as ordinal
  from public.courses
) as sub
where c.id = sub.id;

alter table public.courses
  alter column island_shape_index set not null;

alter table public.courses
  add constraint courses_island_shape_index_non_negative
  check (island_shape_index >= 0);
