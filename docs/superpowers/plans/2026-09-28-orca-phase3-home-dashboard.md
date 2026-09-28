# Orca Phase 3 — Home Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Home (`/`) with an archipelago of one placeholder island per course, beside a rail showing each course's next review session and the upcoming exams.

**Architecture:** Two pure modules (shape library, scatter layout) with no
React or database in them, one aggregation module composing existing reads,
and presentation components over both. One new column
(`courses.island_shape_index`). Two additive sibling reads
(`listCoursesResult`, `getDueQueueResult`) that surface errors the existing
`listCourses`/`getDueQueue` swallow — the originals are left untouched so no
existing caller changes behavior.

**Tech Stack:** Next.js App Router (server components + server actions),
React, inline SVG, plain CSS custom properties (the Orca token system),
Supabase Postgres via `@/lib/supabase`, `node:test` for unit tests,
Playwright for e2e/visual. No new npm dependency.

## Global Constraints

- No new npm dependency (`CLAUDE.md`: don't add one when an existing
  project dependency already solves the problem).
- One migration only (`0016_course_island_shape.sql`), adding one column.
  No new table.
- Every color comes from the Orca token system in `src/app/globals.css`.
  Never a raw hex, never a re-introduced `--clay`/`--denim`/`--teal`.
- **No silent placeholders.** Three specific applications in this plan:
  a failed read must never render as "nothing due"; a course must never
  be silently omitted from the rail; a stored shape index that has no
  shape must throw, not fall back to shape 0.
- **Island appearance encodes course identity, never mastery.** No
  mastery-derived size, color, or decoration.
- **The placeholder island set must look unfinished** — plain uniform
  blob outlines, no vegetation or styling that reads as final art.
- **No count on a future date.** A row shows "N due" only when those
  items are overdue or due today; a future date shows the date alone.
- Dates go through `@/lib/format-date.ts`, never a bare
  `toLocaleDateString()`.
- Solo-authored commits, no AI co-author trailer, commit after each task.
- Run under Node 24 (`export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"`);
  the default shell `node` is v16 and `next dev` refuses to start on it.
- **Never leave a dev server running while running Playwright** —
  `playwright.config.ts` sets `reuseExistingServer: !process.env.CI`, so a
  reused server misses `TUTOR_AGENT_USE_TEST_DOUBLE` and the `tutor-agent`
  specs fail for unrelated reasons.
- `tests/e2e/course-graph-ingestion-pipeline.spec.ts` fails with
  `429 You have no credits remaining` — a known operational failure of the
  OpenAI account, not a code defect. Never fix, skip, or gate it.

---

## File Structure

**Create:**
- `src/features/courses/island-shapes.ts` — append-only shape library + color hash.
- `src/features/courses/island-layout.ts` — deterministic scatter.
- `src/features/courses/home-overview.ts` — cross-course aggregation.
- `src/features/courses/components/IslandCanvas.tsx` — the archipelago.
- `src/features/courses/components/HomeReviewRail.tsx` — the rail.
- `src/features/courses/components/IslandHome.tsx` — composes both.
- `supabase/migrations/0016_course_island_shape.sql`
- `tests/unit/courses/island-shapes.test.ts`
- `tests/unit/courses/island-layout.test.ts`
- `tests/unit/courses/home-overview.test.ts`

**Modify:**
- `src/features/courses/actions.ts` — `listCoursesResult`, island index on insert.
- `src/features/review-scheduler/due-queue.ts` — `getDueQueueResult` sibling.
- `src/features/courses/today.ts` — drop `dailySession`/`conceptNames`.
- `src/app/(app)/page.tsx` — render `IslandHome`.

**Delete:**
- `src/features/courses/components/TodayDashboard.tsx` — replaced.

---

## Task 1: The island shape library

Pure, no dependencies, so the append-only invariant is pinned by tests
before anything stores an index against it.

**Files:**
- Create: `src/features/courses/island-shapes.ts`
- Test: `tests/unit/courses/island-shapes.test.ts`

**Interfaces:**
- Produces:
  - `type IslandShape = { id: string; path: string }`
  - `const ISLAND_SHAPES: readonly IslandShape[]`
  - `const ISLAND_VIEWBOX = "0 0 100 100"`
  - `shapeForIndex(index: number): IslandShape` — throws on an unknown index
  - `islandColorForCourseId(courseId: string): string` — returns a CSS `var(...)` string

- [ ] **Step 1: Write the failing test**

Create `tests/unit/courses/island-shapes.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ISLAND_SHAPES,
  shapeForIndex,
  islandColorForCourseId,
} from "../../../src/features/courses/island-shapes.ts";

test("the library is non-empty and every shape has a unique id", () => {
  assert.ok(ISLAND_SHAPES.length > 0);
  const ids = ISLAND_SHAPES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

// This is the load-bearing test for the whole stored-index design: a
// course stores an index once, forever, so entry N must never change
// meaning. It fails loudly if someone reorders or removes an entry.
test("the library is append-only: existing entries keep their id and position", () => {
  const expectedPrefix = [
    "blob-01",
    "blob-02",
    "blob-03",
    "blob-04",
    "blob-05",
    "blob-06",
    "blob-07",
    "blob-08",
  ];
  assert.deepEqual(ISLAND_SHAPES.slice(0, expectedPrefix.length).map((s) => s.id), expectedPrefix);
});

test("shapeForIndex returns the entry at that index", () => {
  assert.equal(shapeForIndex(0), ISLAND_SHAPES[0]);
  assert.equal(shapeForIndex(3), ISLAND_SHAPES[3]);
});

// A stored index with no shape is a real data problem -- a course row
// pointing past the library. Falling back to shape 0 would render a
// plausible-looking island for a course whose real shape is unknown.
test("shapeForIndex throws on an index the library does not have", () => {
  assert.throws(() => shapeForIndex(ISLAND_SHAPES.length), /island shape index/i);
  assert.throws(() => shapeForIndex(-1), /island shape index/i);
  assert.throws(() => shapeForIndex(1.5), /island shape index/i);
});

test("island color is deterministic per course id and always a token reference", () => {
  const a = islandColorForCourseId("course-a");
  assert.equal(a, islandColorForCourseId("course-a"));
  assert.match(a, /^var\(--[a-z-]+\)$/);
});

test("island colors spread across the palette rather than collapsing to one", () => {
  const colors = new Set(
    ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].map(islandColorForCourseId),
  );
  assert.ok(colors.size > 1, "expected more than one distinct color across 10 ids");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH" && node --test tests/unit/courses/island-shapes.test.ts`
Expected: FAIL — cannot find module `island-shapes.ts`.

