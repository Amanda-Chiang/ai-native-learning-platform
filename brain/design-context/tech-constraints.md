# Frontend tech constraints (what's actually feasible)

Real `package.json` dependencies relevant to frontend, as of this writing —
nothing here is aspirational.

## What exists today

- **Next.js (App Router) + React + TypeScript.** Server Components by
  default; pages fetch data server-side and pass results (and, where
  needed, real `"use server"`-marked functions) into Client Components.
- **`@xyflow/react` (React Flow) + `elkjs`** — the Concept Atlas's only
  rendering/layout stack. ELK computes node positions (a real graph
  layout algorithm, not force-directed physics); React Flow renders them
  with custom node/edge components (`ConceptNode`, `UnitGroupNode`,
  `RelationshipEdge`). Any redesign of the Atlas's *visual* language
  (colors, node card contents, edge styling, panel layout) is fully
  feasible within this stack. A redesign that assumes a *different*
  graph-rendering paradigm (e.g. a canvas/WebGL force-directed layout, a
  3D graph, an infinite-zoom minimap-driven explorer) is not a styling
  change — it's a new rendering library, which `CLAUDE.md`'s own
  invariant rules require an ADR for before adding
  (`brain/decisions/architecture-log.md`). Treat "keep React
  Flow + ELK, redesign what renders inside it" as the default assumption
  unless a genuinely justified need says otherwise.
- **Plain CSS only.** No Tailwind, no CSS-in-JS, no component library
  (no MUI/Chakra/Radix/shadcn), no animation library (no Framer Motion).
  `globals.css` + inline `style={{}}` is the entire styling surface right
  now. This means:
  - A design system proposal needs to pick *something* to implement
    in — plain CSS (possibly with CSS custom properties for tokens),
    or justify adding one dependency (e.g. Tailwind) against the
    project's "don't add a new dependency when an existing one already
    solves the problem" rule. Tailwind isn't *already* solved by
    anything present, so it's a legitimate ask if proposed — but it
    should be an explicit, named decision, not an assumed given.
  - There is currently zero design token system, zero shared component
    library, zero shared layout primitives (no `<Button>`, no `<Card>`).
    Every page reimplements its own markup from scratch. A real design
    system pass has a genuinely blank canvas here — this is a strength,
    not just a gap, for whoever designs next.
- **Geist Sans / Geist Mono** (`next/font/google`) — already wired into
  the root layout as CSS variables (`--font-geist-sans`,
  `--font-geist-mono`). Free to keep, free to replace (single point of
  change in `src/app/layout.tsx`).
- **Supabase Realtime** (`postgres_changes` subscriptions) is the
  mechanism behind "live" UI updates (artifact status, in principle
  anything else backed by a Supabase table) — no polling anywhere.
  Any redesign that wants live-updating UI elsewhere in the product can
  lean on this same mechanism; it's already a proven pattern
  (`ArtifactBoard.tsx`), not a new capability to build.
- **No animation/motion library.** Any micro-interaction/motion design
  in a redesign proposal needs to either use plain CSS transitions
  (free, no new dependency) or explicitly name a new library as a
  decision to make, not assume.
- **No icon library.** No Lucide/Heroicons/etc. installed. Same
  either/or as above.
- **No image/asset pipeline beyond Next's built-in `next/image`.**

## Structured-answer inputs (a real, current UX rough edge)

`StructuredAnswerForm` (used in Study and Exam-plan sessions for
graph/tree checker-domain questions) is currently a raw JSON textarea —
the student hand-types a JSON object matching a `CLAIM_TEMPLATE_BY_DOMAIN`
shape. This is a genuine, known gap: the *intended* experience for these
domains is the Visual Assessment canvas (draw/mark up a graph or tree
directly), but that canvas is currently only used for a subset of flows,
not universally swapped in for every structured question. A design pass
that proposes replacing the JSON textarea with something more graphical
for every structured-answer instance is directionally right and matches
existing product intent — it isn't inventing a new capability, since
`QuestionCanvas`/`layoutGraph`/`layoutTree` already exist and do exactly
this for the flows that already use them.

## Deterministic vs. LLM-authored content (relevant to what a page can promise)

Per `CLAUDE.md`'s invariant rules: content is deterministic (backed by
real course/learner state, checkable, source-anchored) everywhere except
the Tutor chat, which is genuinely open-ended LLM output turn-by-turn. A
design pass should treat Tutor as the one page where "the AI might say
anything reasonable" is a real constraint on layout (e.g. variable-length
messages, no fixed content shape) — every other page's content has a
fixed, predictable shape a design can rely on.

## Renderer-neutral graph data (an architectural invariant, not a style choice)

The canonical `CourseGraph` DTO (concepts, relationships, mastery state)
is renderer-neutral by explicit project rule — it carries no React
Flow-specific coordinates or state. All renderer-specific data (node
positions, view-only UI state) lives in a separate adapter layer
(`courseGraphToReactFlowElements`, `focus-dimming.ts`, etc.). This means:
a redesign can freely change how the DTO is *visualized* without ever
needing to touch what the DTO *contains* — a real, load-bearing
separation any redesign proposal can safely assume stays intact.
