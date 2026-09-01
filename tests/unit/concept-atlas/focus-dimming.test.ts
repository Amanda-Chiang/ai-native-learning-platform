import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { computeRelatedIds, applyFocusDimming, DIMMED_OPACITY } from "../../../src/features/concept-atlas/focus-dimming.ts";
import { courseGraphToReactFlowElements } from "../../../src/features/concept-atlas/adapters/react-flow-adapter.ts";
import type { CourseGraph } from "../../../src/types/graph/course-graph.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(__dirname, "../../fixtures/concept-atlas-demo.json");
const fixture: CourseGraph = JSON.parse(readFileSync(fixturePath, "utf-8"));

function dummyPositions(graph: CourseGraph) {
  const positions = new Map(graph.concepts.map((c, i) => [c.id, { x: i * 100, y: 0 }]));
  for (const u of graph.units) positions.set(u.id, { x: 0, y: 0 });
  return positions;
}

test("computeRelatedIds (concept focus) finds both directly-connected concepts for c-big-o", () => {
  const { nodeIds, edgeIds } = computeRelatedIds(fixture, { kind: "concept", id: "c-big-o" });
  assert.equal(nodeIds.has("c-big-o"), true);
  assert.equal(nodeIds.has("c-recurrence-relations"), true);
  assert.equal(nodeIds.has("c-amortized-analysis"), true);
  assert.equal(edgeIds.has("r-bigo-recurrence"), true);
  assert.equal(edgeIds.has("r-bigo-amortized"), true);
});

test("computeRelatedIds (relationship focus) finds only its own two endpoints", () => {
  const { nodeIds, edgeIds } = computeRelatedIds(fixture, {
    kind: "relationship",
    id: "r-bfs-shortest-path",
  });
  assert.equal(nodeIds.size, 2);
  assert.equal(nodeIds.has("c-bfs"), true);
  assert.equal(nodeIds.has("c-shortest-path"), true);
  // The fixture's duplicate-edge sibling (different id, same concept
  // pair) must NOT be pulled in -- relationship focus is about this one
  // specific relationship record, not every edge between the same pair.
  assert.equal(edgeIds.size, 1);
  assert.equal(edgeIds.has("r-bfs-shortest-path"), true);
  assert.equal(edgeIds.has("r-bfs-shortest-path-dup"), false);
});

test("applyFocusDimming does NOT dim a related concept node (concept focus)", () => {
  const { nodes } = courseGraphToReactFlowElements(fixture, dummyPositions(fixture), new Set());
  const { nodes: dimmedNodes } = applyFocusDimming(nodes, [], { kind: "concept", id: "c-big-o" }, fixture);
  const relatedNode = dimmedNodes.find((n) => n.id === "c-amortized-analysis");
  assert.ok(relatedNode);
  assert.notEqual(relatedNode?.style?.opacity, DIMMED_OPACITY);
});

test("applyFocusDimming DOES dim an unrelated concept node (concept focus)", () => {
  const { nodes } = courseGraphToReactFlowElements(fixture, dummyPositions(fixture), new Set());
  const { nodes: dimmedNodes } = applyFocusDimming(nodes, [], { kind: "concept", id: "c-big-o" }, fixture);
  const unrelatedNode = dimmedNodes.find((n) => n.id === "c-quick-sort");
  assert.ok(unrelatedNode);
  assert.equal(unrelatedNode?.style?.opacity, DIMMED_OPACITY);
});

test("applyFocusDimming (relationship focus) dims a concept not on either endpoint", () => {
  const { nodes } = courseGraphToReactFlowElements(fixture, dummyPositions(fixture), new Set());
  const { nodes: dimmedNodes } = applyFocusDimming(
    nodes,
    [],
    { kind: "relationship", id: "r-bfs-shortest-path" },
    fixture,
  );
  const bfsNode = dimmedNodes.find((n) => n.id === "c-bfs");
  const shortestPathNode = dimmedNodes.find((n) => n.id === "c-shortest-path");
  const unrelatedNode = dimmedNodes.find((n) => n.id === "c-graph");
  assert.notEqual(bfsNode?.style?.opacity, DIMMED_OPACITY);
  assert.notEqual(shortestPathNode?.style?.opacity, DIMMED_OPACITY);
  assert.equal(unrelatedNode?.style?.opacity, DIMMED_OPACITY);
});
