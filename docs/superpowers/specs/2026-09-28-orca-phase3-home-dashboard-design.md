# Orca Phase 3 — Home Dashboard (islands + review rail) Design

**Status:** Approved, ready to plan
**Date:** 2026-09-28
**Parent:** `docs/superpowers/specs/2026-09-27-orca-redesign-design.md` (Phase 3
of its build sequence)
**Predecessor:** `docs/superpowers/specs/2026-09-28-orca-phase2-concepts-chat-design.md`

## Scope

Replace the Home screen (`/`) with the wireframe's archipelago: one
placeholder island per course over a canvas, beside a rail listing each
course's next review session and the upcoming exams. Adds one column
(`courses.island_shape_index`) and one new read; every other data source
already exists.

Out of scope, and deliberately: the Knowledge Map (a separate screen on
the wireframe's own TODO list), the settings gear (Configurations is
Phase 6 and would ship disabled), and any change to the Concept Atlas —
the parent design doc is explicit that the island imagery is a new
screen, not an Atlas re-skin.

## What the wireframe shows, and what we build

The wireframe's Home has an "add class" control, a scatter of organic
islands, a right rail of "Due today" / "Due tomorrow" cards each with a
▷, a settings gear, and the bottom nav. We build all of it except the
gear, with one deliberate change to the rail, explained below.

## Decisions

### The ▷ links to the existing Study flow, not a disabled button

Phase 2 shipped both its ▷ controls visibly disabled, because the flows
they launch (Deep review, Quick review) do not exist. Home is different,
and the difference matters: Quick review has a **working predecessor**.
`/courses/<id>/study` already runs today's real daily review session; it
is simply not the redesigned quiz UI yet.

