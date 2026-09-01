import test from "node:test";
import assert from "node:assert/strict";
import { checkSourceAlignment } from "../../../src/features/assessment-generation-pipeline/source-alignment-check.ts";
import type { Assessment } from "../../../src/types/domain/assessment.ts";
import type { CandidateQuestion } from "../../../src/features/assessment-generation-pipeline/candidate-generation-schema.ts";

const blueprint: Assessment = {
  id: "bp-1",
  targetConceptIds: ["concept-1"],
  targetEdgeIds: ["edge-1"],
  assessmentType: "mechanism",
  difficulty: 0.5,
  courseStyleRefs: [],
  requiredPrerequisites: [],
  forbiddenConcepts: [],
  responseModality: "text",
  expectedSolutionProperties: [],
  maxTimeMinutes: 10,
};

function candidateWithAnchors(conceptOrEdgeIds: string[]): CandidateQuestion {
  return {
    questionText: "q",
    rubric: {},
    hints: [],
    commonMistakes: [],
    sourceAnchors: conceptOrEdgeIds.map((id) => ({ conceptOrEdgeId: id, locator: "l", excerpt: "e" })),
    responseModality: "text",
    checkerDomain: null,
    checkerInput: null,
  };
}

test("sourceAnchors resolving to the blueprint's real targets passes", () => {
  const result = checkSourceAlignment(candidateWithAnchors(["concept-1", "edge-1"]), blueprint);
  assert.equal(result.passed, true);
});

test("an anchor outside the blueprint's targets fails, naming the mismatched anchor", () => {
  const result = checkSourceAlignment(candidateWithAnchors(["concept-1", "concept-999"]), blueprint);
  assert.equal(result.passed, false);
  assert.match(result.detail, /concept-999/);
});
