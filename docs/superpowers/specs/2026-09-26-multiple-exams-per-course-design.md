# Multiple exams per course — design

**Status:** Approved (brainstormed interactively 2026-09-25/26), proceeding to implementation.
**Type:** Enhancement to an already-shipped feature (`exam-planner`,
`specs/010-exam-planner`), not a new Spec Kit feature — same rationale as
the lightweight-quiz and unit-extraction-reconciliation enhancements: this
changes already-shipped behavior rather than adding a net-new capability
with its own user stories.

## Problem

A student can only ever configure one exam per course. `configureExam`
(`src/features/exam-planner/actions.ts`) looks up an existing
`exam_configs` row by `(user_id, course_id)` and updates it in place if
one exists, rather than inserting a new row — so configuring a second
exam for the same course silently overwrites the first one's date and
scope. `getExamConfig`/`getExamPlan`/`getExamReadiness` all assume at
most one row per course (`.maybeSingle()` scoped only by `course_id`).

This is purely an application-logic limit, not a schema one:
`0008_exam_planner.sql`'s `exam_configs` table has no unique constraint
on `(user_id, course_id)` — nothing in the database prevents multiple
rows today. **No migration is needed.**

A separate, real gap found while investigating: once an exam is
configured, the UI (`ExamPlanner.tsx`) never exposes a way to edit or
delete it — the config form simply disappears once `config` is non-null.
`configureExam`'s update path is technically reachable (if
`getExamConfig` ever returned an existing row and the form were shown
again) but nothing in the UI ever calls it. This lands as a real
capability gap regardless of the multi-exam question, so it's fixed
here rather than left as a second inconsistency.

## Decisions (from brainstorming)

- **No name/label field.** Exams are distinguished purely by date. A
  course having two exams on the same date is not defended against (not
  a realistic case worth validating for).
- **Dropdown selector** on the Exam Plan page switches which exam's
  staged plan + readiness is shown — no new route, no tabs.
- **Add + Edit + Delete**, not just Add. Closes the existing edit gap
  described above while adding multi-exam support in the same pass.