- [ ] **Step 3: Write the implementation**

Create `src/features/courses/island-shapes.ts`:

```ts
export type IslandShape = {
  /** Stable forever. A course row stores this entry's INDEX, so an id
   *  is here to make an accidental reorder visible in a test diff. */
  id: string;
  /** SVG path data, drawn in ISLAND_VIEWBOX's coordinate space. */
  path: string;
};

export const ISLAND_VIEWBOX = "0 0 100 100";

/**
 * PLACEHOLDER ART, DELIBERATELY UNFINISHED.
 *
 * These are plain uniform blob outlines. They are not meant to look
 * like the final islands, and they must not be prettied up into
 * something that does: per this project's no-silent-placeholders rule,
 * a placeholder that looks finished is indistinguishable from real
 * work, and nobody would know art was still owed. A commissioned set
 * drops in here later at the same indices.
 *
 * APPEND-ONLY. A course stores its shape INDEX once, at creation, and
 * that index is never recomputed -- so entry N must mean the same
 * shape forever. Add new shapes at the end. Never reorder, never
 * remove, never re-point an existing entry. `island-shapes.test.ts`
 * fails if you do.
 */
export const ISLAND_SHAPES: readonly IslandShape[] = [
  { id: "blob-01", path: "M50 8 C72 8 92 26 92 50 C92 74 72 92 50 92 C28 92 8 74 8 50 C8 26 28 8 50 8 Z" },
  { id: "blob-02", path: "M52 10 C78 12 90 30 88 54 C86 78 66 92 44 90 C22 88 10 68 12 46 C14 24 30 8 52 10 Z" },
  { id: "blob-03", path: "M48 9 C70 6 90 24 91 46 C92 70 74 90 50 91 C26 92 9 74 9 50 C9 28 26 12 48 9 Z" },
  { id: "blob-04", path: "M55 11 C76 14 91 32 89 55 C87 76 68 91 46 89 C24 87 9 67 11 45 C13 25 34 8 55 11 Z" },
  { id: "blob-05", path: "M50 10 C74 10 90 28 90 52 C90 74 70 90 48 90 C26 90 10 72 10 48 C10 26 28 10 50 10 Z" },
  { id: "blob-06", path: "M46 10 C70 8 92 26 90 50 C88 76 68 92 44 90 C20 88 8 66 10 44 C12 24 26 12 46 10 Z" },
  { id: "blob-07", path: "M54 9 C74 12 92 30 90 54 C88 78 66 93 44 89 C22 85 8 66 11 44 C14 24 34 6 54 9 Z" },
  { id: "blob-08", path: "M50 12 C72 9 88 28 89 50 C90 72 72 88 50 89 C28 90 11 72 11 50 C11 28 28 15 50 12 Z" },
];

/**
 * The shape a stored index refers to.
 *
 * Throws rather than falling back, on purpose. An index with no shape
 * means a course row points past the library -- a real data problem.
 * Rendering shape 0 instead would show a plausible island for a course
 * whose actual shape is unknown, which is precisely the stand-in this
 * project forbids.
 */
export function shapeForIndex(index: number): IslandShape {
  if (!Number.isInteger(index) || index < 0 || index >= ISLAND_SHAPES.length) {
    throw new Error(
      `Unknown island shape index ${index}: the library has ${ISLAND_SHAPES.length} shapes (0..${ISLAND_SHAPES.length - 1}).`,
    );
  }
  return ISLAND_SHAPES[index];
}

/**
 * Island fill color. Unlike the shape, this is a pure hash with no
 * stored column: the brand palette is fixed at 6 colors and is not
 * going to grow the way the shape library will, so there is no
 * reshuffling risk to protect against.
 *
 * These encode WHICH COURSE this is, never how well it is known --
 * mastery is not represented on this screen at all.
 */
const ISLAND_COLORS = [
  "var(--periwinkle)",
  "var(--wisteria-blue)",
  "var(--alice-blue)",
  "var(--accent-secondary)",
] as const;

export function islandColorForCourseId(courseId: string): string {
  let hash = 0;
  for (let i = 0; i < courseId.length; i += 1) {
    hash = (hash * 31 + courseId.charCodeAt(i)) % 100000;
  }
  return ISLAND_COLORS[hash % ISLAND_COLORS.length];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH" && node --test tests/unit/courses/island-shapes.test.ts`
Expected: PASS, 6/6.

- [ ] **Step 5: Commit**

```bash
git add src/features/courses/island-shapes.ts tests/unit/courses/island-shapes.test.ts
git commit -m "feat: append-only placeholder island shape library"
```

---

## Task 2: Deterministic island scatter

**Files:**
- Create: `src/features/courses/island-layout.ts`
- Test: `tests/unit/courses/island-layout.test.ts`

**Interfaces:**
- Produces:
  - `type IslandLayoutInput = { id: string }`
  - `type IslandPlacement = { courseId: string; leftPercent: number; topPercent: number }`
  - `type IslandLayout = { placements: IslandPlacement[]; rows: number }`
  - `layoutIslands(courses: IslandLayoutInput[]): IslandLayout`
  - `const ISLANDS_PER_ROW = 3`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/courses/island-layout.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutIslands, ISLANDS_PER_ROW } from "../../../src/features/courses/island-layout.ts";

const courses = (...ids: string[]) => ids.map((id) => ({ id }));

test("every course gets exactly one placement, in input order", () => {
  const { placements } = layoutIslands(courses("a", "b", "c", "d"));
  assert.deepEqual(placements.map((p) => p.courseId), ["a", "b", "c", "d"]);
});

test("layout is deterministic: same input, same output", () => {
  const first = layoutIslands(courses("a", "b", "c"));
  const second = layoutIslands(courses("a", "b", "c"));
  assert.deepEqual(first, second);
});

// The reason the grid has a FIXED column count rather than sqrt(n):
// a student adding their fifth course should not see the other four
// jump to new positions.
test("adding a course does not move the courses already placed", () => {
  const before = layoutIslands(courses("a", "b", "c"));
  const after = layoutIslands(courses("a", "b", "c", "d"));
  assert.deepEqual(after.placements.slice(0, 3), before.placements);
});

test("jitter is per-course, so two courses in the same slot position differently", () => {
  const a = layoutIslands(courses("course-a")).placements[0];
  const b = layoutIslands(courses("course-b")).placements[0];
  assert.notDeepEqual([a.leftPercent, a.topPercent], [b.leftPercent, b.topPercent]);
});

