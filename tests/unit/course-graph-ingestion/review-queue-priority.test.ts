import test from "node:test";
import assert from "node:assert/strict";
import { sortReviewQueueByPriority } from "../../../src/features/course-graph-ingestion/review-queue-priority.ts";
import type { ReviewQueueItem } from "../../../src/features/course-graph-ingestion/actions.ts";

function conceptItem(overrides: {
  id: string;
  confidence?: number;
  flags?: number;
  decision?: "merge" | "distinct" | "uncertain";
}): ReviewQueueItem {
  return {
    kind: "concept",
    concept: {
      id: overrides.id,
      courseId: "course-1",
      unitId: "unit-1",
      canonicalName: overrides.id,
      aliases: [],
      description: "...",
      importanceScore: 0.5,
      sourceAnchors: [{ artifactId: "a1", locator: "l", excerpt: "e" }],
      status: "proposed",
      confidence: overrides.confidence ?? 0.5,
    },
    reconciliation: overrides.decision
      ? { decision: overrides.decision, matchedConceptId: null, matchedUnitId: null, reasoning: "..." }
      : null,
    flags: Array.from({ length: overrides.flags ?? 0 }, (_, i) => ({
      id: `flag-${i}`,
      reporterId: "student-1",
      reason: "...",
      createdAt: "2026-01-01T00:00:00Z",
    })),
  };
}

test("a flagged item sorts before an unflagged one, regardless of confidence", () => {
  const flagged = conceptItem({ id: "flagged", confidence: 0.99, flags: 1 });
  const unflagged = conceptItem({ id: "unflagged", confidence: 0.01 });

  const sorted = sortReviewQueueByPriority([unflagged, flagged]);

  assert.equal(sorted[0].kind === "concept" && sorted[0].concept.id, "flagged");
});

test("more flags sorts earlier than fewer flags", () => {
  const oneFlag = conceptItem({ id: "one-flag", flags: 1 });
  const threeFlags = conceptItem({ id: "three-flags", flags: 3 });

  const sorted = sortReviewQueueByPriority([oneFlag, threeFlags]);

  assert.equal(sorted[0].kind === "concept" && sorted[0].concept.id, "three-flags");
});

test("an 'uncertain' reconciliation sorts before an ordinary unflagged item", () => {
  const uncertain = conceptItem({ id: "uncertain", decision: "uncertain" });
  const ordinary = conceptItem({ id: "ordinary" });

  const sorted = sortReviewQueueByPriority([ordinary, uncertain]);

  assert.equal(sorted[0].kind === "concept" && sorted[0].concept.id, "uncertain");
});

test("a flagged item sorts before an 'uncertain' one -- flags outrank reconciliation ambiguity", () => {
  const flagged = conceptItem({ id: "flagged", flags: 1 });
  const uncertain = conceptItem({ id: "uncertain", decision: "uncertain" });

  const sorted = sortReviewQueueByPriority([uncertain, flagged]);

  assert.equal(sorted[0].kind === "concept" && sorted[0].concept.id, "flagged");
});

test("among ordinary items, lower confidence sorts earlier", () => {
  const lowConfidence = conceptItem({ id: "low", confidence: 0.2 });
  const highConfidence = conceptItem({ id: "high", confidence: 0.9 });

  const sorted = sortReviewQueueByPriority([highConfidence, lowConfidence]);

  assert.equal(sorted[0].kind === "concept" && sorted[0].concept.id, "low");
});

test("does not mutate the input array", () => {
  const items = [conceptItem({ id: "a" }), conceptItem({ id: "b", flags: 1 })];
  const original = [...items];

  sortReviewQueueByPriority(items);

  assert.deepEqual(items, original);
});