- **Past exams stay selectable** in the dropdown (e.g. "10/1/2026
  (past)") rather than disappearing — matches this project's general
  "don't hide real data" convention (same reasoning `rejectCandidate`
  archives instead of deletes).
- **Every exam competes for Today's slots.** Today's dashboard picks its
  "nearest exam" banner and top-3 "Upcoming" sidebar from *all*
  configured exams across all courses, not one per course — a course
  with two near-term exams can occupy two Today slots.

## Design

### 1. Actions layer (`src/features/exam-planner/actions.ts`)

- `configureExam(courseId, examDate, scopeConceptIds, scopeUnitIds)`
  drops its "find existing row for this course, update it" logic
  entirely and always **inserts** a new `exam_configs` row. (The
  existing `resolveScopeExists` pre-check is unchanged.)
- New `updateExamConfig(examConfigId, examDate, scopeConceptIds,
  scopeUnitIds): Promise<{ error: string | null }>` — updates one
  specific row. Re-runs `resolveScopeExists` against that row's own
  `course_id` (fetched first, not trusted from the caller) before
  writing, same validation `configureExam` already does. RLS
  (`exam_configs_update_own`, `user_id = auth.uid()`) is the
  authorization boundary; no separate ownership check needed beyond
  that, matching this codebase's existing convention for
  student-owned-row actions.
- New `deleteExamConfig(examConfigId): Promise<{ error: string | null
  }>` — deletes one row. RLS (`exam_configs_delete_own`) bounds it to
  the caller's own rows.
- New `listExamConfigs(courseId): Promise<ExamConfigView[]>` — every
  exam for the course, `order("exam_date")`. Used to populate the
  dropdown and to compute Today's aggregation.
- `getExamPlan`/`getExamReadiness` change from `(courseId)` +
  `.eq("course_id", courseId).maybeSingle()` to `(examConfigId)` +
  `.eq("id", examConfigId).single()`. Both now derive `courseId` from
  the fetched row (`config.course_id`) for every downstream query,
  rather than accepting a separately-passed `courseId` param — this
  closes a latent (if low-severity, RLS-bounded) gap where the two
  params could disagree, the same "derive the trusted value from the
  row you already fetched, don't re-trust a second caller-supplied
  copy" pattern `extract-course-graph.ts`'s `target_unit_id` handling
  already established.
- `getExamConfig` is removed — nothing needs "the one exam for this
  course" as a concept anymore; `listExamConfigs` plus a client-side
  pick (see below) replaces its every caller.

### 2. Exam Plan page (`exam-plan/page.tsx` + `ExamPlanner.tsx`)

- **Server side:** loads `listExamConfigs(courseId)`. Picks a default
  selection: the nearest *upcoming* exam if any exist, else the most
  recent *past* one, else `null` (no exams configured yet — shows the
  create form immediately, same as today's empty state). Supports an
  optional `?exam=<id>` search param (validated against the loaded
  list — an unknown/foreign id falls back to the same default logic,
  never trusted blindly) so a link from elsewhere can deep-link to one
  specific exam; Today's "Upcoming" sidebar links use this. Loads
  `getExamPlan`/`getExamReadiness` for whichever exam id was resolved.
- **Client side (`ExamPlanner.tsx`):**
  - A `<select>` listing every configured exam by date (past ones
    suffixed "(past)"), plus a distinct "+ Add exam" option/button.
  - Picking an existing exam calls a new lightweight server action
    (`getExamPlan`/`getExamReadiness` directly, called from a client
    event handler — Server Actions can be called this way without a
    dedicated wrapper) and swaps the results into local state. This is
    exactly the `plan`/`readiness` `useState` removed on 2026-09-23 as
    dead weight (nothing called `setPlan`/`setReadiness`) — it gets a
    real, load-bearing purpose here. `config` also becomes real
    `useState` again (was flattened to a `const` alias in the same
    cleanup) since selecting a different exam now genuinely changes
    which config is "current."
  - "+ Add exam" reveals the existing configuration form in create
    mode (always calls `configureExam`, i.e. always inserts).
  - The currently-selected exam gets "Edit" (reveals the same form,
    pre-filled with that exam's date/scope, calls `updateExamConfig`)
    and "Delete" (calls `deleteExamConfig`, then
    `window.location.reload()` — same reload-after-mutation pattern
    `handleConfigure` already uses, kept for consistency rather than
    introducing a second refresh mechanism for structural changes).
    Delete asks for confirmation (`window.confirm`, matching the
    lightest-weight existing pattern in this codebase for a
    destructive action with no dedicated confirmation UI elsewhere to
    reuse) before calling the action.

### 3. Today dashboard (`src/features/courses/today.ts`)

- Replaces its one `getExamConfig(course.id)` call per course with
  `listExamConfigs(course.id)`, flattening every course's exam list
  into one array of `NearestExam`-shaped entries before calling the
  existing (unchanged) `pickNearestExam`/`.slice(0, 3)` logic. Multiple
  entries can now share a `courseId` — `pickNearestExam` and the
  existing sort-by-`daysLeft` logic already handle that correctly with
  no changes (they never assumed one-per-course).
- `TodayDashboard.tsx`'s "Upcoming" sidebar links
  (`/courses/${exam.courseId}/exam-plan`) gain the `?exam=${exam.id}`
  query param described above, so clicking a specific upcoming exam
  lands on that exact exam's plan rather than the page's own default
  pick. `NearestExam` gains an `examConfigId` field to carry this
  (currently carries `courseId`/`courseName`/`examDate`/`daysLeft`
  only).

## Implementation notes (found during self-review)

- `exam-plan/page.tsx` today only fetches `listScopeableConcepts` when
  `!config` (the form was only ever shown once, before the first exam
  existed). With Add/Edit always potentially reachable now, this fetch
  becomes unconditional.
- `ConceptScopeSelect.tsx` initializes its `selected` checkbox state to
  an empty `Set` with no way to pre-populate it. Edit mode needs it to
  open pre-checked with the exam's current `scopeConceptIds` — this
  component needs a new (optional, default-empty) `initialSelectedIds`
  prop.
- `TodayDashboard.tsx`'s "Upcoming" list currently keys each card
  `key={exam.courseId}` — a real collision once one course can
  contribute more than one entry to `upcomingExams`. Must become
  `key={exam.examConfigId}`.

## Edge cases

- **Course with zero exams:** unchanged from today — create form shown
  immediately, no dropdown.
- **Deleting the only exam:** page reloads into the zero-exams state
  above.
- **Deleting the currently-Today-linked exam from another tab/session
  before the link is clicked:** `?exam=<id>` resolves to nothing in the
  freshly-loaded list, falls back to the default-pick logic (never a
  crash or a blank page) — same "unknown id degrades to the honest
  default, never an error page" posture as the rest of this codebase's
  query-param handling.
- **Two exams on the same date:** allowed, no special handling; the
  dropdown just shows two identical-looking date labels (acceptable
  per the "no name field" decision above — a real but accepted
  ambiguity, not silently resolved).

## Testing plan

- Unit: none of the pure logic changes shape (`pickNearestExam`,
  `computeExamStages`, `composeStagedPlan`, etc. are untouched) — no
  new pure functions are introduced by this design, so no new unit
  tests are anticipated beyond updating any existing test that directly
  exercises `getExamConfig`'s removed signature.
- Live verification (per this project's standing rule for a real
  Supabase-backed change): configure two real exams for one course,
  confirm both appear in the dropdown, confirm switching between them
  shows each one's own distinct staged plan/readiness, confirm
  edit/delete both work against the correct row (not the other exam's),
  and confirm Today's Upcoming sidebar shows both when both are
  near-term and that clicking one deep-links to the right exam.