test("no two islands overlap", () => {
  const { placements } = layoutIslands(courses("a", "b", "c", "d", "e", "f", "g", "h"));
  for (let i = 0; i < placements.length; i += 1) {
    for (let j = i + 1; j < placements.length; j += 1) {
      const dx = placements[i].leftPercent - placements[j].leftPercent;
      const dy = placements[i].topPercent - placements[j].topPercent;
      assert.ok(
        Math.hypot(dx, dy) > 0.001,
        `islands ${placements[i].courseId} and ${placements[j].courseId} share a position`,
      );
      assert.ok(
        Math.abs(dx) > 1 || Math.abs(dy) > 1,
        `islands ${placements[i].courseId} and ${placements[j].courseId} are too close`,
      );
    }
  }
});

test("rows grow with the course count", () => {
  assert.equal(layoutIslands(courses("a")).rows, 1);
  assert.equal(layoutIslands(courses("a", "b", "c")).rows, 1);
  assert.equal(layoutIslands(courses("a", "b", "c", "d")).rows, 2);
  assert.equal(layoutIslands([]).rows, 0);
});

test("an empty course list produces no placements", () => {
  assert.deepEqual(layoutIslands([]), { placements: [], rows: 0 });
});

test("ISLANDS_PER_ROW is the documented fixed column count", () => {
  assert.equal(ISLANDS_PER_ROW, 3);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH" && node --test tests/unit/courses/island-layout.test.ts`
Expected: FAIL — cannot find module `island-layout.ts`.

- [ ] **Step 3: Write the implementation**

Create `src/features/courses/island-layout.ts`:

```ts
export type IslandLayoutInput = { id: string };

export type IslandPlacement = {
  courseId: string;
  /** Percentage of the canvas width, for the island's top-left corner. */
  leftPercent: number;
  /** Percentage of ONE ROW's height. The canvas grows a row at a time. */
  topPercent: number;
};

export type IslandLayout = { placements: IslandPlacement[]; rows: number };

/**
 * Fixed, not derived from the course count.
 *
 * A sqrt(n) grid would look tidier, but it re-columns every time a
 * course is added -- so adding a fifth course would visibly relocate
 * the other four. A fixed column count means new courses only ever
 * append.
 */
export const ISLANDS_PER_ROW = 3;

/** Jitter bound, as a fraction of a cell. Kept under half a cell so
 *  two neighbouring islands can never be pushed onto each other. */
const JITTER_FRACTION = 0.22;

function hash(value: string): number {
  let result = 0;
  for (let i = 0; i < value.length; i += 1) {
    result = (result * 31 + value.charCodeAt(i)) % 100000;
  }
  return result;
}

/** A stable pseudo-random offset in [-1, 1] for one course and axis. */
function jitter(courseId: string, axis: "x" | "y"): number {
  const h = hash(`${courseId}:${axis}`);
  return ((h % 1000) / 1000) * 2 - 1;
}

/**
 * Positions one island per course on a fixed-column grid, with a
 * per-course jitter so the result reads as a scatter rather than a
 * grid.
 *
 * Deterministic: the same courses always produce the same layout, on
 * every device and every reload. That matters because the archipelago
 * is a navigation surface -- an island that moves between visits is a
 * landmark that cannot be learned.
 */
export function layoutIslands(courses: IslandLayoutInput[]): IslandLayout {
  const cellWidth = 100 / ISLANDS_PER_ROW;
  const placements = courses.map((course, ordinal) => {
    const column = ordinal % ISLANDS_PER_ROW;
    const cellLeft = column * cellWidth;

    return {
      courseId: course.id,
      leftPercent: round(cellLeft + cellWidth / 2 + jitter(course.id, "x") * cellWidth * JITTER_FRACTION),
      topPercent: round(50 + jitter(course.id, "y") * 100 * JITTER_FRACTION),
    };
  });

  return { placements, rows: Math.ceil(courses.length / ISLANDS_PER_ROW) };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
```

Note: `topPercent` is within a single row's height; the renderer places
each island in its own row container, so `ordinal` only needs to drive
the column. This is what keeps earlier placements byte-identical when a
course is appended.

- [ ] **Step 4: Run the test to verify it passes**

Run: `export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH" && node --test tests/unit/courses/island-layout.test.ts`
Expected: PASS, 8/8.

If the "no two islands overlap" test fails for two courses in the same
column of different rows, that is expected to pass because they are in
separate row containers — assert on column-mates only if the test
proves otherwise; do NOT loosen the assertion to make it pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/courses/island-layout.ts tests/unit/courses/island-layout.test.ts
git commit -m "feat: deterministic island scatter layout"
```

---

## Task 3: The island-index column and the error-surfacing course read

**Files:**
- Create: `supabase/migrations/0016_course_island_shape.sql`
- Modify: `src/features/courses/actions.ts`

**Interfaces:**
- Consumes: `ISLAND_SHAPES` (Task 1).
- Produces:
  - `type CourseWithIsland = Course & { islandShapeIndex: number }`
  - `type CoursesResult = { ok: true; courses: CourseWithIsland[] } | { ok: false; reason: string }`
  - `listCoursesResult(): Promise<CoursesResult>`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0016_course_island_shape.sql`:

```sql
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
```

- [ ] **Step 2: Push the migration and verify it live**

Run: `npx supabase db push`

Then confirm the column exists, is `not null`, and that existing rows
were backfilled with varied values — not all zero:

```sql
select island_shape_index, count(*) from public.courses group by 1 order by 1;
```

Expected: no NULLs, and more than one distinct value if the project has
more than one course. Record the real output in your report. A live push
is required here — typechecking cannot tell you whether the backfill ran.

- [ ] **Step 3: Assign the index on insert**

In `src/features/courses/actions.ts`, import the library and assign an
index when creating a course:

```ts
import { ISLAND_SHAPES } from "@/features/courses/island-shapes.ts";
```

Change the insert (currently `.insert({ owner_id: user.id, name: trimmedName })`) to:

```ts
    // Assigned once, from the library size as it stands today, and
    // never recomputed -- see island-shapes.ts's append-only note and
    // migration 0016. Math.random is fine here: this is a cosmetic
    // starting shape, not an identifier anything depends on.
    .insert({
      owner_id: user.id,
      name: trimmedName,
      island_shape_index: Math.floor(Math.random() * ISLAND_SHAPES.length),
    })
```

- [ ] **Step 4: Add the error-surfacing course read**

Append to `src/features/courses/actions.ts`:

```ts
export type CourseWithIsland = Course & { islandShapeIndex: number };

export type CoursesResult =
  | { ok: true; courses: CourseWithIsland[] }
  | { ok: false; reason: string };

/**
 * `listCourses`, but able to say that it failed.
 *
 * `listCourses` returns [] on error, which every existing caller
 * already depends on and which is a separate, deliberately-deferred
 * decision (architecture-log, 2026-09-28). On the Home dashboard that
 * behavior would be actively wrong: an empty list renders "no courses
 * yet -- add a class", so a student with twelve courses would be told
 * they have none. This sibling surfaces the error instead, and carries
 * the island index Home needs. `listCourses` itself is untouched.
 */
export async function listCoursesResult(): Promise<CoursesResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("courses")
    .select("id, name, created_at, island_shape_index")
    .order("created_at", { ascending: false });

  if (error) {
    return { ok: false, reason: error.message };
  }
  if (!data) {
    return { ok: false, reason: "The course list came back empty with no error." };
  }

  return {
    ok: true,
    courses: data.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      islandShapeIndex: row.island_shape_index,
    })),
  };
}
```

- [ ] **Step 5: Verify**

Run: `export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH" && npm run typecheck` — expect PASS.
Run: `npx eslint src` — expect 0 errors.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0016_course_island_shape.sql src/features/courses/actions.ts
git commit -m "feat: per-course island shape index, and a course read that reports failure"
```

---

## Task 4: A due-queue read that reports failure

The rail needs to tell "nothing due" apart from "the read failed". The
existing `getDueQueue` cannot: it returns `[]` for both.

**Files:**
- Modify: `src/features/review-scheduler/due-queue.ts`

**Interfaces:**
- Produces:
  - `type DueQueueResult = { ok: true; items: DueQueueItem[] } | { ok: false; reason: string }`
  - `getDueQueueResult(courseId: string): Promise<DueQueueResult>`
- `getDueQueue(courseId)` keeps its exact current signature and behavior.

- [ ] **Step 1: Extract the body into a result-returning function**

In `src/features/review-scheduler/due-queue.ts`, rename the existing
`getDueQueue` body into `getDueQueueResult`, returning the result union,
and add the two error checks that the current `?? []` hides:

```ts
export type DueQueueResult =
  | { ok: true; items: DueQueueItem[] }
  | { ok: false; reason: string };

/**
 * `getDueQueue`, but able to say that it failed.
 *
 * The original collapses a failed query into an empty array, so a
 * caller cannot tell "this course has nothing due" from "the concepts
 * query errored". The Home dashboard has to tell those apart -- one is
 * a calm state, the other needs to be visible -- so this sibling
 * reports the failure. `getDueQueue` below keeps its old behavior for
 * its existing callers, which are unchanged by this task.
 */
export async function getDueQueueResult(courseId: string): Promise<DueQueueResult> {
  // ... existing body, with these two changes:
  //   1. after the Promise.all, before using the data:
  //        if (conceptsRes.error) return { ok: false, reason: `Failed to load concepts: ${conceptsRes.error.message}` };
  //        if (edgesRes.error) return { ok: false, reason: `Failed to load concept edges: ${edgesRes.error.message}` };
  //   2. the final `return ranked...` becomes `return { ok: true, items: <what it returned before> };`
}

/**
 * Unchanged behavior: an empty array on failure. Kept exactly as-is
 * because its existing callers depend on it; migrating them is a
 * separate decision (architecture-log, 2026-09-28).
 */
export async function getDueQueue(courseId: string): Promise<DueQueueItem[]> {
  const result = await getDueQueueResult(courseId);
  return result.ok ? result.items : [];
}
```

Keep `conceptsRes.data ?? []` and `edgesRes.data ?? []` *after* the new
error checks — with the errors handled, a null `data` there is genuinely
an empty course.

- [ ] **Step 2: Verify nothing regressed for existing callers**

Run: `export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH" && npm run typecheck` — expect PASS.
Run: `npm run test:unit` — expect PASS with the same count as before this task.
Run: `npx eslint src` — expect 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/review-scheduler/due-queue.ts
git commit -m "feat: add a due-queue read that reports query failure"
```

---

## Task 5: The cross-course aggregation

**Files:**
- Create: `src/features/courses/home-overview.ts`
- Test: `tests/unit/courses/home-overview.test.ts`

**Interfaces:**
- Consumes: `listCoursesResult` (Task 3), `getDueQueueResult` (Task 4),
  existing `listExamConfigs` from `@/features/exam-planner/actions.ts`,
  existing `pickNearestExam` and `NearestExam` from
  `@/features/courses/today-selection.ts`.
- Produces:
  - `type CourseReviewSummary` (the three-variant union below)
  - `type ExamSection`
  - `type HomeOverview`
  - `summarizeCourseDue(course, result)` — pure, unit-tested
  - `orderSummaries(summaries)` — pure, unit-tested
  - `getHomeOverview(): Promise<HomeOverview>`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/courses/home-overview.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  summarizeCourseDue,
  orderSummaries,
} from "../../../src/features/courses/home-overview.ts";

const course = { id: "c1", name: "ALD", islandShapeIndex: 2 };

const item = (daysUntilDue: number, dueLabel: string) => ({
  conceptId: `concept-${daysUntilDue}-${dueLabel}`,
  label: "Concept",
  masteryValue: 0.4,
  daysUntilDue,
  urgencyBucket: daysUntilDue < 0 ? ("overdue" as const) : daysUntilDue <= 1 ? ("today" as const) : ("soon" as const),
  dueLabel,
});

test("a failed read becomes an explicit failed summary, never an empty one", () => {
  const summary = summarizeCourseDue(course, { ok: false, reason: "connection reset" });
  assert.equal(summary.kind, "failed");
  assert.match(summary.kind === "failed" ? summary.reason : "", /connection reset/);
});

test("no due items becomes an explicit nothing-scheduled summary", () => {
  const summary = summarizeCourseDue(course, { ok: true, items: [] });
  assert.equal(summary.kind, "nothing-scheduled");
});

test("the soonest item supplies the label, reusing the queue's own wording", () => {
  const summary = summarizeCourseDue(course, {
    ok: true,
    items: [item(3, "In 3 days"), item(0, "Due today"), item(5, "In 5 days")],
  });
  assert.equal(summary.kind, "scheduled");
  if (summary.kind !== "scheduled") return;
  assert.equal(summary.label, "Due today");
  assert.equal(summary.daysUntilDue, 0);
});

// The truthfulness rule: a count is a claim about work that exists
// right now. A future session's size is a projection that changes the
// moment any evidence is recorded, so a future row carries no count.
test("a count is given for work due now, and withheld for a future date", () => {
  const dueNow = summarizeCourseDue(course, {
    ok: true,
    items: [item(0, "Due today"), item(-2, "Overdue"), item(4, "In 4 days")],
  });
  assert.equal(dueNow.kind === "scheduled" ? dueNow.dueNowCount : null, 2);

  const future = summarizeCourseDue(course, { ok: true, items: [item(4, "In 4 days")] });
  assert.equal(future.kind === "scheduled" ? future.dueNowCount : "unset", null);
});

test("ordering puts the soonest first, then failures, then nothing-scheduled", () => {
  const scheduledIn = (id: string, days: number) =>
    summarizeCourseDue({ id, name: id, islandShapeIndex: 0 }, { ok: true, items: [item(days, `In ${days} days`)] });

  const ordered = orderSummaries([
    summarizeCourseDue({ id: "empty", name: "empty", islandShapeIndex: 0 }, { ok: true, items: [] }),
    scheduledIn("later", 5),
    summarizeCourseDue({ id: "broken", name: "broken", islandShapeIndex: 0 }, { ok: false, reason: "boom" }),
    scheduledIn("sooner", 1),
  ]);

  assert.deepEqual(ordered.map((s) => s.courseId), ["sooner", "later", "broken", "empty"]);
});

test("ordering is stable for two courses due on the same day", () => {
  const a = summarizeCourseDue({ id: "a", name: "a", islandShapeIndex: 0 }, { ok: true, items: [item(2, "In 2 days")] });
  const b = summarizeCourseDue({ id: "b", name: "b", islandShapeIndex: 0 }, { ok: true, items: [item(2, "In 2 days")] });
  assert.deepEqual(orderSummaries([a, b]).map((s) => s.courseId), ["a", "b"]);
  assert.deepEqual(orderSummaries([b, a]).map((s) => s.courseId), ["b", "a"]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH" && node --test tests/unit/courses/home-overview.test.ts`
Expected: FAIL — cannot find module `home-overview.ts`.

- [ ] **Step 3: Write the implementation**

Create `src/features/courses/home-overview.ts`:

```ts
import { listCoursesResult, type CourseWithIsland } from "@/features/courses/actions.ts";
import { getDueQueueResult, type DueQueueResult } from "@/features/review-scheduler/due-queue.ts";
import { listExamConfigs } from "@/features/exam-planner/actions.ts";
import { pickNearestExam, daysUntil, type NearestExam } from "@/features/courses/today-selection.ts";

type CourseIdentity = { id: string; name: string; islandShapeIndex: number };

/**
 * One rail row. Three variants, because these are three genuinely
 * different states and collapsing any two of them would hide a real
 * one: work is waiting, nothing is waiting, or we could not find out.
 */
export type CourseReviewSummary =
  | {
      kind: "scheduled";
      courseId: string;
      courseName: string;
      islandShapeIndex: number;
      /** Reused verbatim from due-queue-bucketing's `bucketFor`. */
      label: string;
      daysUntilDue: number;
      /** Number of items due now. Null for a future date -- see below. */
      dueNowCount: number | null;
    }
  | { kind: "nothing-scheduled"; courseId: string; courseName: string; islandShapeIndex: number }
  | { kind: "failed"; courseId: string; courseName: string; islandShapeIndex: number; reason: string };

export type ExamSection =
  | { kind: "ok"; upcoming: NearestExam[] }
  | { kind: "failed"; reason: string };

export type HomeOverview =
  | { kind: "courses-unavailable"; reason: string }
  | { kind: "ready"; courses: CourseReviewSummary[]; exams: ExamSection };

/**
 * Turns one course's due-queue result into a rail row.
 *
 * The count rule is the interesting part. "6 due" is a claim about
 * work that exists right now, and it is true. A count attached to a
 * FUTURE date would instead be a claim about the size of a session
 * that has not been generated and does not exist: this system never
 * persists a future schedule (specs/009-review-scheduler/data-model.md
 * -- every session type is "computed on read"), and recording any
 * evidence between now and then changes what that day holds. So a
 * future row gets the date alone.
 */
export function summarizeCourseDue(course: CourseIdentity, result: DueQueueResult): CourseReviewSummary {
  const identity = {
    courseId: course.id,
    courseName: course.name,
    islandShapeIndex: course.islandShapeIndex,
  };

  if (!result.ok) {
    return { kind: "failed", ...identity, reason: result.reason };
  }
  if (result.items.length === 0) {
    return { kind: "nothing-scheduled", ...identity };
  }

  const soonest = result.items.reduce((best, candidate) =>
    candidate.daysUntilDue < best.daysUntilDue ? candidate : best,
  );

  const dueNowCount =
    soonest.daysUntilDue <= 0 ? result.items.filter((i) => i.daysUntilDue <= 0).length : null;

  return {
    kind: "scheduled",
    ...identity,
    label: soonest.dueLabel,
    daysUntilDue: soonest.daysUntilDue,
    dueNowCount,
  };
}

/**
 * Soonest work first, then the courses we could not read, then the
 * quiet ones. Failures sort above nothing-scheduled because a failure
 * is something to act on and an empty course is not.
 *
 * Stable within each group: two courses due the same day keep their
 * incoming order rather than jumping around between renders.
 */
export function orderSummaries(summaries: CourseReviewSummary[]): CourseReviewSummary[] {
  const rank = (s: CourseReviewSummary) => (s.kind === "scheduled" ? 0 : s.kind === "failed" ? 1 : 2);
  return [...summaries].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (a.kind === "scheduled" && b.kind === "scheduled") return a.daysUntilDue - b.daysUntilDue;
    return 0;
  });
}

/**
 * Everything the Home dashboard renders.
 *
 * Reads each course's due queue once. That is one query batch per
 * course, which is the right trade for a student's handful of courses
 * and reuses the ranking and bucketing that getDueQueue already has
 * unit-tested, rather than deriving a second copy of either.
 */
export async function getHomeOverview(): Promise<HomeOverview> {
  const coursesResult = await listCoursesResult();
  if (!coursesResult.ok) {
    return { kind: "courses-unavailable", reason: coursesResult.reason };
  }
  const courses: CourseWithIsland[] = coursesResult.courses;

  const summaries = await Promise.all(
    courses.map(async (course) => summarizeCourseDue(course, await getDueQueueResult(course.id))),
  );

  return {
    kind: "ready",
    courses: orderSummaries(summaries),
    exams: await loadExamSection(courses),
  };
}

async function loadExamSection(courses: CourseWithIsland[]): Promise<ExamSection> {
  try {
    const now = new Date();
    const configured = (
      await Promise.all(
        courses.map(async (course) =>
          (await listExamConfigs(course.id)).map((config) => ({
            courseId: course.id,
            courseName: course.name,
            examConfigId: config.id,
            examDate: config.examDate,
            daysLeft: daysUntil(config.examDate, now),
          })),
        ),
      )
    ).flat();

    // pickNearestExam is kept in the call chain so the "nearest" rule
    // stays defined in one unit-tested place, even though the rail
    // renders the whole upcoming list.
    void pickNearestExam(configured);

    return {
      kind: "ok",
      upcoming: configured.filter((e) => e.daysLeft >= 0).sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 3),
    };
  } catch (error) {
    return { kind: "failed", reason: error instanceof Error ? error.message : String(error) };
  }
}
```

`daysUntil` and `pickNearestExam` are both already exported from
`today-selection.ts` (verified during planning) — import them, never
write a second copy of either rule.

- [ ] **Step 4: Run the test to verify it passes**

Run: `export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH" && node --test tests/unit/courses/home-overview.test.ts`
Expected: PASS, 6/6.

- [ ] **Step 5: Verify the whole unit suite and types**

Run: `npm run test:unit` — expect PASS.
Run: `npm run typecheck` — expect PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/courses/home-overview.ts tests/unit/courses/home-overview.test.ts src/features/courses/today-selection.ts
git commit -m "feat: cross-course home overview aggregation"
```

---

## Task 6: The archipelago canvas

**Files:**
- Create: `src/features/courses/components/IslandCanvas.tsx`

**Interfaces:**
- Consumes: `layoutIslands`, `ISLANDS_PER_ROW` (Task 2); `shapeForIndex`,
  `islandColorForCourseId`, `ISLAND_VIEWBOX` (Task 1);
  `CourseReviewSummary` (Task 5).
- Produces: `IslandCanvas({ courses }: { courses: CourseReviewSummary[] })`

- [ ] **Step 1: Build the canvas**

Create `src/features/courses/components/IslandCanvas.tsx`:

```tsx
import Link from "next/link";
import { layoutIslands, ISLANDS_PER_ROW } from "@/features/courses/island-layout.ts";
import { shapeForIndex, islandColorForCourseId, ISLAND_VIEWBOX } from "@/features/courses/island-shapes.ts";
import type { CourseReviewSummary } from "@/features/courses/home-overview.ts";

/**
 * One island per course.
 *
 * The islands encode WHICH COURSE this is -- shape from a stored
 * index, color from the course id -- and nothing else. They
 * deliberately do not represent mastery: turning a course's
 * per-concept evidence into one visual quantity is a real design
 * decision with an evidence-boundary dimension, and this screen does
 * not need it.
 *
 * The shapes are placeholders and are meant to look like placeholders
 * (island-shapes.ts).
 */
export function IslandCanvas({ courses }: { courses: CourseReviewSummary[] }) {
  const { placements, rows } = layoutIslands(courses.map((c) => ({ id: c.courseId })));
  const summaryByCourseId = new Map(courses.map((c) => [c.courseId, c]));

  return (
    <div style={s.canvas}>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} style={s.row}>
          {placements
            .slice(row * ISLANDS_PER_ROW, (row + 1) * ISLANDS_PER_ROW)
            .map((placement) => {
              const summary = summaryByCourseId.get(placement.courseId);
              if (!summary) return null;
              const failed = summary.kind === "failed";

              return (
                <Link
                  key={placement.courseId}
                  href={`/courses/${placement.courseId}`}
                  style={{
                    ...s.island,
                    left: `${placement.leftPercent}%`,
                    top: `${placement.topPercent}%`,
                  }}
                  aria-label={
                    failed
                      ? `${summary.courseName} — review status could not be loaded`
                      : summary.courseName
                  }
                >
                  <svg viewBox={ISLAND_VIEWBOX} width="88" height="88" aria-hidden="true">
                    <path
                      d={shapeForIndex(summary.islandShapeIndex).path}
                      fill={islandColorForCourseId(summary.courseId)}
                      stroke="var(--border)"
                      strokeWidth="1.5"
                    />
                  </svg>
                  <span style={s.name}>{summary.courseName}</span>
                  {failed && <span style={s.failed}>Couldn&apos;t load</span>}
                </Link>
              );
            })}
        </div>
      ))}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  canvas: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 },
  row: { position: "relative", height: 200 },
  island: {
    position: "absolute",
    transform: "translate(-50%, -50%)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
    textDecoration: "none",
  },
  name: { fontSize: 13.5, fontWeight: 500, color: "var(--text-primary)", letterSpacing: "-0.01em" },
  failed: { fontSize: 12, color: "var(--status-warning)" },
};
```

- [ ] **Step 2: Verify**

Run: `export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH" && npm run typecheck` — expect PASS.
Run: `npx eslint src` — expect 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/courses/components/IslandCanvas.tsx
git commit -m "feat: island canvas for the home dashboard"
```

---

## Task 7: The review rail, and wiring Home

**Files:**
- Create: `src/features/courses/components/HomeReviewRail.tsx`
- Create: `src/features/courses/components/IslandHome.tsx`
- Modify: `src/app/(app)/page.tsx`
- Modify: `src/features/courses/today.ts`
- Delete: `src/features/courses/components/TodayDashboard.tsx`

**Interfaces:**
- Consumes: `HomeOverview`, `CourseReviewSummary`, `ExamSection` (Task 5);
  `IslandCanvas` (Task 6); existing `CreateCourseModal` and `createCourse`.
- Produces: route `/` rendering the island Home.

- [ ] **Step 1: Build the rail**

Create `src/features/courses/components/HomeReviewRail.tsx`:

```tsx
import Link from "next/link";
import { formatCalendarDateLong } from "@/lib/format-date.ts";
import { IconPlay } from "@/components/icons.tsx";
import type { CourseReviewSummary, ExamSection } from "@/features/courses/home-overview.ts";

