import test from "node:test";
import assert from "node:assert/strict";
import { resolveEdgeEndpoints } from "../../../trigger/extract-course-graph.ts";
import type { CandidateEdge } from "../../../src/features/course-graph-ingestion/extraction-schema.ts";

function edge(overrides: Partial<CandidateEdge> = {}): CandidateEdge {
  return {
    sourceLocalId: "c1",
    targetLocalId: "c2",
    relationType: "mechanism_for",
    relationTypeNote: null,
    explanation: "...",
    sourceAnchors: [{ locator: "slide 1", excerpt: "..." }],
    confidence: 0.8,
    ...overrides,
  };
}

test("a candidate edge whose two endpoints both reconcile onto the same existing concept is dropped and counted, not written", () => {
  // Both c1 and c2 merged onto the same pre-existing concept.
  const localIdToRealId = new Map([
    ["c1", "concept-real-1"],
    ["c2", "concept-real-1"],
  ]);

  const { toInsert, droppedSelfReferential } = resolveEdgeEndpoints([edge()], localIdToRealId);

  assert.equal(toInsert.length, 0);
  assert.equal(droppedSelfReferential, 1);
});

test("an ordinary edge between two genuinely distinct concepts is unaffected by this check", () => {
  const localIdToRealId = new Map([
    ["c1", "concept-real-1"],
    ["c2", "concept-real-2"],
  ]);

  const { toInsert, droppedSelfReferential } = resolveEdgeEndpoints([edge()], localIdToRealId);

  assert.equal(toInsert.length, 1);
  assert.equal(droppedSelfReferential, 0);
  assert.equal(toInsert[0].sourceConceptId, "concept-real-1");
  assert.equal(toInsert[0].targetConceptId, "concept-real-2");
});

test("a mix of self-referential and ordinary edges only drops the self-referential ones", () => {
  const localIdToRealId = new Map([
    ["c1", "concept-real-1"],
    ["c2", "concept-real-1"],
    ["c3", "concept-real-2"],
  ]);

  const { toInsert, droppedSelfReferential } = resolveEdgeEndpoints(
    [edge({ sourceLocalId: "c1", targetLocalId: "c2" }), edge({ sourceLocalId: "c1", targetLocalId: "c3" })],
    localIdToRealId,
  );

  assert.equal(toInsert.length, 1);
  assert.equal(droppedSelfReferential, 1);
});

test("an edge referencing a localId missing from the map throws rather than silently dropping", () => {
  const localIdToRealId = new Map([["c1", "concept-real-1"]]);
  assert.throws(() => resolveEdgeEndpoints([edge()], localIdToRealId), /not present in localIdToRealId/);
});
