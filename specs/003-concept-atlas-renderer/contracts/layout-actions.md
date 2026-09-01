# Server Action Contracts

This feature's only server-facing interface is layout-preference
persistence (server actions, same pattern as Phases 1). Rendering itself
is entirely client-side and has no server contract — the `CourseGraph`
DTO is passed as page props from the course-atlas route, sourced from the
demo fixture for now (spec.md Assumptions).

## `getLayoutPreference(courseId: string): Promise<LayoutPreference[]>`

- **Consumes**: the course whose layout preference to load.
- **Produces**: every `graph_layouts` row owned by the current session's
  user for that course (RLS-scoped, same isolation pattern as Phase 1's
  `listCourses`/`listArtifacts` — no `owner_id` parameter accepted, RLS is
  the only filter).

```ts
type LayoutPreference = {
  entityId: string;
  entityType: "unit" | "concept";
  collapsed: boolean | null;
  x: number | null;
  y: number | null;
};
```

## `saveLayoutPreference(courseId: string, entries: LayoutPreference[]): Promise<{ error: string | null }>`

- **Consumes**: the course and one or more entity layout entries to
  upsert (e.g. "unit X was collapsed", "concept Y was moved to (x, y)").
- **Produces**: upserts each entry keyed on
  `(owner_id, course_id, entity_id)` (data-model.md's uniqueness rule).
  Called on debounce/interaction-end, not on every pixel of a drag, to
  avoid writing on every animation frame.
