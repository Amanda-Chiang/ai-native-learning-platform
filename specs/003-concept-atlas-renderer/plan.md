# Implementation Plan: Concept Atlas Renderer

**Branch**: `003-concept-atlas-renderer` | **Date**: 2026-09-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-concept-atlas-renderer/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Render a renderer-neutral course-graph DTO (units, concepts,
relationships) as an interactive map: React Flow for the interactive
surface, ELK for layered layout, matching the mastery/relationship visual
language and interaction rules already decided in
`.claude/skills/concept-atlas/`. This feature renders the existing demo
fixture (`tests/fixtures/concept-atlas-demo.json`) — it does not fetch or
generate real per-course graph data; that's `course-graph-ingestion`'s
job, built next. The one piece of real persistence this feature does own
is per-student layout preference (expand/collapse, positions) — view
state, never semantic graph data.

## Technical Context

**Language/Version**: TypeScript 5, Next.js 16 (App Router), React 19 —
all already present in this repo.

**Primary Dependencies**: `@xyflow/react` (React Flow's current package
name) and `elkjs` — both net-new to `package.json`, both the
constitution-ratified renderer/layout pick (§13.7 of the PRD, echoed in
`.specify/memory/constitution.md`'s Technology & Architecture
Constraints). Graphology is *not* added in this feature: PRD §13.6 lists
it as an optional in-memory graph-analysis layer (neighborhoods,
connected-component detection, filtering) — this feature only renders a
given DTO, it doesn't analyze the graph, so there's no present use for it
yet. Adding it now would be a dependency with no caller, contradicting
the "no new dependency without a demonstrated need" constraint. Revisit
when a feature actually needs graph analysis (e.g. knowledge-island
detection).

**Storage**: One new table, `graph_layouts` (per-student layout
preference only — expand/collapse state, positions — never semantic graph
data), added to the already-approved Postgres/Supabase store from Phase 1.
This is schema evolution within the ratified stack, not a new persistence
layer, so no ADR is required (Constitution's "no new persistence layer"
constraint targets storage *technology* choices, e.g. adding a graph
database — not new tables in the store already approved). Canonical graph
data (units/concepts/relationships) is **not** stored by this feature —
sourced from the fixture for now, per spec.md Assumptions.

**Testing**: Playwright visual regression (already scaffolded in
`tests/visual/`, per `.claude/skills/concept-atlas/references/testing.md`'s
required screenshot list) for the rendering rules; Node's built-in test
runner (`node --test`, continuing the Phase 0/1 precedent) for the pure
logic — the DTO→React Flow adapter's node/edge construction and the
layout-preference read/write logic — since those don't need a browser to
verify correctness.

**Target Platform**: Browser (React Flow renders client-side) plus
Next.js server actions for reading/writing layout preference.

**Project Type**: Web application, single Next.js project (extends the
existing structure from Phases 0-1).

**Performance Goals**: SC-001's "zero overlapping/clipped nodes at
20-40+ concepts" is the real target; ELK's layered algorithm is designed
for exactly this (directed node-link diagrams with inherent hierarchy),
so no separate performance budget is set beyond that visual-correctness
bar.

**Constraints**: Constitution Principle I (renderer-neutral graph) is the
central constraint this whole feature exists to honor — the canonical DTO
(`CourseGraph` type: units, concepts, relationships) MUST NOT contain
React Flow node/edge shapes, ELK layout output, or any coordinate/style
field. A view-adapter layer converts DTO → React Flow's node/edge format;
layout positions computed by ELK are stored only in `graph_layouts` (view
state) or transient client state, never written back into the DTO.

