import test from "node:test";
import assert from "node:assert/strict";
import { parseMcqGenerationResult } from "../../../src/features/lightweight-quiz/mcq-generation-schema.ts";

const validQuestion = {
  questionText: "What does BFS explore first?",
  options: ["The nearest unvisited node", "The farthest node", "A random node", "The last node added"],
  correctOptionIndex: 0,
  sourceAnchors: [{ locator: "slide 4", excerpt: "BFS explores nodes in increasing order of distance" }],
};

test("a well-formed response parses into candidates", () => {
  const result = parseMcqGenerationResult({ questions: [validQuestion] });
  assert.equal(result.length, 1);
  assert.equal(result[0].correctOptionIndex, 0);
});

test("a response with multiple questions parses fully", () => {
  const second = { ...validQuestion, questionText: "A second question", correctOptionIndex: 2 };
  const result = parseMcqGenerationResult({ questions: [validQuestion, second] });
  assert.equal(result.length, 2);
});

test("a non-object response is rejected", () => {
  assert.throws(() => parseMcqGenerationResult(null), /not an object/);
});

test("an empty questions array is rejected -- never a silently-empty result", () => {
  assert.throws(() => parseMcqGenerationResult({ questions: [] }), /missing or empty/);
});

test("a question with fewer than 4 options is rejected", () => {
  const invalid = { ...validQuestion, options: ["a", "b", "c"] };
  assert.throws(() => parseMcqGenerationResult({ questions: [invalid] }), /invalid question/);
});

test("a question with duplicate options is rejected -- not a real 4-way choice", () => {
  const invalid = { ...validQuestion, options: ["same", "same", "b", "c"] };
  assert.throws(() => parseMcqGenerationResult({ questions: [invalid] }), /invalid question/);
});

test("a question with an out-of-range correctOptionIndex is rejected", () => {
  const invalid = { ...validQuestion, correctOptionIndex: 4 };
  assert.throws(() => parseMcqGenerationResult({ questions: [invalid] }), /invalid question/);
});

test("a question with an empty questionText is rejected", () => {
  const invalid = { ...validQuestion, questionText: "" };
  assert.throws(() => parseMcqGenerationResult({ questions: [invalid] }), /invalid question/);
});

test("a question with an empty option string is rejected", () => {
  const invalid = { ...validQuestion, options: ["", "b", "c", "d"] };
  assert.throws(() => parseMcqGenerationResult({ questions: [invalid] }), /invalid question/);
});

test("a question with zero source anchors is rejected -- no unanchored claim", () => {
  const invalid = { ...validQuestion, sourceAnchors: [] };
  assert.throws(() => parseMcqGenerationResult({ questions: [invalid] }), /invalid question/);
});

test("a question with an empty source anchor excerpt is rejected", () => {
  const invalid = { ...validQuestion, sourceAnchors: [{ locator: "slide 4", excerpt: "" }] };
  assert.throws(() => parseMcqGenerationResult({ questions: [invalid] }), /invalid question/);
});

test("a question missing a required field is rejected, not silently coerced", () => {
  const { correctOptionIndex, ...missingField } = validQuestion;
  assert.throws(() => parseMcqGenerationResult({ questions: [missingField] }), /invalid question/);
});
