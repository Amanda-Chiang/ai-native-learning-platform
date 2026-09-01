import test from "node:test";
import assert from "node:assert/strict";
import { isConceptEdge, type ConceptEdge } from "../../../src/types/domain/concept-edge.ts";

const validEdge: ConceptEdge = {
  id: "edge-fifo-mechanism-bfs",
  sourceConceptId: "concept-fifo-queue",
  targetConceptId: "concept-bfs",
  relationType: "mechanism_for",
  explanation: "The FIFO order in which vertices are processed level-by-level is what produces BFS's shortest-path guarantee.",
  sourceAnchors: [
    {
      artifactId: "lecture-09-breadth-first-search",
      locator: "Breadth-First Search (BFS) section",
      excerpt: "Idea! Explore graph nodes in increasing order of distance",
    },
  ],
  status: "confirmed",
  confidence: 0.85,
};

test("a valid ConceptEdge passes isConceptEdge", () => {
  assert.equal(isConceptEdge(validEdge), true);
});

test("a ConceptEdge with relationType 'other' and no relationTypeNote fails", () => {
  const invalid = { ...validEdge, relationType: "other" as const };
  assert.equal(isConceptEdge(invalid), false);
});

test("a ConceptEdge with relationType 'other' and a relationTypeNote passes", () => {
  const valid = {
    ...validEdge,
    relationType: "other" as const,
    relationTypeNote: "Not a clean fit for the standard taxonomy; see edge-cases.json.",
  };
  assert.equal(isConceptEdge(valid), true);
});

test("a ConceptEdge with a relationTypeNote but a non-'other' relationType fails", () => {
  const invalid = { ...validEdge, relationTypeNote: "should not be set" };
  assert.equal(isConceptEdge(invalid), false);
});

test("a ConceptEdge with no sourceAnchors fails", () => {
  const invalid = { ...validEdge, sourceAnchors: [] };
  assert.equal(isConceptEdge(invalid), false);
});
