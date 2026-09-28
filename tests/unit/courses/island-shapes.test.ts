import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ISLAND_SHAPES,
  shapeForIndex,
  islandColorForCourseId,
} from "../../../src/features/courses/island-shapes.ts";

test("the library is non-empty and every shape has a unique id", () => {
  assert.ok(ISLAND_SHAPES.length > 0);
  const ids = ISLAND_SHAPES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

// This is the load-bearing test for the whole stored-index design: a
// course stores an index once, forever, so entry N must never change
// meaning. It fails loudly if someone reorders or removes an entry.
test("the library is append-only: existing entries keep their id and position", () => {
  const expectedPrefix = [
    "blob-01",
    "blob-02",
    "blob-03",
    "blob-04",
    "blob-05",
    "blob-06",
    "blob-07",
    "blob-08",
  ];
  assert.deepEqual(ISLAND_SHAPES.slice(0, expectedPrefix.length).map((s) => s.id), expectedPrefix);
});

test("shapeForIndex returns the entry at that index", () => {
  assert.equal(shapeForIndex(0), ISLAND_SHAPES[0]);
  assert.equal(shapeForIndex(3), ISLAND_SHAPES[3]);
});

// A stored index with no shape is a real data problem -- a course row
// pointing past the library. Falling back to shape 0 would render a
// plausible-looking island for a course whose real shape is unknown.
test("shapeForIndex throws on an index the library does not have", () => {
  assert.throws(() => shapeForIndex(ISLAND_SHAPES.length), /island shape index/i);
  assert.throws(() => shapeForIndex(-1), /island shape index/i);
  assert.throws(() => shapeForIndex(1.5), /island shape index/i);
});

test("island color is deterministic per course id and always a token reference", () => {
  const a = islandColorForCourseId("course-a");
  assert.equal(a, islandColorForCourseId("course-a"));
  assert.match(a, /^var\(--[a-z-]+\)$/);
});

test("island colors spread across the palette rather than collapsing to one", () => {
  const colors = new Set(
    ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].map(islandColorForCourseId),
  );
  assert.ok(colors.size > 1, "expected more than one distinct color across 10 ids");
});