/**
 * The rail: every course's next review session, soonest first, with
 * the upcoming exams pinned underneath.
 *
 * The exam section sits OUTSIDE the scrolling region on purpose. A
 * student with eight courses would otherwise scroll the exam countdown
 * out of view exactly when the list is busiest, and an exam in three
 * days outranks everything else on this screen.
 */
export function HomeReviewRail({
  courses,
  exams,
}: {
  courses: CourseReviewSummary[];
  exams: ExamSection;
}) {
  return (
    <aside style={s.rail}>
      <h2 style={s.heading}>Next review</h2>
      <div style={s.scroller}>
        {courses.length === 0 ? (
          <p style={s.quiet}>No courses yet.</p>
        ) : (
          courses.map((course) => <CourseRow key={course.courseId} course={course} />)
        )}
      </div>

      <h2 style={s.heading}>Upcoming exams</h2>
      {exams.kind === "failed" ? (
        <p style={s.failed}>Couldn&apos;t load exams: {exams.reason}</p>
      ) : exams.upcoming.length === 0 ? (
        <p style={s.quiet}>No exams scheduled.</p>
      ) : (
        exams.upcoming.map((exam) => (
          <Link
            key={exam.examConfigId}
            href={`/courses/${exam.courseId}/exam-plan?exam=${exam.examConfigId}`}
            style={s.examRow}
          >
            <span style={s.rowTitle}>{exam.courseName}</span>
            <span style={s.rowMeta}>
              {formatCalendarDateLong(exam.examDate)} · in {exam.daysLeft}{" "}
              {exam.daysLeft === 1 ? "day" : "days"}
            </span>
          </Link>
        ))
      )}
    </aside>
  );
}

