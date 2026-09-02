import test from "node:test";
import assert from "node:assert/strict";
import { runIndependentSolve } from "../../../src/features/assessment-generation-pipeline/independent-solve.ts";
import type { CandidateQuestion } from "../../../src/features/assessment-generation-pipeline/candidate-generation-schema.ts";

// checkerDomain !== null dispatches synchronously to a deterministic
// checker -- no OpenAI client call happens on this path, so these tests
// pass `undefined as any` for the openai parameter rather than a real
// client.

test("a checkerInput matching its declared domain's real shape is dispatched and graded", async () => {
  const candidate: CandidateQuestion = {
    questionText: "q",
    rubric: {},
    hints: [],
    commonMistakes: [],
    sourceAnchors: [],
    responseModality: "text",
    checkerDomain: "bfs-dfs",
    checkerInput: {
      graph: { nodeIds: ["a", "b"], edges: [["a", "b"]], directed: false },
      algorithm: "bfs",
      startNodeId: "a",
      claimedOrder: ["a", "b"],
    },
  };
  const result = await runIndependentSolve(candidate, undefined as never);
  assert.equal(result.passed, true);
});

test("a checkerInput that doesn't match its declared domain's real shape fails the layer instead of throwing (found live: a shortest-path candidate missing 'graph')", async () => {
  const candidate: CandidateQuestion = {
    questionText: "q",
    rubric: {},
    hints: [],
    commonMistakes: [],
    sourceAnchors: [],
    responseModality: "text",
    checkerDomain: "shortest-path",
    checkerInput: { sourceNodeId: "a", targetNodeId: "b", claimedPath: ["a", "b"], claimedTotalDistance: 1 },
  };
  const result = await runIndependentSolve(candidate, undefined as never);
  assert.equal(result.passed, false);
  assert.match(result.detail, /did not match checkerDomain/);
});
