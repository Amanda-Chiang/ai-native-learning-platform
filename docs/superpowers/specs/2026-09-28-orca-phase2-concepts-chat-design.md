# Orca redesign Phase 2 — course creation, Concepts screen, AI Chat entry

**Status:** approved 2026-09-28, not yet implemented.
**Phase:** 2 of 9 in `docs/superpowers/specs/2026-09-27-orca-redesign-design.md`'s
build sequence. Phase 1 (rebrand + app shell) shipped 2026-09-27/28.
**Source of truth for the visuals:** `UX_snapshots.pdf` (hand-drawn
wireframes). Three screens from it are in scope here: the per-course
concept path, the AI Chat empty state, and the "Class Name" creation
screen.

## Scope

Three screens, all frontend over existing server actions, plus one
small new read action and one route move:

1. **Concepts screen** — becomes the course landing page.
2. **AI Chat entry** — a new top-level tab with a course picker.
3. **Course creation** — a modal over the course list.

Deliberately **not** in scope: Deep review (Phase 9), Quick review quiz
flow (Phase 4), Home dashboard islands (Phase 3), and any change to the
Concept Atlas, grading, evidence, or ontology reconciliation.

## The sequencing problem this design accepts on purpose

The wireframe's Concepts screen is, interactionally, a launcher for two
phases that do not exist yet:

- The ▷ on each concept row launches **Deep review** — Phase 9, which
  the parent design doc explicitly leaves undesigned ("isn't fully
  fleshed out yet"). Confirmed directly with the product owner during
  this brainstorm: ▷ means Deep review, not Quick review.
- The ▷ on the "Due today / Due tomorrow" rail launches the **Quick
  review quiz flow** — Phase 4.

Decision (product owner, this brainstorm): **build the screen now with
both buttons explicitly disabled.** A disabled control that says
"Deep review — not built yet" is an honest, visible incomplete state,
per `CLAUDE.md`'s no-silent-placeholders rule. The rejected alternative
was wiring ▷ to Quick review as a temporary stand-in: that would make
the button do something other than what it will eventually do, which is
precisely the "plausible-looking stand-in" the rule forbids.

Everything else on the screen is real data, so this is a real screen
with a pending action — not a mock.

## Screen 1 — Concepts (course landing page)

### Route change

| Route | Today | After |
|---|---|---|
| `/courses/[courseId]` | Material (artifacts, units, extraction Review Queue popup) | Concept path |
| `/courses/[courseId]/material` | does not exist | Material, moved verbatim |

`CourseShell`'s `SUB_NAV` (`src/components/course-shell.tsx`) gains a
`Concepts` entry at path `""` and Material moves to `"material"`. Tab
order otherwise unchanged; Atlas/Review/Tutor/Exam plan untouched.

**Constraint found during design, not during implementation:** the
current `/courses/[courseId]` page also hosts the `courseId === "demo"`
fixture branch that `tests/visual/review-queue.spec.ts` asserts
against. That fixture branch moves with the Material page, and the
visual spec retargets to `/courses/demo/material`. This is a test edit
that follows the code, not a weakened assertion — the spec keeps
asserting exactly what it asserts today.

### Content

A server component reading, in parallel:
- `listUnits(courseId)` — existing action.
- the course's concepts (`course_concepts`, statuses `confirmed` and
  `proposed`, matching what `getDailyReviewSession` already considers
  quiz-eligible).
- `getDueQueue(courseId)` — existing action, for the right rail.

**Grouping and order:** concepts grouped under their unit headers, units
in their existing order. A real course produces 30+ concepts, so the
wireframe's five-row path is a scrolling, unit-sectioned list in
practice — confirmed with the product owner. Concepts whose `unit_id`
is null render under an explicit "Unassigned" header; they are never
silently dropped, and the header is a real state, not a placeholder.

**Each concept row:** name, mastery state, and a ▷ that is rendered
disabled with a visible reason ("Deep review — not built yet"). The
disabled state is a first-class rendering, not a greyed no-op: a
screen-reader user gets the same reason a sighted user does
(`aria-disabled` plus the reason as the accessible description).

**Right rail:** "Due today" / "Due tomorrow" cards fed by `getDueQueue`.
No new bucketing logic is needed — `due-queue-bucketing.ts`'s existing
`bucketFor` already emits exactly the labels "Due today" and "Due
tomorrow" (`daysUntilDue === 0` and `=== 1`). The rail's own ▷ is
disabled the same way, pending Phase 4.

### The one new action

`getDailyReviewSession(courseId)` selects only concepts that are *due*,
ranked by priority — there is no existing path to "the concepts of this
course, grouped by unit, with their mastery state." The parent design
doc's audit marked this screen "compatible as-is"; that was optimistic.
This phase adds one thin read action (a `listCourseConcepts`-shaped
function returning concept id/name/unit/mastery) and one pure grouping
function. No schema change, no new table, no change to any existing
action's behavior.

## Screen 2 — AI Chat entry

New top-level route `/chat`, reached from a new **Chat** entry in the
bottom nav (Today / Courses / Chat), matching the wireframe's
multi-icon bottom bar.

Renders the wireframe's empty state: "What would you like to learn
today?" with a bottom input bar.

`tutor_conversations.course_id` is a NOT NULL foreign key, so a
conversation cannot exist without a course. Rather than relax that
constraint (which would weaken the tutor's grounding invariant — every
tutor answer is grounded in one course's confirmed material), the
picker resolves a course *before* the first message, then calls the
existing `startConversation(courseId)` and hands off to the existing
tutor UI. No schema change; no change to `sendTutorMessage` or to any
grounding logic.

## Screen 3 — Create course modal

`CreateCourseForm` moves into a modal over `/courses`, opened by an
"add class" control. Single "Class Name" field. The existing
`createCourse(name)` server action is unchanged.

The inline form is removed from the page body so there is exactly one
way to create a course, not two.

## Testing

- **Unit:** the pure grouping/ordering function — concepts under units,
  unit order preserved, null-unit concepts under "Unassigned", empty
  course. Test-first, per this project's convention for pure logic.
- **E2E:** course landing renders the path; Material is reachable at its
  new route; the chat picker creates a real conversation against a real
  Supabase project.
- **Visual:** re-baseline with `--update-snapshots=all` on both
  platforms. Plain `--update-snapshots` only rewrites baselines whose
  comparison *failed*, and a small uniform change can pass under
  Playwright's per-pixel threshold while leaving committed baselines
  depicting stale UI (architecture-log, 2026-09-28).
- **Accessibility:** the disabled ▷ exposes its reason to assistive
  tech, not only visually.

## Open questions deferred by design

- What Deep review actually does when ▷ is enabled (Phase 9).
- Whether the Concepts path eventually shows prerequisite edges as a
  literal winding trail; the wireframe draws one, but with 30+ concepts
  grouped by unit, a trail is a visual treatment to revisit once real
  courses are on the screen.

## Spec self-review

- **Placeholder scan:** the one deliberate incomplete state (disabled
  ▷) is explicit, justified, and visible to users and assistive tech.
  No TBDs.
- **Internal consistency:** the route table, `SUB_NAV` change, and the
  visual-spec retarget all describe the same move.
- **Scope check:** three screens, one thin read action, one route move —
  a single implementation plan.
- **Ambiguity check:** "playable" is pinned to Deep review, not Quick
  review; path rows are `course_concepts`, not units; both were
  explicitly resolved with the product owner rather than assumed.
