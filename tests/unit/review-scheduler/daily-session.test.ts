import test from "node:test";
import assert from "node:assert/strict";
import {
  composeDailySession,
  DEFAULT_MINUTES_PER_QUESTION,
  type QuestionBankEntrySummary,
} from "../../../src/features/review-scheduler/daily-session.ts";
import type { ConceptPriority } from "../../../src/features/review-scheduler/review-priority.ts";

function priority(conceptId: string, priorityScore: number): ConceptPriority {
  return { conceptId, priorityScore, reasons: [`reason for ${conceptId}`] };
}

function question(id: string, conceptId: string): QuestionBankEntrySummary {
  return { id, conceptId, questionText: `question ${id}`, responseModality: "text", rubric: {} };
}

test("a due concept with zero available questions is skipped, never fabricated as a placeholder item", () => {
  const result = composeDailySession(
    [priority("c1", 3), priority("c2", 2)],
    new Map([["c1", [question("q1", "c1")]]]), // c2 has no questions
    100,
    [],
  );
  assert.equal(result.status, "ok");
  if (result.status === "ok") {
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].conceptId, "c1");
  }
});

test("the session never exceeds timeBudgetMinutes / DEFAULT_MINUTES_PER_QUESTION items, rounded down", () => {
  const concepts = [priority("c1", 5), priority("c2", 4), priority("c3", 3)];
  const questions = new Map(concepts.map((c) => [c.conceptId, [question(`q-${c.conceptId}`, c.conceptId)]]));
  const budget = DEFAULT_MINUTES_PER_QUESTION * 2; // room for exactly 2
  const result = composeDailySession(concepts, questions, budget, []);
  assert.equal(result.status, "ok");
  if (result.status === "ok") {
    assert.equal(result.items.length, 2);
    assert.equal(result.moreAvailable, true);
  }
});

test("a budget smaller than one question's cost still returns at least one item", () => {
  const result = composeDailySession(
    [priority("c1", 5)],
    new Map([["c1", [question("q1", "c1")]]]),
    1, // smaller than DEFAULT_MINUTES_PER_QUESTION
    [],
  );
  assert.equal(result.status, "budget_too_small");
  if (result.status === "budget_too_small") {
    assert.equal(result.items.length, 1);
  }
});

test("no eligible due concept has any available question -> no_content, never an empty ok session", () => {
  const result = composeDailySession([priority("c1", 5)], new Map(), 30, []);
  assert.equal(result.status, "no_content");
});

test("excludeConceptIds really excludes those concepts from the ranked slice", () => {
  const result = composeDailySession(
    [priority("c1", 5), priority("c2", 4)],
    new Map([
      ["c1", [question("q1", "c1")]],
      ["c2", [question("q2", "c2")]],
    ]),
    100,
    ["c1"],
  );
  assert.equal(result.status, "ok");
  if (result.status === "ok") {
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].conceptId, "c2");
  }
});
