# Phase 0 Research: Concept Atlas Renderer

No `NEEDS CLARIFICATION` markers were left in the Technical Context. This
file records the resolutions in Decision/Rationale/Alternatives format.

## React Flow package: `@xyflow/react`, not `reactflow`

- **Decision**: install `@xyflow/react`.
- **Rationale**: React Flow was renamed/relicensed under the `@xyflow`
  scope; `reactflow` (the older package name referenced in some older
  PRD-era material) is the deprecated alias. `@xyflow/react` is the
  actively maintained package as of this implementation.
- **Alternatives considered**: `reactflow` (rejected — deprecated
  redirect package, same underlying library but not where fixes land).

## ELK integration: `elkjs/lib/elk.bundled.js`, invoked from a client effect (corrected during implementation)

- **Decision**: run ELK layout via `elkjs`'s browser-safe bundled build
  (`elkjs/lib/elk.bundled.js`), which runs synchronously on the main
  thread, triggered in a `useEffect` after the `CourseGraph` DTO is
  converted to ELK's graph input format, with computed positions merged
  into React Flow node data before render.
- **Correction**: this Phase 0 research entry originally said "web-worker
  build." That was wrong in a way only discovered while actually wiring
  it up (T010/T013): `elkjs`'s default entry point (`import ELK from
  "elkjs"`) auto-detects its environment and, in a bundled context,
  tries `require('web-worker')` -- a dependency that isn't installed and
  isn't resolvable inside Next.js's client webpack bundle, crashing the
  whole page. `elk.bundled.js` is elkjs's own documented alternative
  entry point specifically for bundlers, and it runs synchronously
  instead of trying to spawn a worker.
- **Rationale**: layout for a 20-40 concept graph is fast enough that
  running synchronously on the main thread is not a real responsiveness
  problem in practice -- the worker approach this entry originally
  proposed was solving a performance problem that turned out not to be
  worth the bundler friction it introduced. This still matches PRD
  §13.7's target pipeline: DTO → Graphology (skipped, see below) → ELK →
  React Flow adapter; only the *execution context* changed, not the
  pipeline shape.
- **Alternatives considered**: server-side layout computation (rejected —
  adds a network round-trip for something that runs fast enough
  client-side); manually configuring a worker-loader for elkjs's default
  entry (rejected — `elk.bundled.js` is the officially documented fix for
  exactly this bundler scenario, no custom webpack config needed).

## Edge click-hitboxes can block clicks on nearby nodes (US2 finding)

- **Decision**: set `interactionWidth={6}` on `RelationshipEdge` (down
  from React Flow's default 20px invisible click hitbox around every
  edge) and an explicit `zIndex: 10` on unit group nodes.
- **Rationale**: found while wiring unit-collapse clicks (T020/T021): a
  cross-unit edge's default 20px-wide invisible hitbox routed directly
  over a unit's header text and silently swallowed clicks meant for the
  header, in both Playwright and (since this is a real DOM/CSS
  interaction, not a test-only artifact) actual browser use. Narrowing
  the hitbox and giving unit headers a higher stacking order fixes the
  general case; one specific coincidental edge-routing-through-header
  layout still wasn't fully resolved by either fix alone (see next
  entry) -- the two are complementary, not redundant.
- **Alternatives considered**: `pointerEvents: "none"` on edges entirely
  (rejected -- edges need to stay clickable for US4's "click a weak
  relationship to see why" requirement, so removing interactivity
  entirely isn't an option, only narrowing it).

## Investigated and closed: "related concepts look dimmed" was not a bug (US3)

- **What happened**: after wiring focus-dimming (T023), the
  `focused-concept.png` screenshot showed "Amortized Analysis" and
  "Recurrence Relations" (both directly related to the focused "Big-O
  Notation" concept, confirmed correct in the detail panel's own listed
  relationships) looking visually faded compared to it — looked exactly
  like they were being incorrectly dimmed along with genuinely unrelated
  concepts.
- **Investigation**: rather than trust the visual read, extracted
  `computeRelatedIds`/`applyFocusDimming` out of the client component
  into a standalone, unit-testable module
  (`src/features/concept-atlas/focus-dimming.ts`) and wrote a direct test
  asserting a related node's `style.opacity` is never set to
  `DIMMED_OPACITY`. The test passed on the first try, and the screenshot
  looked identical after the refactor (same behavior, now proven, not
  just refactored) — confirming there was never a dimming bug.
- **Actual explanation**: "unverified" and "weak" mastery states are
  *deliberately* styled with muted colors (dashed gray, thin amber) per
  `visual-language.md`'s own table — sitting next to "Big-O Notation"'s
  bold thick-green "solid" styling, they look faded by contrast even at
  full opacity. Comparing a screenshot against my own visual impression
  wasn't reliable evidence either way here; the direct unit test was.
- **Kept anyway**: the extraction into `focus-dimming.ts` is real
  value independent of whether a bug existed — dimming logic is now
  tested in isolation rather than living untestable inside a "use client"
  component, and future changes to it (e.g. US4 extending it to
  relationship focus) have a regression test to run against.

## Cross-phase fixes discovered while implementing this feature

Two bugs surfaced only once this feature's code actually ran against a
real dev server -- both fixed at the source rather than routed around,
since they would have blocked every future feature's local development
too, not just this one:

- **`src/middleware.ts` crashed every route, not just auth ones, when
  Supabase env vars are unset.** Phase 1's middleware ran
  `createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, ...)`
  unconditionally on every request (its matcher covers the whole app).
  With no live Supabase project configured, this threw immediately and
  took down the entire dev server -- including this feature's atlas page,
  which has nothing to do with auth. Fixed by returning early when the
  env vars are absent, since there is no session to refresh without a
  project anyway. Same fix applied to `SiteHeader` (rendered in the root
  layout, wrapping every page), which had the identical problem one layer
  up.
- **`fitView`'s default `minZoom` (0.5) clipped a wide multi-unit
  course.** The whole-course atlas (5 units spread horizontally) needed
  to zoom out further than 0.5x to fit the viewport; React Flow's default
  zoom floor prevented that, so the leftmost and rightmost units rendered
  partially off-canvas -- a direct violation of spec SC-001. Fixed by
  lowering `minZoom` on the `<ReactFlow>` instance. A second, related fix
  was needed alongside it: concept/unit nodes didn't have explicit
  `width`/`height` set on the node objects themselves (only in CSS
  `style`), which `fitView`'s bounds calculation reads directly -- without
  it, the first `fitView` pass computed bounds from effectively
  zero-size, unmeasured nodes. Both fixes were required together; neither
  alone fully resolved the clipping.

## Graphology: deferred, not added

- **Decision**: do not add Graphology in this feature (see plan.md's
  Primary Dependencies for the full reasoning).
- **Rationale**: PRD §13.6 frames Graphology as an *optional* in-memory
  analysis layer for operations this feature doesn't perform yet
  (neighborhood queries, connected-component/knowledge-island detection,
  filtering/projections). Rendering a given DTO doesn't need any of that.
- **Alternatives considered**: adding it now "since the PRD mentions it"
  (rejected — that's installing a dependency with no caller, which is
  exactly what the constitution's dependency constraint exists to
  prevent; add it when a specific feature — most likely a future
  "disconnected knowledge islands" surfacing feature — actually calls a
  Graphology function).

## Layout preference persistence: a dedicated `graph_layouts` table, not `localStorage`

- **Decision**: persist expand/collapse state and positions in a new
  Postgres table (`graph_layouts`), scoped by student via RLS, following
  the exact shape PRD §10.1 already specifies (`course_id`, `view_key`,
  `entity_id`, `renderer`, `layout_algorithm`, `x`/`y`/`width`/`height`,
  `collapsed`, `revision`).
- **Rationale**: spec FR-007 requires layout preference to survive across
  visits — `localStorage` would satisfy that narrowly, but would silently
  break the moment the student switches devices or clears site data, and
  PRD's own architecture already named a durable table for exactly this.
  Since Phase 1 already built the real Supabase client/RLS plumbing, using
  it here is implementing an already-approved design, not scope creep.
- **Alternatives considered**: `localStorage` only (rejected — doesn't
  survive a device switch or cleared storage, and the whole point of
  Constitution Principle I's canonical/layout split is that layout state
  is still real, durable state, just not *semantic* state); storing
  layout inside the `CourseGraph` DTO itself (rejected — this is exactly
  what Principle I forbids, coordinates must never live in the canonical
  domain model).

## Responsive concept detail: same component, different container

- **Decision**: `ConceptDetailPanel` is one component whose container
  (side panel vs. bottom sheet) is chosen by viewport width via CSS, not
  two separate components.
- **Rationale**: `.claude/skills/concept-atlas/references/interaction-states.md`
  specifies a side panel on desktop and a bottom sheet on mobile/tablet
  showing the *same* content (canonical label, aliases, mastery, edges,
  evidence) — the content and behavior are identical, only placement
  changes, so one component with a responsive container avoids
  duplicating the detail-rendering logic in two places that could drift
  apart.
- **Alternatives considered**: two separate components, `ConceptDetailSidePanel`
  and `ConceptDetailBottomSheet` (rejected — duplicates the same content
  logic for no behavioral difference, a maintenance liability).

## Visual regression tooling: Playwright, already in the repo

- **Decision**: use the existing Playwright setup (`tests/e2e/`,
  `tests/visual/`) for the 5 required screenshots from
  `.claude/skills/concept-atlas/references/testing.md`, rather than a
  separate visual-testing tool (e.g. Chromatic, Percy).
- **Rationale**: Playwright already supports snapshot/screenshot
  comparison out of the box, is already a project dependency, and
  `tests/visual/README.md` was already written anticipating exactly this
  ("Add specs here once the atlas renderer lands"). No new dependency
  needed.
- **Alternatives considered**: a hosted visual-diffing SaaS (rejected —
  new external dependency/account, unnecessary for a project at this
  stage, and duplicates what Playwright's own screenshot assertions
  already do locally).
