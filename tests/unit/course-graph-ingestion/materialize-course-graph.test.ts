import test from "node:test";
import assert from "node:assert/strict";
import { materializeCourseGraph } from "../../../src/features/course-graph-ingestion/materialize-course-graph.ts";
import type { CourseConceptRow, ConceptEdgeRow, CourseUnitRow } from "../../../src/lib/supabase/database.types.ts";

const unit: CourseUnitRow = {
  id: "unit-1",
  course_id: "course-1",
  owner_id: "owner-1",
  title: "Graphs",
  status: "confirmed",
  extraction_run_id: null,
  created_at: "2026-01-01T00:00:00Z",
};

const otherUnit: CourseUnitRow = { ...unit, id: "unit-2", title: "Trees" };

function concept(overrides: Partial<CourseConceptRow> = {}): CourseConceptRow {
  return {
    id: "concept-1",
    course_id: "course-1",
    owner_id: "owner-1",
    unit_id: "unit-1",
    canonical_name: "Breadth-First Search",
    aliases: ["BFS"],
    description: "...",
    importance_score: 0.9,
    source_anchors: [{ artifactId: "a1", locator: "slide 1", excerpt: "..." }],
    status: "confirmed",
    confidence: 0.9,
    extraction_run_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function edge(overrides: Partial<ConceptEdgeRow> = {}): ConceptEdgeRow {
  return {
    id: "edge-1",
    course_id: "course-1",
    owner_id: "owner-1",
    source_concept_id: "concept-1",
    target_concept_id: "concept-2",
    relation_type: "mechanism_for",
    relation_type_note: null,
    explanation: "BFS computes shortest paths.",
    source_anchors: [{ artifactId: "a1", locator: "slide 2", excerpt: "..." }],
    status: "confirmed",
    confidence: 0.9,
    extraction_run_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

test("a confirmed concept appears at the baseline masteryState, never fabricated", () => {
  const graph = materializeCourseGraph([unit], [concept()], []);
  assert.equal(graph.concepts.length, 1);
  assert.equal(graph.concepts[0].masteryState, "unverified");
});

test("a confirmed edge appears at the baseline learnerState, never fabricated", () => {
  const concept2 = concept({ id: "concept-2", canonical_name: "Shortest Path" });
  const graph = materializeCourseGraph([unit], [concept(), concept2], [edge()]);
  assert.equal(graph.relationships.length, 1);
  assert.equal(graph.relationships[0].learnerState, "strong");
});

test("crossUnit is computed from whether the two endpoints' units differ", () => {
  const concept2 = concept({ id: "concept-2", canonical_name: "Tree Traversal", unit_id: "unit-2" });
  const graph = materializeCourseGraph([unit, otherUnit], [concept(), concept2], [edge()]);
  assert.equal(graph.relationships[0].crossUnit, true);
});

test("zero confirmed units/concepts/edges produces a valid empty graph, not an error", () => {
  const graph = materializeCourseGraph([], [], []);
  assert.deepEqual(graph, { units: [], concepts: [], relationships: [] });
});

test("a concept with an unresolvable unit_id throws rather than silently omitting it", () => {
  const orphan = concept({ unit_id: "unit-does-not-exist" });
  assert.throws(() => materializeCourseGraph([unit], [orphan], []), /does not exist/);
});

test("units group their concepts' ids correctly", () => {
  const concept2 = concept({ id: "concept-2", canonical_name: "Tree", unit_id: "unit-2" });
  const graph = materializeCourseGraph([unit, otherUnit], [concept(), concept2], []);
  const graphsUnit = graph.units.find((u) => u.id === "unit-1")!;
  const treesUnit = graph.units.find((u) => u.id === "unit-2")!;
  assert.deepEqual(graphsUnit.conceptIds, ["concept-1"]);
  assert.deepEqual(treesUnit.conceptIds, ["concept-2"]);
});
