import test from "node:test";
import assert from "node:assert/strict";
import { layoutTree } from "../../../src/features/visual-assessment/tree-layout.ts";

test("every real node appears exactly once in the layout output", () => {
  const tree = { value: 5, left: { value: 3, left: null, right: null }, right: { value: 8, left: null, right: null } };
  const layout = layoutTree(tree);
  assert.equal(layout.nodes.length, 3);
  assert.deepEqual(layout.nodes.map((n) => n.label).sort(), ["3", "5", "8"]);
});

test("every real edge appears exactly once, connecting parent to child", () => {
  const tree = { value: 5, left: { value: 3, left: null, right: null }, right: { value: 8, left: null, right: null } };
  const layout = layoutTree(tree);
  assert.equal(layout.edges.length, 2);
  const rootId = layout.nodes.find((n) => n.label === "5")!.id;
  assert.ok(layout.edges.every((e) => e.sourceId === rootId));
});

test("no node is placed at a duplicate position, even with duplicate values at different tree positions", () => {
  const tree = { value: 5, left: { value: 5, left: null, right: null }, right: { value: 5, left: null, right: null } };
  const layout = layoutTree(tree);
  assert.equal(layout.nodes.length, 3);
  const positions = layout.nodes.map((n) => `${n.x},${n.y}`);
  assert.equal(new Set(positions).size, 3);
});

test("an empty tree produces an empty layout", () => {
  const layout = layoutTree(null);
  assert.deepEqual(layout.nodes, []);
  assert.deepEqual(layout.edges, []);
});
