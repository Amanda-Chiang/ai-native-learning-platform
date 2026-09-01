import test from "node:test";
import assert from "node:assert/strict";
import { applyLearnerState } from "../../../src/features/learner-graph-evidence/apply-learner-state.ts";
import type { CourseGraph } from "../../../src/types/graph/course-graph.ts";

function makeGraph(): CourseGraph {
  return {
    units: [{ id: "unit-1", title: "Unit 1", conceptIds: ["c1", "c2"] }],
    concepts: [
      { id: "c1", canonicalLabel: "Concept 1", aliases: [], masteryState: "unverified" },
      { id: "c2", canonicalLabel: "Concept 2", aliases: [], masteryState: "unverified" },
    ],
    relationships: [
      {
        id: "r1",
        type: "prerequisite-of",
        fromConceptId: "c1",
        toConceptId: "c2",
        crossUnit: false,
        learnerState: "strong",
      },
    ],
  };
}

test("a concept present in the state map is overlaid with its real masteryState", () => {
  const graph = makeGraph();
  const result = applyLearnerState(graph, new Map([["c1", { masteryState: "solid" }]]), new Map());
  assert.equal(result.concepts.find((c) => c.id === "c1")!.masteryState, "solid");
});

test("a concept absent from the map keeps the input graph's original baseline masteryState unchanged", () => {
  const graph = makeGraph();
  const result = applyLearnerState(graph, new Map([["c1", { masteryState: "solid" }]]), new Map());
  assert.equal(result.concepts.find((c) => c.id === "c2")!.masteryState, "unverified");
});

test("the same overlay behavior applies to edges' learnerState/explanation", () => {
  const graph = makeGraph();
  const result = applyLearnerState(
    graph,
    new Map(),
    new Map([["r1", { learnerState: "weak" as const, explanation: "not enough evidence" }]]),
  );
  const rel = result.relationships.find((r) => r.id === "r1")!;
  assert.equal(rel.learnerState, "weak");
  assert.equal(rel.explanation, "not enough evidence");
});

test("the input CourseGraph object is not mutated", () => {
  const graph = makeGraph();
  const originalConceptsRef = graph.concepts;
  applyLearnerState(graph, new Map([["c1", { masteryState: "solid" }]]), new Map());
  assert.equal(graph.concepts, originalConceptsRef);
  assert.equal(graph.concepts.find((c) => c.id === "c1")!.masteryState, "unverified");
});
