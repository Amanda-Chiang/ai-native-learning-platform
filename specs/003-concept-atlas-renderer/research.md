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

## ELK integration: `elkjs`'s bundled worker build, invoked from a client effect

- **Decision**: run ELK layout via `elkjs`'s web-worker build, triggered
  in a `useEffect` after the `CourseGraph` DTO is converted to ELK's graph
  input format, with computed positions merged into React Flow node data
  before render.
- **Rationale**: ELK's layered algorithm is synchronous-but-slow-ish
  (graph layout is CPU-bound); running it in a worker keeps the main
  thread responsive for a 20-40+ concept graph without needing a server
  round-trip. This matches PRD §13.7's target pipeline: DTO → Graphology
  (skipped, see below) → ELK → React Flow adapter.
- **Alternatives considered**: server-side layout computation (rejected —
  adds a network round-trip for something that can run entirely
  client-side, and the constitution's client-architecture rule is about
  canonical *data* living server-side, not about where a derived,
  renderer-local computation like layout must run); a non-worker
  synchronous ELK call (rejected — risks janking the UI thread on larger
  courses, which SC-001/SC-006 care about).

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
