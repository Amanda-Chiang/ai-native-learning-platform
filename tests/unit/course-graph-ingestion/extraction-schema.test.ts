import test from "node:test";
import assert from "node:assert/strict";
import { parseExtractionResult } from "../../../src/features/course-graph-ingestion/extraction-schema.ts";

const validResponse = {
  concepts: [
    {
      localId: "c1",
      canonicalName: "Breadth-First Search",
      aliases: ["BFS"],
      description: "Explores graph nodes in increasing order of distance from a source vertex.",
      importanceScore: 0.9,
      sourceAnchors: [{ locator: "slide 4", excerpt: "Explore in increasing order of distance" }],
      confidence: 0.9,
    },
    {
      localId: "c2",
      canonicalName: "Shortest Path",
      aliases: [],
      description: "The path between two vertices with the minimum total edge weight/count.",
      importanceScore: 0.7,
      sourceAnchors: [{ locator: "slide 6", excerpt: "Shortest path in an unweighted graph" }],
      confidence: 0.85,
    },
  ],
  edges: [
    {
      sourceLocalId: "c1",
      targetLocalId: "c2",
      relationType: "mechanism_for",
      relationTypeNote: null,
      explanation: "BFS is the mechanism used to compute shortest paths in an unweighted graph.",
      sourceAnchors: [{ locator: "slide 6", excerpt: "BFS computes shortest paths" }],
      confidence: 0.8,
    },
  ],
};

test("a well-formed response parses into candidates", () => {
  const result = parseExtractionResult(validResponse);
  assert.equal(result.concepts.length, 2);
  assert.equal(result.edges.length, 1);
  assert.equal(result.concepts[0].canonicalName, "Breadth-First Search");
});

test("a response with zero candidates parses as a valid empty list (spec Edge Cases)", () => {
  const result = parseExtractionResult({ concepts: [], edges: [] });
  assert.deepEqual(result, { concepts: [], edges: [] });
});

test("a response missing a required field is rejected, not silently coerced", () => {
  const { description, ...conceptMissingDescription } = validResponse.concepts[0];
  const invalid = { ...validResponse, concepts: [conceptMissingDescription] };
  assert.throws(() => parseExtractionResult(invalid), /concepts/);
});

test("an edge referencing an unknown localId is rejected", () => {
  const invalid = {
    concepts: [validResponse.concepts[0]],
    edges: [{ ...validResponse.edges[0], targetLocalId: "does-not-exist" }],
  };
  assert.throws(() => parseExtractionResult(invalid), /unknown targetLocalId/);
});

test("relationType 'other' without relationTypeNote is rejected", () => {
  const invalid = {
    concepts: validResponse.concepts,
    edges: [{ ...validResponse.edges[0], relationType: "other", relationTypeNote: null }],
  };
  assert.throws(() => parseExtractionResult(invalid), /edges/);
});

test("a non-object response is rejected", () => {
  assert.throws(() => parseExtractionResult(null), /not an object/);
  assert.throws(() => parseExtractionResult("not json"), /not an object/);
});