function CourseRow({ course }: { course: CourseReviewSummary }) {
  if (course.kind === "failed") {
    return (
      <div style={s.row}>
        <div style={s.rowText}>
          <span style={s.rowTitle}>{course.courseName}</span>
          <span style={s.failed}>Couldn&apos;t load: {course.reason}</span>
        </div>
      </div>
    );
  }

  if (course.kind === "nothing-scheduled") {
    return (
      <div style={s.row}>
        <div style={s.rowText}>
          <span style={s.rowTitle}>{course.courseName}</span>
          <span style={s.quiet}>Nothing scheduled</span>
        </div>
      </div>
    );
  }

  return (
    <div style={s.row}>
      <div style={s.rowText}>
        <span style={s.rowTitle}>{course.courseName}</span>
        <span style={s.rowMeta}>
          {course.label}
          {course.dueNowCount !== null && ` · ${course.dueNowCount} due`}
        </span>
      </div>
      <Link
        href={`/courses/${course.courseId}/study`}
        aria-label={`Start review for ${course.courseName}`}
        style={s.play}
      >
        <IconPlay />
      </Link>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  rail: {
    width: 280,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    maxHeight: "100%",
    minHeight: 0,
  },
  // min-height: 0 is what lets this shrink inside the flex column so
  // the exam section below stays visible instead of being pushed off.
  scroller: { overflowY: "auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 8 },
  heading: {
    margin: 0,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-tertiary)",
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "10px 12px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
  },
  examRow: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: "10px 12px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    textDecoration: "none",
  },
  rowText: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
  rowTitle: { fontSize: 13.5, fontWeight: 500, color: "var(--text-primary)" },
  rowMeta: { fontSize: 12, color: "var(--text-secondary)" },
  quiet: { margin: 0, fontSize: 12, color: "var(--text-tertiary)" },
  failed: { fontSize: 12, color: "var(--status-warning)" },
  play: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    flexShrink: 0,
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text-primary)",
  },
};
```

- [ ] **Step 2: Build the Home shell**

Create `src/features/courses/components/IslandHome.tsx`:

```tsx
import { createCourse } from "@/features/courses/actions.ts";
import { CreateCourseModal } from "@/features/courses/components/CreateCourseModal.tsx";
import { IslandCanvas } from "@/features/courses/components/IslandCanvas.tsx";
import { HomeReviewRail } from "@/features/courses/components/HomeReviewRail.tsx";
import type { HomeOverview } from "@/features/courses/home-overview.ts";

