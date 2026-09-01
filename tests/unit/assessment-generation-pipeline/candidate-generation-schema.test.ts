import test from "node:test";
import assert from "node:assert/strict";
import { parseCandidateResult } from "../../../src/features/assessment-generation-pipeline/candidate-generation-schema.ts";

function wellFormedCandidate() {
  return {
    questionText: "What is the time complexity of BFS on an adjacency-list graph?",
    rubric: { correctAnswer: "O(V + E)" },
    hints: ["Consider how many times each edge is visited."],
    commonMistakes: ["Confusing this with O(V^2) from an adjacency-matrix representation."],
    sourceAnchors: [{ conceptOrEdgeId: "concept-1", locator: "slide 4", excerpt: "BFS visits every edge once." }],
    responseModality: "text",
    checkerDomain: null,
    checkerInput: null,
  };
}

test("a well-formed candidate parses", () => {
  const parsed = parseCandidateResult(wellFormedCandidate());
  assert.equal(parsed.questionText, wellFormedCandidate().questionText);
  assert.equal(parsed.checkerDomain, null);
});

test("a candidate missing sourceAnchors is rejected", () => {
  const candidate = wellFormedCandidate() as Record<string, unknown>;
  candidate.sourceAnchors = [];
  assert.throws(() => parseCandidateResult(candidate));
});

test("a candidate with checkerInput set but checkerDomain null is rejected", () => {
  const candidate = wellFormedCandidate() as Record<string, unknown>;
  candidate.checkerInput = { graph: { nodeIds: [], edges: [], directed: false } };
  assert.throws(() => parseCandidateResult(candidate));
});

test("a candidate with checkerDomain set but checkerInput null is rejected", () => {
  const candidate = wellFormedCandidate() as Record<string, unknown>;
  candidate.checkerDomain = "bfs-dfs";
  assert.throws(() => parseCandidateResult(candidate));
});

test("a candidate with both checkerDomain and checkerInput set parses", () => {
  const candidate = wellFormedCandidate() as Record<string, unknown>;
  candidate.checkerDomain = "bfs-dfs";
  candidate.checkerInput = { graph: { nodeIds: ["a", "b"], edges: [["a", "b"]], directed: false }, algorithm: "bfs", startNodeId: "a", claimedOrder: ["a", "b"] };
  const parsed = parseCandidateResult(candidate);
  assert.equal(parsed.checkerDomain, "bfs-dfs");
});
