import test from "node:test";
import assert from "node:assert/strict";
import { parseExtractionResult } from "../../../src/features/course-graph-ingestion/extraction-schema.ts";

const validResponse = {
  units: [],
  concepts: [
    {
      localId: "c1",
      canonicalName: "Breadth-First Search",
      aliases: ["BFS"],
      description: "Explores graph nodes in increasing order of distance from a source vertex.",
      importanceScore: 0.9,
      sourceAnchors: [{ locator: "slide 4", excerpt: "Explore in increasing order of distance" }],
      confidence: 0.9,
      unitRef: { kind: "existing", unitId: "placeholder-existing-unit" },
    },
    {
      localId: "c2",
      canonicalName: "Shortest Path",
      aliases: [],
      description: "The path between two vertices with the minimum total edge weight/count.",
      importanceScore: 0.7,
      sourceAnchors: [{ locator: "slide 6", excerpt: "Shortest path in an unweighted graph" }],
      confidence: 0.85,
      unitRef: { kind: "existing", unitId: "placeholder-existing-unit" },
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

const validResponseWithUnits = {
  units: [{ localId: "u1", title: "Graph Theory" }],
  concepts: [
    {
      localId: "c1",
      canonicalName: "Breadth-First Search",
      aliases: ["BFS"],
      description: "Explores graph nodes in increasing order of distance from a source vertex.",
      importanceScore: 0.9,
      sourceAnchors: [{ locator: "slide 4", excerpt: "Explore in increasing order of distance" }],
      confidence: 0.9,
      unitRef: { kind: "new", localId: "u1" },
    },
  ],
  edges: [],
};

test("a well-formed response parses into candidates", () => {
  const result = parseExtractionResult(validResponse);
  assert.equal(result.concepts.length, 2);
  assert.equal(result.edges.length, 1);
  assert.equal(result.concepts[0].canonicalName, "Breadth-First Search");
});

test("a response with zero candidates parses as a valid empty list (spec Edge Cases)", () => {
  const result = parseExtractionResult({ units: [], concepts: [], edges: [] });
  assert.deepEqual(result, { units: [], concepts: [], edges: [] });
});

test("a response missing a required field is rejected, not silently coerced", () => {
  const { description, ...conceptMissingDescription } = validResponse.concepts[0];
  const invalid = { ...validResponse, concepts: [conceptMissingDescription] };
  assert.throws(() => parseExtractionResult(invalid), /concepts/);
});

test("an edge referencing an unknown localId is rejected", () => {
  const invalid = {
    units: [],
    concepts: [validResponse.concepts[0]],
    edges: [{ ...validResponse.edges[0], targetLocalId: "does-not-exist" }],
  };
  assert.throws(() => parseExtractionResult(invalid), /unknown targetLocalId/);
});

test("relationType 'other' without relationTypeNote is rejected", () => {
  const invalid = {
    units: [],
    concepts: validResponse.concepts,
    edges: [{ ...validResponse.edges[0], relationType: "other", relationTypeNote: null }],
  };
  assert.throws(() => parseExtractionResult(invalid), /edges/);
});

test("a non-object response is rejected", () => {
  assert.throws(() => parseExtractionResult(null), /not an object/);
  assert.throws(() => parseExtractionResult("not json"), /not an object/);
});

test("a response with a new unit and a concept referencing it parses successfully", () => {
  const result = parseExtractionResult(validResponseWithUnits);
  assert.equal(result.units.length, 1);
  assert.equal(result.units[0].localId, "u1");
  assert.deepEqual(result.concepts[0].unitRef, { kind: "new", localId: "u1" });
});

test("a concept's unitRef of kind 'new' referencing a localId absent from units[] throws", () => {
  const bad = {
    units: [],
    concepts: [{ ...validResponseWithUnits.concepts[0], unitRef: { kind: "new", localId: "u1" } }],
    edges: [],
  };
  assert.throws(() => parseExtractionResult(bad), /unitRef.*"u1"/);
});

test("a concept's unitRef of kind 'existing' with a real-looking id parses without requiring a units[] entry", () => {
  const withExisting = {
    units: [],
    concepts: [
      { ...validResponseWithUnits.concepts[0], unitRef: { kind: "existing", unitId: "real-unit-id-123" } },
    ],
    edges: [],
  };
  const result = parseExtractionResult(withExisting);
  assert.deepEqual(result.concepts[0].unitRef, { kind: "existing", unitId: "real-unit-id-123" });
});

test("a malformed unitRef (missing kind) throws", () => {
  const bad = {
    units: [],
    concepts: [{ ...validResponseWithUnits.concepts[0], unitRef: { unitId: "x" } }],
    edges: [],
  };
  assert.throws(() => parseExtractionResult(bad));
});
