import test from "node:test";
import assert from "node:assert/strict";
import { searchCourseMaterials } from "../../../src/features/tutor-agent/search-course-materials.ts";
import type { CourseConceptRow, ConceptEdgeRow } from "../../../src/lib/supabase/database.types.ts";

const ANCHOR = [{ artifactId: "artifact-1", locator: "slide 1", excerpt: "BFS explores in order of distance." }];

function makeConcept(overrides: Partial<CourseConceptRow> & { id: string }): CourseConceptRow {
  return {
    course_id: "course-1",
    owner_id: "owner-1",
    unit_id: "unit-1",
    canonical_name: "Breadth-First Search",
    aliases: ["BFS"],
    description: "Explores graph nodes in increasing order of distance.",
    importance_score: 0.8,
    source_anchors: ANCHOR,
    status: "confirmed",
    confidence: 0.9,
    extraction_run_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

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

test("a query scoped to one course_id never returns another course's rows", () => {
  const concepts = [makeConcept({ id: "c1", course_id: "course-1" }), makeConcept({ id: "c2", course_id: "course-2" })];
  const result = searchCourseMaterials(concepts, [], "course-1", "breadth");
  assert.equal(result.concepts.length, 1);
  assert.equal(result.concepts[0].id, "c1");
});

test("only status='confirmed' concepts/edges are matched", () => {
  const concepts = [
    makeConcept({ id: "c1", status: "confirmed" }),
    makeConcept({ id: "c2", status: "proposed" }),
  ];
  const result = searchCourseMaterials(concepts, [], "course-1", "breadth");
  assert.deepEqual(result.concepts.map((c) => c.id), ["c1"]);
});

test("matching is case-insensitive against canonical_name/aliases/description", () => {
  const concepts = [makeConcept({ id: "c1" })];
  assert.equal(searchCourseMaterials(concepts, [], "course-1", "BREADTH-FIRST").concepts.length, 1);
  assert.equal(searchCourseMaterials(concepts, [], "course-1", "bfs").concepts.length, 1);
  assert.equal(searchCourseMaterials(concepts, [], "course-1", "increasing order").concepts.length, 1);
});

test("edges match against explanation", () => {
  const edges = [makeEdge({ id: "e1" })];
  const result = searchCourseMaterials([], edges, "course-1", "shortest paths");
  assert.equal(result.edges.length, 1);
  assert.equal(result.edges[0].id, "e1");
});

test("a query matching nothing returns an empty array, never a fabricated result", () => {
  const concepts = [makeConcept({ id: "c1" })];
  const result = searchCourseMaterials(concepts, [], "course-1", "quantum entanglement");
  assert.deepEqual(result.concepts, []);
});

test("every returned item carries its real source_anchors unchanged", () => {
  const concepts = [makeConcept({ id: "c1" })];
  const result = searchCourseMaterials(concepts, [], "course-1", "bfs");
  assert.deepEqual(result.concepts[0].sourceAnchors, ANCHOR);
});
