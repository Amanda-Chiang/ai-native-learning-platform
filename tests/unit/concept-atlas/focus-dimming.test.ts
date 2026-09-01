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

test("computeRelatedIds finds both directly-connected concepts for c-big-o", () => {
  const { nodeIds, edgeIds } = computeRelatedIds(fixture, "c-big-o");
  assert.equal(nodeIds.has("c-big-o"), true);
  assert.equal(nodeIds.has("c-recurrence-relations"), true);
  assert.equal(nodeIds.has("c-amortized-analysis"), true);
  assert.equal(edgeIds.has("r-bigo-recurrence"), true);
  assert.equal(edgeIds.has("r-bigo-amortized"), true);
});

test("applyFocusDimming does NOT dim a related concept node", () => {
  const positions = new Map(fixture.concepts.map((c, i) => [c.id, { x: i * 100, y: 0 }]));
  for (const u of fixture.units) positions.set(u.id, { x: 0, y: 0 });
  const { nodes } = courseGraphToReactFlowElements(fixture, positions, new Set());

  const { nodes: dimmedNodes } = applyFocusDimming(nodes, [], "c-big-o", fixture);

  const relatedNode = dimmedNodes.find((n) => n.id === "c-amortized-analysis");
  assert.ok(relatedNode);
  assert.notEqual(relatedNode?.style?.opacity, DIMMED_OPACITY);
});

test("applyFocusDimming DOES dim an unrelated concept node", () => {
  const positions = new Map(fixture.concepts.map((c, i) => [c.id, { x: i * 100, y: 0 }]));
  for (const u of fixture.units) positions.set(u.id, { x: 0, y: 0 });
  const { nodes } = courseGraphToReactFlowElements(fixture, positions, new Set());

  const { nodes: dimmedNodes } = applyFocusDimming(nodes, [], "c-big-o", fixture);

  const unrelatedNode = dimmedNodes.find((n) => n.id === "c-quick-sort");
  assert.ok(unrelatedNode);
  assert.equal(unrelatedNode?.style?.opacity, DIMMED_OPACITY);
});