**Scale/Scope**: Single-course view; the demo fixture (5 units, 24
concepts, 22 relationships) is the development/test scale target,
matching spec.md's stated 20-40+ concept baseline.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies how | Status |
|---|---|---|
| I. Renderer-Neutral Learner Graph | This is the principle this feature is built around — DTO/adapter separation is the core design constraint (see Constraints above and data-model.md). | PASS — enforced by construction |
| II. Evidence-Backed Learner State (NON-NEGOTIABLE) | Not applicable — this feature reads given mastery/relationship-state values, it never writes or derives them. | N/A |
| III. Exposure Is Not Mastery | Not applicable, same reason as II. | N/A |
| IV. Deterministic Verification First | Not applicable — no grading or generation happens in this feature. | N/A |
| V. Course-Grounded, Provenance-Preserving Claims | Not applicable directly — this feature displays concept/relationship data that (per Phase 0's schema) already carries `sourceAnchors`; it doesn't originate new course-specific claims. | N/A |

| Technology Constraint | Applies how | Status |
|---|---|---|
| Stack (React Flow + ELK) | Implements exactly the ratified renderer/layout pick from PRD §13.7 and the decision log. | PASS |
| No new persistence layer without an ADR | `graph_layouts` is a new *table*, not a new storage *technology* — Postgres/Supabase is already approved (Phase 1). | PASS |
| No new dependency duplicating an existing one | `@xyflow/react`/`elkjs` are net-new but nothing existing provides interactive graph rendering or layered layout; Graphology deliberately deferred (no demonstrated need yet). | PASS |
| Client architecture (canonical state server-side) | Canonical graph DTO is server-sourced (fixture today, database later); layout preference is the only thing the client persists, and even that round-trips through a server action, not client-only storage. | PASS |

No violations. Complexity Tracking table below is left empty.

**Post-Phase-1 re-check**: `data-model.md`'s `CourseGraph` DTO has no
coordinate/style/renderer-specific fields anywhere in its type — verified
by construction, not just by convention. `graph_layouts` is the only new
persisted state and it is explicitly view-only. Gate still PASSES after
design.

## Project Structure

### Documentation (this feature)

```text
specs/003-concept-atlas-renderer/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output — the CourseGraph DTO contract + layout-preference server actions
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
supabase/
└── migrations/
    └── 0002_graph_layouts.sql   # graph_layouts table + RLS (per-student layout preference only)

src/
├── types/
│   └── graph/
│       └── course-graph.ts     # renderer-neutral CourseGraph DTO (Unit, Concept, Relationship) -- Constitution Principle I
├── features/
│   └── concept-atlas/
│       ├── adapters/
│       │   └── react-flow-adapter.ts   # CourseGraph -> React Flow nodes/edges + ELK layout, the ONLY place coordinates get computed
│       ├── components/
│       │   ├── ConceptAtlas.tsx        # top-level client component: React Flow canvas + unit regions
│       │   ├── ConceptNode.tsx         # custom React Flow node: mastery ring/color/label
│       │   ├── RelationshipEdge.tsx    # custom React Flow edge: type + strength encoding
│       │   └── ConceptDetailPanel.tsx  # stable side panel / bottom sheet (responsive)
│       ├── layout-preference.ts        # read/write helpers over graph_layouts
│       └── actions.ts                  # server actions: getLayoutPreference, saveLayoutPreference
├── app/
│   └── courses/
│       └── [courseId]/
│           └── atlas/
│               └── page.tsx    # loads the demo fixture (until course-graph-ingestion exists) + layout preference, renders ConceptAtlas

tests/
├── unit/
│   └── concept-atlas/
│       ├── react-flow-adapter.test.ts   # DTO -> node/edge construction, pure logic
│       └── layout-preference.test.ts    # merge/validation logic, pure
└── visual/
    └── concept-atlas.spec.ts    # Playwright: the 5 required screenshots per testing.md
```

**Structure Decision**: Single Next.js project (extends Phases 0-1).
`src/types/graph/` is new — the renderer-neutral DTO deliberately lives
outside `src/features/concept-atlas/` so nothing in the adapter/component
tree can casually import a React-Flow-shaped type where the canonical DTO
type was meant to be used (a real, structural way to keep Principle I
honest, not just a naming convention).

## Complexity Tracking

*No Constitution Check violations — this table is intentionally empty.*
