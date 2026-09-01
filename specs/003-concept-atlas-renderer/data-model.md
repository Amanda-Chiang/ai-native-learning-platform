# Phase 1 Data Model: Concept Atlas Renderer

Source of truth for `src/types/graph/course-graph.ts` and
`supabase/migrations/0002_graph_layouts.sql`. Per
`.claude/skills/concept-atlas/references/graph-domain-model.md`, which
this file formalizes into the actual TypeScript/SQL shapes.

## `CourseGraph` DTO (renderer-neutral — Constitution Principle I)

```ts
type CourseGraph = {
  units: Unit[];
  concepts: Concept[];
  relationships: Relationship[];
};
```

No field anywhere in `Unit`, `Concept`, or `Relationship` may contain a
coordinate, React Flow node/edge id, ELK layout output, CSS class, or any
other renderer-specific property. This is enforced by construction: these
types live in `src/types/graph/`, a directory the adapter layer
(`src/features/concept-atlas/adapters/`) reads from but nothing writes
renderer output back into.

### Unit

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | |
| `title` | `string` | e.g. "Graphs" |
| `conceptIds` | `string[]` | Which concepts belong to this unit |

### Concept

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | |
| `canonicalLabel` | `string` | |
| `aliases` | `string[]` | Display/search only — an alias never becomes a separate concept (spec Key Entities) |
| `masteryState` | `"unverified" \| "exposed" \| "weak" \| "solid"` | Per `visual-language.md`'s four discrete states |

### Relationship

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | |
| `type` | `"prerequisite-of" \| "builds-on" \| "applies-to" \| "analogous-to" \| "contrasts-with"` | Per `relationship-taxonomy.md` |
| `fromConceptId` | `string` | |
| `toConceptId` | `string` | |
| `crossUnit` | `boolean` | Whether `fromConceptId` and `toConceptId` belong to different units — precomputed input, not derived at render time, so the renderer never needs unit-membership logic beyond what it's given |
| `learnerState` | `"weak" \| "strong"` | Relationship-level state, independent of either endpoint concept's own `masteryState` (spec Key Entities) |

**Validation rule**: `(fromConceptId, toConceptId, type)` is NOT required
to be unique — the demo fixture's `r-bfs-shortest-path` /
`r-bfs-shortest-path-dup` pair is a real, intentional duplicate-edge case
(spec Edge Cases, FR-014) the renderer must display, not collapse.

## `graph_layouts` table (view state only, per-student)

Per PRD §10.1's already-specified shape, scoped to just what this feature
needs (positions + collapsed state):

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid`, PK | `default gen_random_uuid()` |
| `owner_id` | `uuid`, not null | `references auth.users(id)` — RLS scope |
| `course_id` | `uuid`, not null | Which course this layout belongs to |
| `entity_id` | `text`, not null | A unit id or concept id — layout is per-entity, not one blob per course |
| `entity_type` | `text`, not null | `check (entity_type in ('unit', 'concept'))` |
| `collapsed` | `boolean`, nullable | Only meaningful for `entity_type = 'unit'` |
| `x` | `double precision`, nullable | Last-known position, if the student has manually moved something |
| `y` | `double precision`, nullable | |
| `updated_at` | `timestamptz`, not null | `default now()` |

**RLS**: enabled, `owner_id = auth.uid()`, full `SELECT`/`INSERT`/`UPDATE`
for the owner (unlike Phase 1's artifact tables, a student's own layout
preference is exactly the kind of thing they should be able to write
directly — it's not semantic graph data, it's their personal view state).

**Uniqueness**: `(owner_id, course_id, entity_id)` should be unique — one
layout row per student per entity per course, upserted on change.

## React Flow adapter output (not canonical — lives only in the adapter)

The adapter (`react-flow-adapter.ts`) produces `Node[]`/`Edge[]` in
`@xyflow/react`'s own shape, merging:

1. `CourseGraph` data (label, mastery state, relationship type/strength)
2. ELK-computed positions
3. Saved `graph_layouts` overrides (a student-moved position, if any)

This merged shape is intentionally *not* documented here as a reusable
type other code should import — it's the adapter's internal output,
consumed only by the React Flow canvas component, which is exactly what
keeps it from leaking into the canonical model.

## Relationships

```text
Unit ──(conceptIds)── Concept ──(fromConceptId/toConceptId)── Relationship
graph_layouts ──(entity_id)── Unit | Concept   [view state, separate table, never joined into CourseGraph]
```
