import { test } from "node:test";
import assert from "node:assert/strict";
import { groupConceptsByUnit } from "../../../src/features/courses/concept-path.ts";

const units = [
  { id: "u1", title: "Graphs" },
  { id: "u2", title: "Trees" },
];

const concepts = [
  { id: "c1", name: "BFS", unitId: "u1", masteryState: "solid" as const },
  { id: "c2", name: "DFS", unitId: "u1", masteryState: "weak" as const },
  { id: "c3", name: "Heap", unitId: "u2", masteryState: "unverified" as const },
];

test("groups concepts under their unit, preserving the given unit order", () => {
  const sections = groupConceptsByUnit(concepts, units);
  assert.deepEqual(
    sections.map((s) => [s.title, s.concepts.map((c) => c.name)]),
    [
      ["Graphs", ["BFS", "DFS"]],
      ["Trees", ["Heap"]],
    ],
  );
});

test("a concept with no unit lands under an explicit Unassigned section, never dropped", () => {
  const orphan = { id: "c4", name: "Orphan", unitId: null, masteryState: "exposed" as const };
  const sections = groupConceptsByUnit([...concepts, orphan], units);
  const unassigned = sections.find((s) => s.unitId === null);
  assert.ok(unassigned, "expected an Unassigned section");
  assert.equal(unassigned.title, "Unassigned");
  assert.deepEqual(unassigned.concepts.map((c) => c.name), ["Orphan"]);
  // Nothing is lost in grouping.
  assert.equal(sections.flatMap((s) => s.concepts).length, 4);
});

test("a concept referencing a unit that no longer exists is Unassigned, not silently dropped", () => {
  const stale = { id: "c5", name: "Stale", unitId: "deleted-unit", masteryState: "weak" as const };
  const sections = groupConceptsByUnit([stale], units);
  assert.deepEqual(sections.map((s) => s.unitId), [null]);
  assert.deepEqual(sections[0].concepts.map((c) => c.name), ["Stale"]);
});

test("Unassigned sorts last, after every real unit", () => {
  const orphan = { id: "c4", name: "Orphan", unitId: null, masteryState: "exposed" as const };
  const sections = groupConceptsByUnit([orphan, ...concepts], units);
  assert.equal(sections[sections.length - 1].unitId, null);
});

test("a unit with no concepts is omitted, and an empty course yields no sections", () => {
  assert.deepEqual(groupConceptsByUnit([], units), []);
  const onlyU1 = groupConceptsByUnit([concepts[0]], units);
  assert.deepEqual(onlyU1.map((s) => s.title), ["Graphs"]);
});
