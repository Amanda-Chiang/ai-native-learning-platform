import test from "node:test";
import assert from "node:assert/strict";
import { getConceptNeighbors } from "../../../src/features/tutor-agent/search-course-materials.ts";
import type { ConceptEdgeRow } from "../../../src/lib/supabase/database.types.ts";

const ANCHOR = [{ artifactId: "artifact-1", locator: "slide 1", excerpt: "BFS explores in order of distance." }];

function makeEdge(overrides: Partial<ConceptEdgeRow> & { id: string }): ConceptEdgeRow {
  return {
    course_id: "course-1",
    owner_id: "owner-1",
    source_concept_id: "c1",
    target_concept_id: "c2",
    relation_type: "mechanism_for",
    relation_type_note: null,
    explanation: "BFS is the mechanism used to compute shortest paths.",
    source_anchors: ANCHOR,
    status: "confirmed",
    confidence: 0.9,
    extraction_run_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("returns only confirmed edges touching the concept as either endpoint, scoped to the course", () => {
  const edges = [
    makeEdge({ id: "e1", source_concept_id: "c1", target_concept_id: "c2" }),
    makeEdge({ id: "e2", source_concept_id: "c2", target_concept_id: "c1", status: "proposed" }),
    makeEdge({ id: "e3", source_concept_id: "c9", target_concept_id: "c8" }),
    makeEdge({ id: "e4", source_concept_id: "c1", target_concept_id: "c2", course_id: "course-2" }),
  ];
  const result = getConceptNeighbors(edges, "course-1", "c1");
  assert.deepEqual(
    result.map((r) => r.edgeId),
    ["e1"],
  );
});

test("a concept with no edges returns an empty array, never a fabricated relationship", () => {
  assert.deepEqual(getConceptNeighbors([], "course-1", "c1"), []);
});

test("each result identifies the neighboring concept id (the endpoint that isn't the queried concept)", () => {
  const edges = [makeEdge({ id: "e1", source_concept_id: "c1", target_concept_id: "c2" })];
  const result = getConceptNeighbors(edges, "course-1", "c1");
  assert.equal(result[0].neighborConceptId, "c2");
});
