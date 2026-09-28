import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutIslands, ISLANDS_PER_ROW } from "../../../src/features/courses/island-layout.ts";

const courses = (...ids: string[]) => ids.map((id) => ({ id }));

test("every course gets exactly one placement, in input order", () => {
  const { placements } = layoutIslands(courses("a", "b", "c", "d"));
  assert.deepEqual(placements.map((p) => p.courseId), ["a", "b", "c", "d"]);
});

test("layout is deterministic: same input, same output", () => {
  const first = layoutIslands(courses("a", "b", "c"));
  const second = layoutIslands(courses("a", "b", "c"));
  assert.deepEqual(first, second);
});

// The reason the grid has a FIXED column count rather than sqrt(n):
// a student adding their fifth course should not see the other four
// jump to new positions.
test("adding a course does not move the courses already placed", () => {
  const before = layoutIslands(courses("a", "b", "c"));
  const after = layoutIslands(courses("a", "b", "c", "d"));
  assert.deepEqual(after.placements.slice(0, 3), before.placements);
});

test("jitter is per-course, so two courses in the same slot position differently", () => {
  const a = layoutIslands(courses("course-a")).placements[0];
  const b = layoutIslands(courses("course-b")).placements[0];
  assert.notDeepEqual([a.leftPercent, a.topPercent], [b.leftPercent, b.topPercent]);
});

// Only islands in the SAME row can collide: each row renders in its
// own fixed-height container, so a row-0 and a row-1 island cannot
// overlap no matter what their percentages are. Comparing across rows
// would be asserting something the layout does not control.
test("no two islands in the same row overlap", () => {
  const { placements } = layoutIslands(courses("a", "b", "c", "d", "e", "f", "g", "h"));

  for (let row = 0; row * ISLANDS_PER_ROW < placements.length; row += 1) {
    const inRow = placements.slice(row * ISLANDS_PER_ROW, (row + 1) * ISLANDS_PER_ROW);
    for (let i = 0; i < inRow.length; i += 1) {
      for (let j = i + 1; j < inRow.length; j += 1) {
        assert.ok(
          Math.abs(inRow[i].leftPercent - inRow[j].leftPercent) > 5,
          `islands ${inRow[i].courseId} and ${inRow[j].courseId} are too close horizontally`,
        );
      }
    }
  }
});

// The guarantee that makes the test above hold for ANY set of course
// ids, not just these eight: jitter is bounded under half a cell, so
// two neighbouring cells can never reach each other.
test("horizontal jitter stays inside its own cell", () => {
  const cellWidth = 100 / ISLANDS_PER_ROW;
  const ids = Array.from({ length: 30 }, (_, i) => `course-${i}`);
  const { placements } = layoutIslands(courses(...ids));

  for (const [ordinal, placement] of placements.entries()) {
    const column = ordinal % ISLANDS_PER_ROW;
    const cellCenter = column * cellWidth + cellWidth / 2;
    assert.ok(
      Math.abs(placement.leftPercent - cellCenter) < cellWidth / 2,
      `${placement.courseId} escaped its cell`,
    );
  }
});

test("rows grow with the course count", () => {
  assert.equal(layoutIslands(courses("a")).rows, 1);
  assert.equal(layoutIslands(courses("a", "b", "c")).rows, 1);
  assert.equal(layoutIslands(courses("a", "b", "c", "d")).rows, 2);
  assert.equal(layoutIslands([]).rows, 0);
});

test("an empty course list produces no placements", () => {
  assert.deepEqual(layoutIslands([]), { placements: [], rows: 0 });
});

test("ISLANDS_PER_ROW is the documented fixed column count", () => {
  assert.equal(ISLANDS_PER_ROW, 3);
});