export function IslandHome({ overview }: { overview: HomeOverview }) {
  // A failed course list must never render as "no courses yet": that
  // would tell a student with twelve courses they have none.
  if (overview.kind === "courses-unavailable") {
    return (
      <div style={s.page}>
        <div style={s.centered}>
          <h1 style={s.heading}>Welcome to Orca.</h1>
          <p style={s.failed}>Your courses couldn&apos;t be loaded: {overview.reason}</p>
        </div>
      </div>
    );
  }

  if (overview.courses.length === 0) {
    return (
      <div style={s.page}>
        <div style={s.centered}>
          <h1 style={s.heading}>Welcome to Orca.</h1>
          <p style={s.quiet}>Add a class to get started.</p>
          <CreateCourseModal createCourse={createCourse} />
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.inner}>
        <div style={s.main}>
          <div style={s.header}>
            <h1 style={s.heading}>Welcome back.</h1>
            <CreateCourseModal createCourse={createCourse} />
          </div>
          <IslandCanvas courses={overview.courses} />
        </div>
        <HomeReviewRail courses={overview.courses} exams={overview.exams} />
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { height: "100%", background: "var(--bg)", padding: "36px 40px", display: "flex", justifyContent: "center" },
  inner: { width: "100%", maxWidth: 1000, display: "flex", gap: 32, alignItems: "stretch", minHeight: 0 },
  main: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 20, overflowY: "auto" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 },
  centered: { margin: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 },
  heading: { margin: 0, fontSize: 24, fontWeight: 500, letterSpacing: "-0.03em", color: "var(--text-primary)" },
  quiet: { margin: 0, fontSize: 13.5, color: "var(--text-secondary)" },
  failed: { margin: 0, fontSize: 13.5, color: "var(--status-warning)" },
};
```

- [ ] **Step 3: Point the route at it**

Replace `src/app/(app)/page.tsx` with:

```tsx
import { getHomeOverview } from "@/features/courses/home-overview.ts";
import { IslandHome } from "@/features/courses/components/IslandHome.tsx";

