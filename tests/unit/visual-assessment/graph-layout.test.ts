import test from "node:test";
import assert from "node:assert/strict";
import { layoutGraph } from "../../../src/features/visual-assessment/graph-layout.ts";

test("every real node appears exactly once in the layout output", () => {
  const graph: { nodeIds: string[]; edges: [string, string][]; directed: boolean } = { nodeIds: ["a", "b", "c"], edges: [["a", "b"], ["b", "c"]], directed: false };
  const layout = layoutGraph(graph);
  assert.equal(layout.nodes.length, 3);
  assert.deepEqual(layout.nodes.map((n) => n.id).sort(), ["a", "b", "c"]);
});

test("every real edge appears exactly once in the layout output", () => {
  const graph: { nodeIds: string[]; edges: [string, string][]; directed: boolean } = { nodeIds: ["a", "b", "c"], edges: [["a", "b"], ["b", "c"]], directed: false };
  const layout = layoutGraph(graph);
  assert.equal(layout.edges.length, 2);
  assert.deepEqual(layout.edges, [{ sourceId: "a", targetId: "b" }, { sourceId: "b", targetId: "c" }]);
});

test("no node is placed at a duplicate or undefined position", () => {
  const graph = { nodeIds: ["a", "b", "c", "d"], edges: [], directed: false };
  const layout = layoutGraph(graph);
  const positions = layout.nodes.map((n) => `${n.x},${n.y}`);
  assert.equal(new Set(positions).size, positions.length);
  for (const node of layout.nodes) {
    assert.ok(Number.isFinite(node.x));
    assert.ok(Number.isFinite(node.y));
  }
});
