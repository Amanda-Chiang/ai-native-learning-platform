import test from "node:test";
import assert from "node:assert/strict";
import {
  validateSearchCourseMaterialsArgs,
  validateGetConceptStateArgs,
  validateGetConceptNeighborsArgs,
  validateRecordExposureArgs,
  validateRecordMisconceptionCandidateArgs,
} from "../../../src/features/tutor-agent/tool-call-validation.ts";

test("validateSearchCourseMaterialsArgs rejects a call missing query", () => {
  const result = validateSearchCourseMaterialsArgs({});
  assert.equal(result.valid, false);
});

test("validateSearchCourseMaterialsArgs accepts a real query", () => {
  const result = validateSearchCourseMaterialsArgs({ query: "breadth-first search" });
  assert.equal(result.valid, true);
});

test("validateGetConceptStateArgs rejects an empty conceptIds array", () => {
  const result = validateGetConceptStateArgs({ conceptIds: [] });
  assert.equal(result.valid, false);
});

test("validateGetConceptStateArgs accepts a non-empty conceptIds array", () => {
  const result = validateGetConceptStateArgs({ conceptIds: ["c1"] });
  assert.equal(result.valid, true);
});

test("validateGetConceptNeighborsArgs rejects a call missing conceptId", () => {
  const result = validateGetConceptNeighborsArgs({});
  assert.equal(result.valid, false);
});

test("validateGetConceptNeighborsArgs accepts a real conceptId", () => {
  const result = validateGetConceptNeighborsArgs({ conceptId: "c1" });
  assert.equal(result.valid, true);
});

const baseExposureArgs = {
  conceptIds: ["c1"],
  edgeIds: [],
  evidenceType: "retrieval",
  correctness: true,
  graderConfidence: 0.9,
  assistanceLevel: 0,
  difficulty: 0.5,
  transferDistance: 0,
};

test("validateRecordExposureArgs rejects a call targeting zero concepts and zero edges", () => {
  const result = validateRecordExposureArgs({ ...baseExposureArgs, conceptIds: [], edgeIds: [] });
  assert.equal(result.valid, false);
});

test("validateRecordExposureArgs accepts a well-formed call", () => {
  const result = validateRecordExposureArgs(baseExposureArgs);
  assert.equal(result.valid, true);
});

const baseMisconceptionArgs = {
  conceptIds: ["c1"],
  description: "Confuses BFS with DFS traversal order.",
  graderConfidence: 0.9,
  assistanceLevel: 0,
  difficulty: 0.5,
  transferDistance: 0,
};

test("validateRecordMisconceptionCandidateArgs rejects a call missing description", () => {
  const result = validateRecordMisconceptionCandidateArgs({ ...baseMisconceptionArgs, description: undefined });
  assert.equal(result.valid, false);
});

test("validateRecordMisconceptionCandidateArgs rejects a call targeting zero concepts", () => {
  const result = validateRecordMisconceptionCandidateArgs({ ...baseMisconceptionArgs, conceptIds: [] });
  assert.equal(result.valid, false);
});

test("validateRecordMisconceptionCandidateArgs accepts a well-formed call", () => {
  const result = validateRecordMisconceptionCandidateArgs(baseMisconceptionArgs);
  assert.equal(result.valid, true);
});
