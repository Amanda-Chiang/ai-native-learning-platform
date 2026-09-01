import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { courseGraphToReactFlowElements } from "../../../src/features/concept-atlas/adapters/react-flow-adapter.ts";
import type { CourseGraph } from "../../../src/types/graph/course-graph.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(__dirname, "../../fixtures/concept-atlas-demo.json");
const fixture: CourseGraph = JSON.parse(readFileSync(fixturePath, "utf-8"));

// Dummy positions -- this test exercises the pure DTO->React-Flow
// conversion, not ELK's actual layout computation (which is async and
// needs a browser-ish environment; see computeElkLayout, tested via
// Playwright visual regression instead per quickstart.md).
function dummyPositions(graph: CourseGraph): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  let i = 0;
  for (const unit of graph.units) {
    positions.set(unit.id, { x: i * 400, y: 0 });
    i += 1;
  }
  let j = 0;
  for (const concept of graph.concepts) {
    positions.set(concept.id, { x: j * 100, y: 100 });
    j += 1;
  }
  return positions;
}

test("produces exactly one React Flow node per concept", () => {
  const { nodes } = courseGraphToReactFlowElements(fixture, dummyPositions(fixture), new Set());
  const conceptNodes = nodes.filter((n) => n.type === "conceptNode");
  assert.equal(conceptNodes.length, fixture.concepts.length);
});

test("produces exactly one React Flow group node per unit", () => {
  const { nodes } = courseGraphToReactFlowElements(fixture, dummyPositions(fixture), new Set());
  const unitNodes = nodes.filter((n) => n.type === "unitGroup");
  assert.equal(unitNodes.length, fixture.units.length);
});

test("produces exactly one edge per relationship, including duplicate-edge pairs (spec FR-014)", () => {
  const { edges } = courseGraphToReactFlowElements(fixture, dummyPositions(fixture), new Set());
  assert.equal(edges.length, fixture.relationships.length);

  // The fixture's known duplicate-edge case: two distinct relationship
  // records between the same concept pair must produce two distinct
  // React Flow edges, never merged into one.
  const bfsShortestPathEdges = edges.filter(
    (e) => e.source === "c-bfs" && e.target === "c-shortest-path",
  );
  assert.equal(bfsShortestPathEdges.length, 2);
});

test("every concept node carries its concept's masteryState", () => {
  const { nodes } = courseGraphToReactFlowElements(fixture, dummyPositions(fixture), new Set());
  const bfsNode = nodes.find((n) => n.id === "c-bfs");
  assert.ok(bfsNode);
  assert.equal(bfsNode?.data.masteryState, "weak");
});

test("every edge carries its relationship's type, learnerState, and crossUnit flag", () => {
  const { edges } = courseGraphToReactFlowElements(fixture, dummyPositions(fixture), new Set());
  const treeGraphEdge = edges.find((e) => e.id === "r-tree-graph");
  assert.ok(treeGraphEdge);
  assert.equal(treeGraphEdge?.data?.type, "analogous-to");
  assert.equal(treeGraphEdge?.data?.learnerState, "strong");
  assert.equal(treeGraphEdge?.data?.crossUnit, true);
});

test("a collapsed unit's concept nodes are marked hidden, not removed", () => {
  const collapsed = new Set(["unit-graphs"]);
  const { nodes } = courseGraphToReactFlowElements(fixture, dummyPositions(fixture), collapsed);
  const bfsNode = nodes.find((n) => n.id === "c-bfs");
  assert.equal(bfsNode?.hidden, true);
  const treeNode = nodes.find((n) => n.id === "c-tree");
  assert.equal(treeNode?.hidden ?? false, false);
});
