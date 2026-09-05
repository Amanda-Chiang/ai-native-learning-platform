# Handoff prompt — frontend aesthetic/design direction

Paste everything below to another LLM (or use it as a system/task prompt)
to get frontend design direction for this product.

---

## Product

An AI-native learning platform that maintains a persistent, evidence-based
model of a student's understanding across a course — not a flashcard app,
not a generic chatbot tutor. It ingests course materials, extracts a
concept graph, has grounded tutoring conversations, generates course-
grounded practice questions, grades them (deterministically where
possible), and uses the result to schedule what to review next and how to
prep for an exam. The core differentiator is a **persistent, honest model
of what the student actually knows** — exposure (reading, chatting,
uploading notes) is explicitly not treated as mastery; only independent
retrieval/application/transfer moves the needle. The concept graph is the
signature visual surface: units as bounded regions (not a force-directed
hairball), mastery shown via redundant encoding (state + ring + color, not
color alone), weak relationships as visually first-class as weak concepts.

## Target audience

Currently a solo dogfood build — the builder is using their own real
coursework (data structures & algorithms) as the first real content. The
product is designed to be domain-general (any course subject, not
DSA-specific — verified: extraction has been tested against a history
excerpt as well as CS content), aimed eventually at self-directed students
studying real course material for real exams, who want more than a
flashcard app: something that tells them *what they don't actually know
yet* and *what to do about it before the exam*, grounded in their own
course's real material rather than generic content.

## Goals (design-relevant)

1. Make "here's the honest state of what you know, with evidence" feel
   trustworthy and legible at a glance — not gamified, not anxiety-inducing.
2. Make the concept graph genuinely comprehensible as course size grows —
   this is a named product principle (P6), not just a nice-to-have.
3. Preserve "productive friction" — retrieval practice and effortful
   recall are the point; the design shouldn't make it *feel* like the
   answer is always one click away, without becoming punishing or slow
   to use for the parts of the flow that should be low-friction (uploading
   material, navigating between features).
4. Distinguish, visually, between deterministic/grounded content (concept
   graph, review queue, question grading — all backed by real evidence,
   all with source anchors) and the one genuinely open-ended surface
   (the Tutor chat) — the AI can say anything reasonable there; everywhere
   else, content is fixed and checkable.

## What's on each page today (see `page-map.md` for full detail)

- `/` — landing (currently a one-line placeholder, needs real design)
- `/sign-in`, `/sign-up` — plain auth forms
- `/courses` — course list + create-course form (the real post-login home)
- `/courses/{id}` — material upload + a hub `<nav>` to the 5 feature pages
- `/courses/{id}/atlas` — the concept graph (signature screen)
- `/courses/{id}/review` — ranked review queue (list, not graph)
- `/courses/{id}/tutor` — chat interface
- `/courses/{id}/study` — daily review session (one question at a time)
- `/courses/{id}/exam-plan` — exam config + staged prep plan + readiness dashboard
- `/courses/{id}/visual-assessment/{questionId}` — draw-on-a-graph/tree
  question canvas, currently only reachable from inside a Study/Exam-plan
  session (see `navigation-flow.md` for the real gaps in cross-page nav)

## Tech stack and real constraints (see `tech-constraints.md` for full detail)

- Next.js (App Router) + React + TypeScript, Server Components by default.
- **Concept Atlas rendering is locked to React Flow (`@xyflow/react`) +
  ELK (`elkjs`) for layout** — any design direction should assume "restyle
  what renders inside this stack," not "propose a different
  graph-rendering technology." Swapping the rendering library itself would
  need an explicit architecture decision (ADR) first per this project's
  own engineering rules — treat that as out of scope unless there's a
  specific, named reason React Flow can't do what's being proposed.
- **No CSS framework, no component library, no icon library, no animation
  library installed today** — styling is currently plain CSS +
  inline styles only. This is a blank canvas: a full design-system
  proposal (tokens, a shared component set, a chosen styling approach) is
  wanted and has nothing to fight against. If the design calls for adding
  one new dependency (e.g. Tailwind, an icon set), name it explicitly as
  a recommendation rather than assuming it's already available.
- Supabase Realtime already powers live-updating UI (e.g. upload status)
  with no polling — safe to lean on this pattern elsewhere in the design.
- The canonical course-graph data is renderer-neutral by architectural
  rule — the visual design of the Atlas can change freely without any
  backend/data-model implication.

## What's wanted from this design pass

Given all of the above:
1. Propose an overall visual/aesthetic direction (tone, color, typography,
   density) appropriate for this product and audience — not generic
   "clean SaaS" default unless that's genuinely the right call and it's
   argued for, not assumed.
2. Propose a concrete design-token/component-system approach given the
   blank-canvas constraint above (what to standardize: buttons, cards,
   form fields, status indicators, etc.).
3. Propose the Concept Atlas's specific visual language within the
   React-Flow-+-ELK constraint: node card design, unit-region styling,
   mastery encoding (state + ring + color), edge/relationship styling,
   the detail panel's layout.
4. Propose visual treatment that distinguishes deterministic/grounded
   pages from the Tutor's open-ended chat surface.
5. Address the real navigation gaps named in `navigation-flow.md`
   (no cross-links between the 5 feature pages, no breadcrumb back to
   course) as part of the design, not just page-level skinning.
6. Flag anywhere the proposal would require a new frontend dependency,
   explicitly, rather than silently assuming it.

Reference files for full detail: `page-map.md`, `navigation-flow.md`,
`tech-constraints.md` (all in this same directory).