So Home's ▷ opens `/courses/<id>/study`. This is not a stand-in — the
button genuinely reviews you, which is what it claims to do. Phase 4
later changes the destination, not the control. Shipping Home with a
dead primary action would also have meant *removing* a working path to
studying (today's Home links to `/study`) in order to look more like the
drawing, which is a real regression dressed as progress.

### The rail is one row per course, ordered soonest first

The wireframe splits the rail into "Due today" and "Due tomorrow". We
collapse that into a single list ordered by soonest due date, because
two fixed buckets answer a narrower question than "what is closest".

Each row is **one course**, showing:

- the course name;
- the date label of its soonest upcoming concept, reusing
  `due-queue-bucketing.ts`'s existing `bucketFor` output verbatim
  ("Overdue", "Due today", "Due tomorrow", "In N days") rather than
  deriving a second, divergent copy of that wording;
- a count **only when the items are due now** (overdue or today) — see
  the truthfulness rule below;
- a ▷ linking to that course's `/study`.

A course with nothing due and nothing upcoming renders an explicit
"Nothing scheduled" row. It is never silently omitted from the rail: a
course vanishing from this list would be indistinguishable from a course
whose read failed.

### Why one nearest date per course, and not "the next 5 sessions"

An earlier draft of this rail listed the next five review sessions. It
was rejected on a factual ground worth recording, because the same
reasoning constrains Phase 7.

There is no stored review session in this system. `specs/009-review-scheduler/data-model.md`
states it directly: "No new database table... Every type below is a plain
TypeScript type computed on read." A session is generated on demand for
one course, and the scheduler deliberately never commits to a future
schedule. So "the next five sessions" could only be *projected* — and a
projection presented as a list of dated, sized sessions claims more than
it can support: recording evidence tomorrow moves Thursday's projected
session, so a row reading "Thu · ALD · 6 concepts" states as settled
something that will change. That is the plausible-looking-but-unearned
claim `CLAUDE.md`'s no-silent-placeholders rule exists to prevent.

One nearest date per course is a weaker and therefore truthful claim. It
says "the earliest thing in this course comes due Thursday," which is a
fact about current learner state, not a plan. It names no session
composition and no size for a future date.

**Consequence for Phase 7.** This does not discharge the ADR the parent
design doc requires before the calendar. Listing many future review
dates across a month is a materially stronger claim than one nearest
date per course, and it is the version that reverses the
never-persist-a-schedule decision. That ADR is still owed.

### Count shown only for work that is actually waiting

"6 due" appears only when those six are overdue or due today. For a
future date the row shows the date alone. A count attached to a future
date would be a projection of that session's size, which is exactly what
the section above rules out.

### Islands carry identity, not mastery

Island shape and color encode *which course this is*, never how well the
student knows it. The parent design doc already fixed the mechanism:

- `courses.island_shape_index int not null`, assigned once at
  `createCourse` from the current library length and never recomputed,
  so appending shape #31 later cannot reshuffle existing courses. The
  shape library is a static, ordered, **append-only** array in code.
- Color is a cheap deterministic hash of `course.id` — no storage, since
  the palette will not grow the way the shape library will.

Encoding mastery in island appearance was considered and is out of
scope. Aggregating a course's per-concept mastery into one visual
quantity is a real design decision with an evidence-boundary dimension
(`CLAUDE.md`: exposure is not mastery), and nothing in this phase needs
it.

### The placeholder set must look like a placeholder

Per the parent design doc: Phase 3 ships plain, uniform rounded-blob
outlines — no vegetation, no palm trees, nothing styled to read as
finished art. A hand-designed set may be commissioned later and drops in
at the same stable indices with no schema or code change. A placeholder
that looks finished is the same defect as a fallback that looks
computed.

### Layout is a deterministic scatter, not stored coordinates

Island positions come from a pure function of each course's stored shape
index. Stable across reloads and devices, organic rather than gridded,
and unit-testable. Persisted `island_x`/`island_y` columns were rejected:
new persistence for a need nothing has stated (no drag-to-arrange
feature is planned), which `CLAUDE.md` would additionally require an ADR
for.

### Exams stay on Home

The wireframe has no exam section, but today's Home shows a nearest-exam
countdown and the next three exams, and an exam in three days outranks
everything else on the screen. The rail keeps an **Upcoming exams**
section below the review list.

It is **pinned below the scrolling region**, not inside it. The review
list scrolls within its own bounded area (`overflow-y: auto`,
`min-height: 0` in the flex column); a student with eight courses would
otherwise push the exam countdown out of view exactly when the list is
busiest.

## Architecture

Four units, each with one purpose and independently testable.

| Unit | Purpose | Depends on |
|---|---|---|
| `src/features/courses/island-shapes.ts` | Append-only placeholder shape library; deterministic color from `course.id`. Pure. | nothing |
| `src/features/courses/island-layout.ts` | `layoutIslands(courses)` → positions. Deterministic scatter, no overlap. Pure. | nothing |
| `src/features/courses/home-overview.ts` | Cross-course aggregation: per-course next-review summary + the exam pool. | `getDueQueue`, `listExamConfigs`, `listCoursesResult` |
| `IslandCanvas.tsx` / `HomeReviewRail.tsx` / `IslandHome.tsx` | Presentation only. | the three above |

Islands render as inline SVG, so they take Orca tokens for fill and
stroke and need no asset pipeline; replacing the placeholder set later
is a change to `island-shapes.ts` alone.

## Data

One migration, `0016_course_island_shape.sql`:

- `alter table public.courses add column island_shape_index int not null`
  with a backfill for existing rows.
- `createCourse` assigns the index at insert time from the current
  library length.

`not null` is deliberate: a course must never render a shape it was not
assigned. No other schema change, no new table.

## Error handling

Three failures, three distinct outcomes. None of them is an empty
screen that looks like a correct one.

- **One course's due read fails.** That course's rail row says it could
  not load, and its island carries a visible marker. Every other course
  renders normally. This requires the aggregation to return
  `{ ok: true, ... } | { ok: false, reason }` per course rather than a
  bare array — a bare array cannot distinguish "no work due" from "the
  read failed".
- **The exam read fails.** The Upcoming exams section says so. Islands
  and the review list are unaffected.
- **The course list itself fails.** `listCourses` returns `[]` on error
  today, which on this screen would render "no courses yet — add a
  class" to a student who has twelve. That is the empty state lying, on
  the landing page. Home uses a new sibling `listCoursesResult()` that
  surfaces the error; `listCourses` and its three existing callers are
  left untouched. Additive, no regression, and it respects the
  deliberately-deferred decision about that function rather than
  reopening it.

## What Home stops doing

`getTodayOverview`'s `dailySession` and `conceptNames` are removed. They
exist only to power the old Home's daily-session preview, which the
island Home replaces — rows are per course now, and ▷ goes to the real
Study flow. Deleting them also removes a `data ?? []` that silently hid
a failed concept-name lookup. The exam aggregation is preserved and
moves into `home-overview.ts`.

## Testing

Unit tests carry the load, because the load-bearing logic is pure:

- `island-layout`: same courses produce the same positions; no two
  islands overlap; adding a course does not move the existing ones.
- `island-shapes`: a stored index always maps to the same shape, and an
  append-only guard fails if an existing entry is reordered or removed.
- `home-overview`: ordering by soonest date; the count appears only for
  overdue/today rows and never for a future date; a course with no work
  yields an explicit "nothing scheduled" summary; one failed course
  yields `ok: false` for that course while the others still report.

Visual: new Home baselines on both platforms. The `-linux` set can only
be produced on CI's own runner, via the temporary-commit-on-`main`
sequence recorded in `brain/decisions/architecture-log.md`'s 2026-09-28
Phase 2 entry.

E2E: `tests/e2e/smoke.spec.ts` asserts the `Welcome to Orca.` heading at
`/`. The no-courses empty state carries that copy over, so the spec
passes unchanged.

## Open questions deferred by design

- Mastery encoding in island appearance — needs an aggregate-mastery
  design with an evidence-boundary justification. Not needed here.
- The commissioned island art set — drops in at stable indices.
- Phase 7's calendar ADR, still owed, and not discharged by this phase.

## Spec self-review

- **Placeholder scan:** no TBD/TODO. The placeholder island set is an
  explicit, justified, deliberately-unfinished-looking state, not a gap.
- **Internal consistency:** the ▷-links-to-Study decision and the
  no-disabled-controls stance agree; the count rule and the
  no-projected-sessions decision are the same rule applied twice.
- **Scope:** one screen, one column, one new read — a single plan.
- **Ambiguity:** "next review session per course" is defined precisely
  as the soonest upcoming concept due date for that course, with a count
  only when that date is today or past.
