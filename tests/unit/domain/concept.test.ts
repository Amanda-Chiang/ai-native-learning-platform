import test from "node:test";
import assert from "node:assert/strict";
import { isCourseConcept, type CourseConcept } from "../../../src/types/domain/concept.ts";

const validConcept: CourseConcept = {
  id: "concept-bfs",
  courseId: "course-6006",
  unitId: "unit-graphs",
  canonicalName: "Breadth-First Search",
  aliases: ["BFS"],
  description: "Explores graph nodes in increasing order of distance from a source vertex.",
  importanceScore: 0.9,
  sourceAnchors: [
    {
      artifactId: "lecture-09-breadth-first-search",
      locator: "Breadth-First Search (BFS) section",
      excerpt: "Idea! Explore graph nodes in increasing order of distance",
    },
  ],
  status: "confirmed",
  confidence: 0.95,
};

test("a valid CourseConcept passes isCourseConcept", () => {
  assert.equal(isCourseConcept(validConcept), true);
});

test("a CourseConcept with no sourceAnchors fails (Constitution Principle V)", () => {
  const invalid = { ...validConcept, sourceAnchors: [] };
  assert.equal(isCourseConcept(invalid), false);
});

test("a CourseConcept whose aliases contains its own canonicalName fails", () => {
  const invalid = { ...validConcept, aliases: ["Breadth-First Search"] };
  assert.equal(isCourseConcept(invalid), false);
});

test("a CourseConcept missing a required field fails", () => {
  const { description, ...invalid } = validConcept;
  assert.equal(isCourseConcept(invalid), false);
});
