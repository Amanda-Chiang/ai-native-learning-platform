# Page map (current, real routes)

Every route that exists in `src/app` today, what's actually rendered on it,
and its real component-level building blocks. This reflects the current
unstyled MVP state (plain semantic HTML, no CSS framework) — see
`tech-constraints.md` for what that means for a design pass.

## `/` — Landing (`src/app/page.tsx`)
Static. `<h1>AI-Native Learning Platform</h1>` + one line of body text.
No nav, no CTA button yet. Real placeholder for a real landing page.

## `/sign-in`, `/sign-up`
Plain email/password forms (`<input type=email>`, `<input type=password>`),
one submit button, inline error text (`role="alert"`), a link to the other
auth page. Supabase Auth (GoTrue) underneath — no OAuth/social buttons.

## `/courses` — Course list (post-login landing)
List of the signed-in user's courses (`<Link>` per course → course detail),
empty state ("You haven't created a course yet"), and a create-course form
(name input + submit) below the list. This is the real first screen after
sign-in — there is no separate "dashboard."

## `/courses/[courseId]` — Course detail / material upload
`<h1>Course material</h1>`, then a `<nav>` with 5 links (Concept atlas |
Review queue | Tutor | Study | Exam plan) — this nav is the *only* way to
reach any other feature for a course; nothing else links to these pages.
Below the nav: `ArtifactBoard` — a file-upload form (drag/click, accepts
pdf/png/jpg/jpeg/heic/webp) plus a live list of uploaded artifacts, each
with a status label (Queued / Processing… / Ready / Failed) that updates
in place via a Supabase Realtime subscription — no polling, no reload.
Failed artifacts show their real failure reason inline.

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

## Global chrome
`SiteHeader` (`src/features/auth/site-header.tsx`) — present on every page
via the root layout. Minimal: no persistent app-wide nav beyond whatever
this renders (sign-in state / sign-out control). All per-course navigation
lives inside the course-detail page's own `<nav>`, not globally.
