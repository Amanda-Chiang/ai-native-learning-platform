import test from "node:test";
import assert from "node:assert/strict";
import { composeConnectSession } from "../../../src/features/review-scheduler/connect-session.ts";

const NOW = new Date("2026-09-01T00:00:00Z");

function edgeState(learnerState: "weak" | "strong") {
  return { learnerState, score: 0, hasUnresolvedMisconception: false, contributingFactors: [], lastEvidenceAt: null };
}

test("a concept introduced 8 days ago is excluded from newConcepts, one introduced 3 days ago is included", () => {
  const eightDaysAgo = new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const threeDaysAgo = new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const result = composeConnectSession(
    [
      { conceptId: "old", createdAt: eightDaysAgo },
      { conceptId: "new", createdAt: threeDaysAgo },
    ],
    [],
    NOW,
  );
  assert.ok(!result.newConcepts.some((c) => c.conceptId === "old"));
  assert.ok(result.newConcepts.some((c) => c.conceptId === "new"));
});

test("a weak edge between a new and an old concept appears in weakConnections; a strong one doesn't", () => {
  const threeDaysAgo = new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const longAgo = new Date(NOW.getTime() - 100 * 24 * 60 * 60 * 1000).toISOString();
  const concepts = [
    { conceptId: "new1", createdAt: threeDaysAgo },
    { conceptId: "old1", createdAt: longAgo },
    { conceptId: "old2", createdAt: longAgo },
  ];
  const edges = [
    { edgeId: "e1", sourceConceptId: "new1", targetConceptId: "old1", learnerState: edgeState("weak") },
    { edgeId: "e2", sourceConceptId: "new1", targetConceptId: "old2", learnerState: edgeState("strong") },
  ];
  const result = composeConnectSession(concepts, edges, NOW);
  assert.ok(result.weakConnections.some((c) => c.edgeId === "e1"));
  assert.ok(!result.weakConnections.some((c) => c.edgeId === "e2"));
});
