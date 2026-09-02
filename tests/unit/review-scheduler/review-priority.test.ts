import test from "node:test";
import assert from "node:assert/strict";
import {
  computeConceptPriority,
  rankConceptsByPriority,
  DEFAULT_REVIEW_PRIORITY_WEIGHTS,
} from "../../../src/features/review-scheduler/review-priority.ts";

const NOW = new Date("2026-09-01T00:00:00Z");
const TWENTY_DAYS_AGO = new Date("2026-08-12T00:00:00Z").toISOString();

function baseLearnerState(overrides: Partial<{ score: number; lastEvidenceAt: string | null; hasUnresolvedMisconception: boolean }> = {}) {
  return {
    masteryState: "weak" as const,
    score: 0.5,
    hasUnresolvedMisconception: false,
    contributingFactors: [],
    lastEvidenceAt: TWENTY_DAYS_AGO,
    ...overrides,
  };
}

test("a concept with an unresolved misconception ranks above an equally-overdue concept without one", () => {
  const flagged = computeConceptPriority(
    { conceptId: "flagged", importanceScore: 0.5, prerequisiteOutDegree: 0, learnerState: baseLearnerState({ hasUnresolvedMisconception: true }) },
    NOW,
    DEFAULT_REVIEW_PRIORITY_WEIGHTS,
  );
  const unflagged = computeConceptPriority(
    { conceptId: "unflagged", importanceScore: 0.5, prerequisiteOutDegree: 0, learnerState: baseLearnerState({ hasUnresolvedMisconception: false }) },
    NOW,
    DEFAULT_REVIEW_PRIORITY_WEIGHTS,
  );
  assert.ok(flagged.priorityScore > unflagged.priorityScore);
});

test("a more important concept ranks above an equally-overdue, equally-central, unflagged concept", () => {
  const important = computeConceptPriority(
    { conceptId: "important", importanceScore: 0.9, prerequisiteOutDegree: 0, learnerState: baseLearnerState() },
    NOW,
    DEFAULT_REVIEW_PRIORITY_WEIGHTS,
  );
  const minor = computeConceptPriority(
    { conceptId: "minor", importanceScore: 0.1, prerequisiteOutDegree: 0, learnerState: baseLearnerState() },
    NOW,
    DEFAULT_REVIEW_PRIORITY_WEIGHTS,
  );
  assert.ok(important.priorityScore > minor.priorityScore);
});

test("every reasons entry is non-empty and specific, never a generic placeholder", () => {
  const result = computeConceptPriority(
    { conceptId: "c1", importanceScore: 0.5, prerequisiteOutDegree: 3, learnerState: baseLearnerState({ hasUnresolvedMisconception: true }) },
    NOW,
    DEFAULT_REVIEW_PRIORITY_WEIGHTS,
  );
  assert.ok(result.reasons.length > 0);
  for (const reason of result.reasons) {
    assert.ok(reason.length > 0);
  }
  assert.ok(result.reasons.some((r) => r.includes("mix-up")));
});

test("a concept with no evidence yet still gets a real, non-generic reason", () => {
  const result = computeConceptPriority(
    { conceptId: "c1", importanceScore: 0.5, prerequisiteOutDegree: 0, learnerState: baseLearnerState({ lastEvidenceAt: null, score: 0 }) },
    NOW,
    DEFAULT_REVIEW_PRIORITY_WEIGHTS,
  );
  assert.ok(result.reasons.some((r) => r.includes("haven't practiced")));
});

test("rankConceptsByPriority sorts descending by priorityScore", () => {
  const ranked = rankConceptsByPriority(
    [
      { conceptId: "low", importanceScore: 0.1, prerequisiteOutDegree: 0, learnerState: baseLearnerState({ hasUnresolvedMisconception: false }) },
      { conceptId: "high", importanceScore: 0.1, prerequisiteOutDegree: 0, learnerState: baseLearnerState({ hasUnresolvedMisconception: true }) },
    ],
    NOW,
    DEFAULT_REVIEW_PRIORITY_WEIGHTS,
  );
  assert.equal(ranked[0].conceptId, "high");
  assert.equal(ranked[1].conceptId, "low");
});
