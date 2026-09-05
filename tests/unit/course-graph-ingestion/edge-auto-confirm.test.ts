import test from "node:test";
import assert from "node:assert/strict";
import { shouldEdgeAutoConfirm } from "../../../trigger/extract-course-graph.ts";
import { resolveOtherEndpoint, shouldAutoConfirmEdge } from "../../../src/features/course-graph-ingestion/edge-auto-confirm.ts";

test("shouldEdgeAutoConfirm: both endpoints confirmed -> true", () => {
  assert.equal(shouldEdgeAutoConfirm("confirmed", "confirmed"), true);
});

test("shouldEdgeAutoConfirm: one confirmed, one proposed -> false", () => {
  assert.equal(shouldEdgeAutoConfirm("confirmed", "proposed"), false);
  assert.equal(shouldEdgeAutoConfirm("proposed", "confirmed"), false);
});

test("shouldEdgeAutoConfirm: both proposed -> false", () => {
  assert.equal(shouldEdgeAutoConfirm("proposed", "proposed"), false);
});

test("shouldEdgeAutoConfirm: a missing status (concept id that didn't resolve) never crashes, and is treated as not confirmed", () => {
  assert.equal(shouldEdgeAutoConfirm(undefined, "confirmed"), false);
  assert.equal(shouldEdgeAutoConfirm("confirmed", undefined), false);
  assert.equal(shouldEdgeAutoConfirm(undefined, undefined), false);
});

test("resolveOtherEndpoint: the just-confirmed concept is the edge's source -> the target is the other endpoint", () => {
  const edge = { source_concept_id: "confirmed-one", target_concept_id: "other" };
  assert.equal(resolveOtherEndpoint(edge, "confirmed-one"), "other");
});

test("resolveOtherEndpoint: the just-confirmed concept is the edge's target -> the source is the other endpoint", () => {
  const edge = { source_concept_id: "other", target_concept_id: "confirmed-one" };
  assert.equal(resolveOtherEndpoint(edge, "confirmed-one"), "other");
});

test("shouldAutoConfirmEdge: the other endpoint is already confirmed -> true", () => {
  assert.equal(shouldAutoConfirmEdge("confirmed"), true);
});

test("shouldAutoConfirmEdge: the other endpoint is still proposed -> false", () => {
  assert.equal(shouldAutoConfirmEdge("proposed"), false);
});

test("shouldAutoConfirmEdge: a missing status (no row found for the other endpoint) never crashes, and is treated as not confirmed", () => {
  assert.equal(shouldAutoConfirmEdge(undefined), false);
});
