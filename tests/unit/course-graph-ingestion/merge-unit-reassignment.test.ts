import test from "node:test";
import assert from "node:assert/strict";
import { shouldMoveConceptUnitOnMerge } from "../../../trigger/extract-course-graph.ts";

test("no hard target -> never moves the unit", () => {
  assert.equal(shouldMoveConceptUnitOnMerge(null, null, "confirmed"), false);
  assert.equal(shouldMoveConceptUnitOnMerge(null, null, "proposed"), false);
});

test("merged-onto concept is 'proposed' -> moves regardless of the target unit's status (N1: no restriction)", () => {
  assert.equal(shouldMoveConceptUnitOnMerge("unit-b", "proposed", "proposed"), true);
  assert.equal(shouldMoveConceptUnitOnMerge("unit-b", "confirmed", "proposed"), true);
  assert.equal(shouldMoveConceptUnitOnMerge("unit-b", null, "proposed"), true);
});

test("merged-onto concept is 'confirmed' and target unit is also 'confirmed' -> moves", () => {
  assert.equal(shouldMoveConceptUnitOnMerge("unit-b", "confirmed", "confirmed"), true);
});

test("merged-onto concept is 'confirmed' but target unit is 'proposed' -> skips the move (N1 fix, the C1 failure mode reached via merge)", () => {
  assert.equal(shouldMoveConceptUnitOnMerge("unit-b", "proposed", "confirmed"), false);
});

test("merged-onto concept status is unresolved (null) -> treated the same as non-confirmed, safe default", () => {
  assert.equal(shouldMoveConceptUnitOnMerge("unit-b", "proposed", null), true);
  assert.equal(shouldMoveConceptUnitOnMerge("unit-b", "confirmed", null), true);
});
