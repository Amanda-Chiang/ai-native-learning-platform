import test from "node:test";
import assert from "node:assert/strict";
import { computeNextReviewDate, isDue } from "../../../src/features/review-scheduler/next-review-date.ts";

const NOW = new Date("2026-09-01T00:00:00Z");
const TEN_DAYS_AGO = new Date("2026-08-22T00:00:00Z").toISOString();

function state(overrides: Partial<{ score: number; lastEvidenceAt: string | null; hasUnresolvedMisconception: boolean }> = {}) {
  return {
    masteryState: "weak" as const,
    score: 0.5,
    hasUnresolvedMisconception: false,
    contributingFactors: [],
    lastEvidenceAt: TEN_DAYS_AGO,
    ...overrides,
  };
}

test("a higher score produces a later next-review date than a lower score, same lastEvidenceAt", () => {
  const highScore = computeNextReviewDate(state({ score: 0.9 }), NOW);
  const lowScore = computeNextReviewDate(state({ score: 0.1 }), NOW);
  assert.ok(highScore.getTime() > lowScore.getTime());
});

test("an unresolved misconception forces a near-immediate due date regardless of score", () => {
  const flaggedHighScore = computeNextReviewDate(state({ score: 0.95, hasUnresolvedMisconception: true }), NOW);
  const unflaggedHighScore = computeNextReviewDate(state({ score: 0.95, hasUnresolvedMisconception: false }), NOW);
  assert.ok(flaggedHighScore.getTime() < unflaggedHighScore.getTime());
  assert.ok(isDue(state({ score: 0.95, hasUnresolvedMisconception: true, lastEvidenceAt: TEN_DAYS_AGO }), NOW));
});

test("no prior evidence is always immediately due", () => {
  const result = computeNextReviewDate(state({ lastEvidenceAt: null, score: 0 }), NOW);
  assert.ok(result.getTime() <= NOW.getTime());
  assert.equal(isDue(state({ lastEvidenceAt: null, score: 0 }), NOW), true);
});

test("a concept with recent, strong evidence is not yet due", () => {
  const recent = new Date(NOW.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(); // 1 day ago
  assert.equal(isDue(state({ score: 0.9, lastEvidenceAt: recent }), NOW), false);
});
