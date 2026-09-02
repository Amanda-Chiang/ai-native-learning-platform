import test from "node:test";
import assert from "node:assert/strict";
import { parseCandidateResult } from "../../../src/features/assessment-generation-pipeline/candidate-generation-schema.ts";

// rubric/checkerInput are JSON-encoded STRINGS on the wire (OpenAI
// Structured Outputs strict mode has no "any object" schema -- found
// live, see candidate-generation-schema.ts's comment).
function wellFormedCandidate() {
  return {
    questionText: "What is the time complexity of BFS on an adjacency-list graph?",
    rubric: JSON.stringify({ correctAnswer: "O(V + E)" }),
    hints: ["Consider how many times each edge is visited."],
    commonMistakes: ["Confusing this with O(V^2) from an adjacency-matrix representation."],
    sourceAnchors: [{ conceptOrEdgeId: "concept-1", locator: "slide 4", excerpt: "BFS visits every edge once." }],
    responseModality: "text",
    checkerDomain: null,
    checkerInput: null,
  };
}

test("a well-formed candidate parses, decoding rubric's JSON string into an object", () => {
  const parsed = parseCandidateResult(wellFormedCandidate());
  assert.equal(parsed.questionText, wellFormedCandidate().questionText);
  assert.deepEqual(parsed.rubric, { correctAnswer: "O(V + E)" });
  assert.equal(parsed.checkerDomain, null);
});

test("a candidate missing sourceAnchors is rejected", () => {
  const candidate = wellFormedCandidate() as Record<string, unknown>;
  candidate.sourceAnchors = [];
  assert.throws(() => parseCandidateResult(candidate));
});

test("a candidate whose rubric is not valid JSON is rejected", () => {
  const candidate = wellFormedCandidate() as Record<string, unknown>;
  candidate.rubric = "{not valid json";
  assert.throws(() => parseCandidateResult(candidate));
});

test("a candidate with checkerInput set but checkerDomain null is rejected", () => {
  const candidate = wellFormedCandidate() as Record<string, unknown>;
  candidate.checkerInput = JSON.stringify({ graph: { nodeIds: [], edges: [], directed: false } });
  assert.throws(() => parseCandidateResult(candidate));
});

test("a candidate with checkerDomain set but checkerInput null is rejected", () => {
  const candidate = wellFormedCandidate() as Record<string, unknown>;
  candidate.checkerDomain = "bfs-dfs";
  assert.throws(() => parseCandidateResult(candidate));
});

test("a candidate with both checkerDomain and checkerInput set parses, decoding checkerInput's JSON string", () => {
  const candidate = wellFormedCandidate() as Record<string, unknown>;
  candidate.checkerDomain = "bfs-dfs";
  candidate.checkerInput = JSON.stringify({
    graph: { nodeIds: ["a", "b"], edges: [["a", "b"]], directed: false },
    algorithm: "bfs",
    startNodeId: "a",
    claimedOrder: ["a", "b"],
  });
  const parsed = parseCandidateResult(candidate);
  assert.equal(parsed.checkerDomain, "bfs-dfs");
  assert.deepEqual(parsed.checkerInput, {
    graph: { nodeIds: ["a", "b"], edges: [["a", "b"]], directed: false },
    algorithm: "bfs",
    startNodeId: "a",
    claimedOrder: ["a", "b"],
  });
});
