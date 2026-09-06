import test from "node:test";
import assert from "node:assert/strict";
import { selectSweepableEdgeIds } from "../../../src/features/course-graph-ingestion/edge-auto-confirm.ts";

/**
 * The deterministic backstop for edge auto-confirm (final-review I4).
 * Its decision half is pure and tested here; the cascade that calls it
 * (autoConfirmEligibleEdges / sweepEligibleEdges in actions.ts) needs a
 * live Supabase client, so its structure is asserted by source
 * inspection at the bottom of this file -- the same technique
 * submit-flag.test.ts established.
 */

const edge = (id: string, source: string, target: string) => ({
  id,
  source_concept_id: source,
  target_concept_id: target,
});

test("an edge with both endpoints confirmed is swept", () => {
  const ids = selectSweepableEdgeIds([edge("e1", "c1", "c2")], new Set(["c1", "c2"]));
  assert.deepEqual(ids, ["e1"]);
});

test("an edge with only one endpoint confirmed is not swept (either direction)", () => {
  assert.deepEqual(selectSweepableEdgeIds([edge("e1", "c1", "c2")], new Set(["c1"])), []);
  assert.deepEqual(selectSweepableEdgeIds([edge("e1", "c1", "c2")], new Set(["c2"])), []);
});

test("an edge with neither endpoint confirmed is not swept", () => {
  assert.deepEqual(selectSweepableEdgeIds([edge("e1", "c1", "c2")], new Set<string>()), []);
});

test("the sweep is order-independent: two concepts confirmed in either order yield the same edge", () => {
  // This is the scenario the per-confirm cascade can lose entirely -- each
  // confirm reads the other endpoint as still 'proposed'. Deciding from
  // the final state instead makes the outcome independent of ordering.
  const edges = [edge("e1", "c1", "c2"), edge("e2", "c2", "c3")];
  const finalState = new Set(["c1", "c2"]);

  assert.deepEqual(selectSweepableEdgeIds(edges, finalState), ["e1"]);
  assert.deepEqual(selectSweepableEdgeIds([...edges].reverse(), finalState), ["e1"]);
});

test("only the eligible subset of a mixed batch is returned", () => {
  const edges = [edge("e1", "c1", "c2"), edge("e2", "c2", "c9"), edge("e3", "c2", "c3")];

  assert.deepEqual(selectSweepableEdgeIds(edges, new Set(["c1", "c2", "c3"])), ["e1", "e3"]);
});

async function readActionsSource(): Promise<string> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  return fs.readFile(
    path.join(import.meta.dirname, "../../../src/features/course-graph-ingestion/actions.ts"),
    "utf-8",
  );
}

test("autoConfirmEligibleEdges never fails silently -- every early-out reports", async () => {
  const source = await readActionsSource();
  const start = source.indexOf("async function autoConfirmEligibleEdges");
  const end = source.indexOf("export async function sweepEligibleEdges");
  assert.ok(start !== -1 && end > start, "expected autoConfirmEligibleEdges before sweepEligibleEdges");
  const body = source.slice(start, end);

  // Three failure paths existed and all three were silent: a failed edges
  // query returned, a failed status lookup continued, and the confirm's
  // own error was discarded. An edge that misses this cascade has no
  // other path into the graph, so each one must leave a trace.
  const logCalls = [...body.matchAll(/console\.error\(/g)];
  assert.equal(logCalls.length, 3, "each of the three failure paths must be logged");
  assert.ok(
    body.includes("const { error: confirmError } = await confirmCandidate("),
    "the cascade must inspect confirmCandidate's returned error rather than discarding it",
  );
});

test("sweepEligibleEdges returns a real error instead of swallowing one", async () => {
  const source = await readActionsSource();
  const start = source.indexOf("export async function sweepEligibleEdges");
  const end = source.indexOf("export async function rejectCandidate");
  assert.ok(start !== -1 && end > start, "expected sweepEligibleEdges before rejectCandidate");
  const body = source.slice(start, end);

  // A failed sweep means relationships may be silently missing from the
  // Atlas -- the caller has to be able to tell.
  const returns = [...body.matchAll(/return \{ confirmed: \d+, error: (\w+|null) \}/g)].map((m) => m[1]);
  assert.ok(returns.includes("message"), "query failures must be returned to the caller");
  assert.ok(returns.includes("null"), "the success path must return a null error");
});
