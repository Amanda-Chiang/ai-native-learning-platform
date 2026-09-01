import test from "node:test";
import assert from "node:assert/strict";
import { isAssessment, type Assessment } from "../../../src/types/domain/assessment.ts";

const validAssessment: Assessment = {
  id: "assessment-bfs-application",
  targetConceptIds: ["concept-bfs"],
  targetEdgeIds: ["edge-fifo-mechanism-bfs"],
  assessmentType: "application",
  difficulty: 0.5,
  courseStyleRefs: ["lecture-09-breadth-first-search"],
  requiredPrerequisites: ["concept-fifo-queue"],
  forbiddenConcepts: ["concept-dijkstra"],
  responseModality: "graph",
  expectedSolutionProperties: ["visits nodes in level order", "produces a valid shortest-path tree"],
  maxTimeMinutes: 10,
};

test("a valid Assessment passes isAssessment", () => {
  assert.equal(isAssessment(validAssessment), true);
});

test("an Assessment with both targetConceptIds and targetEdgeIds empty fails", () => {
  const invalid = { ...validAssessment, targetConceptIds: [], targetEdgeIds: [] };
  assert.equal(isAssessment(invalid), false);
});

test("an Assessment targeting only concepts (no edges) is still valid", () => {
  const valid = { ...validAssessment, targetEdgeIds: [] };
  assert.equal(isAssessment(valid), true);
});