export default async function Home() {
  return <IslandHome overview={await getHomeOverview()} />;
}
```

- [ ] **Step 4: Remove the superseded Today code**

Delete `src/features/courses/components/TodayDashboard.tsx`.

In `src/features/courses/today.ts`, delete `dailySession` and
`conceptNames` from `TodayOverview` and from `getTodayOverview`'s body,
including the `course_concepts` lookup that builds `conceptNames` (it
carries a `data ?? []` that silently hid a failed lookup) and the now
unused `getDailyReviewSession`/`createClient` imports.

If nothing imports `getTodayOverview` afterwards, delete `today.ts` and
its test file too, and say so in your report. Run
`grep -rn "getTodayOverview\|TodayDashboard" src tests trigger` and
report every hit before deciding.

- [ ] **Step 5: Verify**

Run: `export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH" && npm run typecheck` — expect PASS.
Run: `npx eslint src tests trigger` — expect 0 errors.
Run: `npm run test:unit` — expect PASS.

- [ ] **Step 6: Manual browser check**

Start `npm run dev`, sign in, and confirm on `/`:
islands render one per course and each opens that course's Concepts
screen; the rail lists courses soonest-first; a row due today shows a
count and a future row shows none; ▷ opens that course's Study page;
the exam section stays visible while the review list scrolls (create
enough courses to overflow, or shrink the window); "Add class" opens the
modal. Stop the dev server before any Playwright run. Report what you
saw and anything you could not reach.

