# Page map (current, real routes)

Every route that exists in `src/app` today, what's actually rendered on it,
and its real component-level building blocks. This reflects the current
unstyled MVP state (plain semantic HTML, no CSS framework) — see
`tech-constraints.md` for what that means for a design pass.

## `/` — Island Home (`src/app/(app)/page.tsx`)
There is no separate static landing page — `/` resolves directly to
`IslandHome` (`getHomeOverview` + `<IslandHome>`), the same page reached
after sign-in. `TodayDashboard`/`today.ts` (the pre-redesign Home, which
predates the Orca work entirely — see the 2026-09-17 entries) were
deleted in Orca Phase 3; this is a full replacement, not a restyle.

One island per course (`IslandCanvas`, deterministic scatter over a fixed
3-column grid, shape from a stored `islandShapeIndex`, color hashed from
the course id — see `island-shapes.ts`/`island-layout.ts`), a "Welcome
back." heading with the `CreateCourseModal` trigger, and a right-hand
rail (`HomeReviewRail`) listing every course's next review session
soonest-first, with an "Upcoming exams" section pinned below the rail's
own scroll region. Empty-courses and courses-unavailable both render an
explicit state — see `navigation-flow.md` for how the two link targets
(island vs. rail ▷) differ. Heading now reads "Welcome to Orca." on the
empty state, "Welcome back." once at least one course exists, per
`brand-identity.md`.

## `/sign-in`, `/sign-up`
Plain email/password forms (`<input type=email>`, `<input type=password>`),
one submit button, inline error text (`role="alert"`), a link to the other
auth page. Supabase Auth (GoTrue) underneath — no OAuth/social buttons.

## `/courses` — Course list (post-login landing)
List of the signed-in user's courses (`<Link>` per course → course detail),
empty state ("You haven't created a course yet"), and an "Add class"
trigger that opens `CreateCourseModal` (`role="dialog"`, `aria-modal="true"`,
a labelled close button) rather than the inline name-input form this page
used to render directly. This is the real first screen after sign-in —
there is no separate "dashboard."

## `/courses/[courseId]` — Concept path (course landing page, Orca Phase 2)
No longer the material-upload page (that moved to `/courses/[courseId]/material`,
below). This is now where a course opens: `ConceptPath` — the course's
concepts grouped under unit headers (`groupConceptsByUnit`), each concept
row showing mastery as a word plus a color, not color alone. A concept
whose `unit_id` points at an archived unit (filtered out of `listUnits`)
falls into an explicit "Unassigned" section rather than disappearing.
Above the grouped list, `DueRail` shows due-today/due-tomorrow cards,
reusing `DueQueueItem.dueLabel` verbatim from the existing due-queue
logic. Both screens' ▷ ("start review") controls render via
`PendingActionButton` — visibly disabled, each carrying its own reason
("Deep review is not built yet" on concept rows, "Quick review is not
built yet" on the due rail) — Quick/Deep review are later phases, not
implemented yet.

The `CourseShell` sub-nav (see below) is the way to reach every other
per-course page, same as before; Concepts is now its first, default tab.

## `/courses/[courseId]/material` — Material upload
`<h1>Course material</h1>` plus `ArtifactBoard` — a file-upload form
(drag/click, accepts pdf/png/jpg/jpeg/heic/webp) plus a live list of
uploaded artifacts, each with a status label (Queued / Processing… /
Ready / Failed) that updates in place via a Supabase Realtime
subscription — no polling, no reload. Failed artifacts show their real
failure reason inline. This is the page that used to live at
`/courses/[courseId]` before Orca Phase 2 moved the course root to the
Concepts screen above; its visual spec (`tests/visual/review-queue.spec.ts`)
moved with it, retargeted to this new path.

Reached via the `CourseShell` sub-nav, now six entries: Concepts |
Material | Atlas | Review | Tutor | Exam plan.

## `/courses/[courseId]/atlas` — Concept Atlas
The product's signature screen (see `brain/product/concept-atlas.md`).
A full-canvas graph (React Flow + ELK auto-layout) of concepts and their
relationships, grouped into collapsible "unit" regions. Three node/edge
types render differently: `ConceptNode` (mastery ring + color + discrete
state, not color alone), `UnitGroupNode` (collapsible bounding region),
`RelationshipEdge` (weak/strong relationships are visually distinct, not
just weak nodes). Clicking a concept opens a `ConceptDetailPanel` — a
side panel showing mastery detail and evidence provenance ("why do you
think I know/don't know this") without the graph itself rearranging.
Students can flag a concept/relationship as wrong (feedback, not a
rewrite of the ontology — see `brain/product/concept-atlas.md`).
Standard React Flow chrome: `<Background />` (dot grid), `<Controls />`
(zoom/fit buttons). No `MiniMap` currently rendered.

## `/courses/[courseId]/review` — Review Queue
A ranked list (`ReviewQueue` component) of concepts due for review,
already sorted by priority (spaced-repetition-style urgency). List-based,
not graph-based — a triage view, distinct in purpose from the Atlas.

## `/courses/[courseId]/tutor` — Tutor
A chat interface (`TutorChat`): message history (student + AI turns) and
a text input. Conversational, course-scoped — this is the one page whose
content is genuinely open-ended/LLM-authored per turn, unlike every other
page's deterministic content.

## `/courses/[courseId]/study` — Study (daily review session)
`StudySession` — a queue of due questions presented one at a time. Two
answer modes exist depending on the question's checker domain: a free-text
answer form, or a `StructuredAnswerForm` (a JSON-textarea for graph/tree
"claimed answer" domains — see `tech-constraints.md` on why this isn't a
richer input yet). Shows pass/fail + grading detail after each submit, and
a "load more" control that pulls the next batch without a page reload.

## `/courses/[courseId]/exam-plan` — Exam Planner
`ExamPlanner` — an exam date/scope configuration form (which units/concepts
are in scope, available time budget) that, once configured, shows: a staged
prep plan (sessions that ramp from diagnostic → interleaving → timed
transfer → high-value-weakness cramming) and an exam-readiness dashboard
(where the student stands against the exam's scope). Reuses the same
question-answering UI as Study once a session's underway.

## `/courses/[courseId]/visual-assessment/[questionId]` — Visual Assessment
A canvas (`QuestionCanvas`) for graph/tree-domain questions specifically
(bfs-dfs, topological-sort, shortest-path, tree-traversal, tree-insertion)
— the student draws/marks up a pre-laid-out graph or tree (ELK-computed
layout, non-interactive positions) rather than typing a claimed answer.
Not reachable from the course-detail nav yet — currently only linked from
inside Study/Exam-plan sessions when a due question happens to be one of
these checker domains.

## `/chat` — AI Chat entry (top-level, Orca Phase 2)
A new third bottom-nav tab. `CoursePicker` lists the signed-in user's
courses; picking one routes to that course's `/courses/[courseId]/tutor`
— there is no message input on `/chat` itself, deliberately. This exists
instead of relaxing `tutor_conversations.course_id` to allow a
course-less conversation: the schema's NOT NULL constraint grounds every
tutor turn in one course's material, and a picker screen preserves that
grounding while still giving chat its own top-level entry point.

## Global chrome
`SiteHeader` (`src/features/auth/site-header.tsx`) — present on every page
via the root layout. `AppShell` (`src/components/app-shell.tsx`) renders
the bottom icon nav bar, now three entries: Today, Courses, Chat (Orca
Phase 2 added Chat; Today and Courses predate it). All per-course
navigation lives inside `CourseShell`'s own sub-nav, not globally.
