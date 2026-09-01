import test from "node:test";
import assert from "node:assert/strict";

import {
  mergeCollapsedUnitIds,
  mergePositionOverrides,
  toLayoutPreferenceEntry,
  type LayoutPreference,
} from "../../../src/features/concept-atlas/layout-preference.ts";
import type { LayoutPosition } from "../../../src/features/concept-atlas/adapters/react-flow-adapter.ts";

test("a unit with no saved preference is not collapsed by default (matches US1's accepted baseline)", () => {
  const collapsed = mergeCollapsedUnitIds([]);
  assert.equal(collapsed.has("unit-graphs"), false);
});

test("a unit with a saved collapsed:true entry is collapsed", () => {
  const preferences: LayoutPreference[] = [
    { entityId: "unit-graphs", entityType: "unit", collapsed: true, x: null, y: null },
  ];
  const collapsed = mergeCollapsedUnitIds(preferences);
  assert.equal(collapsed.has("unit-graphs"), true);
});

test("a saved collapsed:false entry does not collapse the unit", () => {
  const preferences: LayoutPreference[] = [
    { entityId: "unit-graphs", entityType: "unit", collapsed: false, x: null, y: null },
  ];
  const collapsed = mergeCollapsedUnitIds(preferences);
  assert.equal(collapsed.has("unit-graphs"), false);
});

test("collapsing one unit only affects that unit's entry, never siblings", () => {
  const preferences: LayoutPreference[] = [
    { entityId: "unit-graphs", entityType: "unit", collapsed: true, x: null, y: null },
  ];
  const collapsed = mergeCollapsedUnitIds(preferences);
  assert.equal(collapsed.size, 1);
  assert.equal(collapsed.has("unit-trees"), false);
});

test("position overrides are overlaid onto default positions without mutating the input map", () => {
  const defaults = new Map<string, LayoutPosition>([
    ["c-bfs", { x: 10, y: 20 }],
    ["c-dfs", { x: 30, y: 40 }],
  ]);
  const preferences: LayoutPreference[] = [
    { entityId: "c-bfs", entityType: "concept", collapsed: null, x: 999, y: 888 },
  ];

  const merged = mergePositionOverrides(defaults, preferences);

  assert.deepEqual(merged.get("c-bfs"), { x: 999, y: 888 });
  // c-dfs had no override -- default position untouched.
  assert.deepEqual(merged.get("c-dfs"), { x: 30, y: 40 });
  // The original defaults map must not have been mutated.
  assert.deepEqual(defaults.get("c-bfs"), { x: 10, y: 20 });
});

test("a preference entry with null x/y does not override the default position", () => {
  const defaults = new Map<string, LayoutPosition>([["c-bfs", { x: 10, y: 20 }]]);
  const preferences: LayoutPreference[] = [
    { entityId: "c-bfs", entityType: "concept", collapsed: null, x: null, y: null },
  ];
  const merged = mergePositionOverrides(defaults, preferences);
  assert.deepEqual(merged.get("c-bfs"), { x: 10, y: 20 });
});

test("toLayoutPreferenceEntry builds a well-formed entry with sensible defaults", () => {
  const entry = toLayoutPreferenceEntry("unit-graphs", "unit", { collapsed: true });
  assert.deepEqual(entry, {
    entityId: "unit-graphs",
    entityType: "unit",
    collapsed: true,
    x: null,
    y: null,
  });
});