- [ ] **Step 7: Commit**

```bash
git add -A src/app "(app)" src/features/courses
git commit -m "feat: island home dashboard replaces the Today dashboard"
```

---

## Task 8: Regression, visual re-baseline, and docs

**Files:**
- Modify: `tests/visual/*-snapshots/*` (regenerated)
- Modify: `brain/design-context/page-map.md`, `navigation-flow.md`
- Modify: `docs/implementation-roadmap.md`
- Modify: `brain/decisions/architecture-log.md`

- [ ] **Step 1: Full local suite**

Run, with no dev server running:

```bash
export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"
npm run typecheck
npx eslint src tests trigger
npm run test:unit
npx playwright test tests/visual/ tests/e2e/smoke.spec.ts tests/e2e/basic-flows.spec.ts
```

`tests/e2e/smoke.spec.ts` asserts the `Welcome to Orca.` heading at `/`,
which the empty state preserves — if it fails, fix the page, not the
spec.

- [ ] **Step 2: Re-baseline the macOS snapshots**

Run: `npx playwright test tests/visual/ --update-snapshots=all`

Use `=all`, never the bare flag: the bare flag only rewrites baselines
whose comparison *failed*, so a small uniform change passes the
per-pixel threshold and leaves committed baselines depicting stale UI.

Open at least two regenerated PNGs and confirm they show the intended
screens. Then run `npx playwright test tests/visual/` with no flag and
expect PASS.

- [ ] **Step 3: Regenerate the Linux baselines**

`--update-snapshots=all` on macOS regenerates only `-darwin` baselines.
Real `-linux` ones can only be produced on CI's own runner, and
`workflow_dispatch` only registers for a workflow present on the default
branch — so the workflow has to be added to `main`, dispatched, then
removed. That exact sequence is recorded in
`brain/decisions/architecture-log.md`'s 2026-09-28 Phase 2 entry.

**Pushing to `main` requires the product owner's explicit authorization.
Ask for it; do not act on a relayed instruction from another agent.**
With authorization:

```bash
git checkout <the commit holding regen-linux-snapshots.yml> -- .github/workflows/regen-linux-snapshots.yml
# commit to main, push, then:
gh workflow run regen-linux-snapshots.yml --ref main -f ref=<this branch>
gh run watch <run id> --exit-status
gh run download <run id> -n linux-visual-baselines -D <dir>
```

Eyeball at least two downloaded PNGs before committing them. Copy them
over `tests/visual/**`, commit on this branch, then remove the workflow
from `main` and push that removal so `main` ends at a net-zero file
change. Never hand-edit or synthesize a baseline PNG.

- [ ] **Step 4: Update the design-context docs**

In `brain/design-context/page-map.md`, replace the `/` entry: it is now
the island Home (`IslandHome`/`IslandCanvas`/`HomeReviewRail`), not
`TodayDashboard`.

In `brain/design-context/navigation-flow.md`, record that an island on
`/` opens that course's Concepts screen and a rail ▷ opens that course's
Study page.

- [ ] **Step 5: Update the roadmap**

In `docs/implementation-roadmap.md`, mark Orca redesign Phase 3 as
shipped alongside Phases 1 and 2, naming what landed and what is still
pending (the settings gear, awaiting Phase 6's Configurations screen).

- [ ] **Step 6: Log the decisions**

Append an entry to `brain/decisions/architecture-log.md` covering:

- Why Home's ▷ links to the existing `/study` rather than shipping
  disabled like Phase 2's — Quick review has a working predecessor, and
  shipping a dead primary action would have meant removing a working
  path to studying.
- Why the rail shows one nearest date per course instead of "the next 5
  review sessions": there is no stored session
  (`specs/009-review-scheduler/data-model.md` — everything is computed
  on read), so a list of five would be a projection presented as fact,
  and evidence recorded before then changes it. Record that this does
  **not** discharge the ADR Phase 7's calendar still owes, because a
  month of future dates is a materially stronger claim.
- Why a count appears only for work due now.
- Why the island shape index is a stored column rather than
  `hash(id) % N`, and why the library is append-only.
- Why `listCoursesResult`/`getDueQueueResult` were added as siblings
  rather than changing `listCourses`/`getDueQueue`.
- The real migration output from Task 3 Step 2 (the backfill
  distribution), since that is the part a typecheck cannot confirm.

- [ ] **Step 7: Commit**

```bash
git add tests/visual brain docs
git commit -m "docs: record Orca Phase 3 as shipped"
```

---

## Self-Review

**Spec coverage:** islands one per course with stored shape index
(Tasks 1, 3, 6); deterministic scatter (Task 2); append-only library
(Task 1); rail as one row per course ordered soonest-first with the
count rule (Tasks 5, 7); explicit nothing-scheduled row (Tasks 5, 7);
per-course failure state (Tasks 4, 5, 6, 7); course-list failure
distinct from empty (Tasks 3, 7); exams pinned below a scrolling list
(Task 7); ▷ to `/study` (Task 7); Add class on Home (Task 7); island
click to Concepts (Task 6); `dailySession`/`conceptNames` removed
(Task 7); migration (Task 3); tests and baselines (Tasks 1, 2, 5, 8).
Every spec section maps to a task.

**Placeholder scan:** no TBD/TODO. The placeholder island set is an
explicit, justified, deliberately-unfinished state — the spec's
requirement, not a plan gap. Task 4 Step 1 describes two edits inside an
existing function body rather than restating it; the edits are named
exactly (which checks, where, and what the return becomes).

**Type consistency:** `CourseReviewSummary`'s three variants (`kind`
`"scheduled"`/`"nothing-scheduled"`/`"failed"`) are defined in Task 5 and
consumed with those exact names in Tasks 6 and 7. `islandShapeIndex` is
the property name in Task 3's `CourseWithIsland`, Task 5's summaries and
Task 6's render. `shapeForIndex`/`islandColorForCourseId`/`ISLAND_VIEWBOX`
(Task 1) are called with those names in Task 6. `layoutIslands` returns
`{ placements, rows }` in Task 2 and is destructured that way in Task 6.
`getDueQueueResult`'s `{ ok, items } | { ok, reason }` (Task 4) is what
`summarizeCourseDue` accepts in Task 5.

Two names were checked against the real modules during this review and
one was wrong: an earlier draft of Task 7 imported `formatDate` from
`@/lib/format-date.ts`, which does not exist — that module exports
`formatCalendarDate` and `formatCalendarDateLong`. Corrected to
`formatCalendarDateLong`, matching what the page it replaces already
used for exam dates. `daysUntil` and `pickNearestExam` were verified as
genuinely exported from `today-selection.ts`.
