import type { LayoutPosition } from "@/features/concept-atlas/adapters/react-flow-adapter.ts";

/**
 * Mirrors graph_layouts' columns (data-model.md). This is view state
 * only, kept structurally separate from CourseGraph (Constitution
 * Principle I) -- nothing here ever describes what a concept/relationship
 * means, only where/how it's currently displayed for one student.
 */
export type LayoutPreference = {
  entityId: string;
  entityType: "unit" | "concept";
  collapsed: boolean | null;
  x: number | null;
  y: number | null;
};

/**
 * Which units are collapsed, per saved preference. A unit with no saved
 * entry is NOT collapsed -- matches US1's already-accepted
 * whole-course-atlas.png baseline (every unit expanded with nothing
 * saved yet), not a fresh "collapsed by default" assumption.
 */
export function mergeCollapsedUnitIds(preferences: LayoutPreference[]): Set<string> {
  const collapsed = new Set<string>();
  for (const pref of preferences) {
    if (pref.entityType === "unit" && pref.collapsed === true) {
      collapsed.add(pref.entityId);
    }
  }
  return collapsed;
}

/**
 * Overlays saved position overrides onto ELK-computed default positions.
 * Never mutates the input map -- callers (ConceptAtlas) rely on the
 * default positions map staying a stable reference across renders.
 */
export function mergePositionOverrides(
  defaults: Map<string, LayoutPosition>,
  preferences: LayoutPreference[],
): Map<string, LayoutPosition> {
  const merged = new Map(defaults);
  for (const pref of preferences) {
    if (pref.x !== null && pref.y !== null) {
      const base = merged.get(pref.entityId);
      merged.set(pref.entityId, { ...base, x: pref.x, y: pref.y });
    }
  }
  return merged;
}

export function toLayoutPreferenceEntry(
  entityId: string,
  entityType: "unit" | "concept",
  update: Partial<Pick<LayoutPreference, "collapsed" | "x" | "y">>,
): LayoutPreference {
  return { entityId, entityType, collapsed: null, x: null, y: null, ...update };
}
