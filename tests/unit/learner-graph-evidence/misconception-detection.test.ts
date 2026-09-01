import test from "node:test";
import assert from "node:assert/strict";
import { computeLearnerState } from "../../../src/features/learner-graph-evidence/compute-learner-state.ts";
import { DEFAULT_EVIDENCE_WEIGHTS } from "../../../src/features/learner-graph-evidence/evidence-weights.ts";
import type { EvidenceEvent } from "../../../src/types/domain/evidence-event.ts";

const NOW = new Date("2026-09-01T00:00:00.000Z");

function confidentIncorrectEvent(id: string, hoursAgo: number): EvidenceEvent {
  return {
    id,
    userId: "student-1",
    courseId: "course-1",
    conceptIds: ["concept-1"],
    edgeIds: [],
    evidenceType: "retrieval",
    correctness: false,
    graderConfidence: 0.9,
    assistanceLevel: 0,
    difficulty: 0.5,
    transferDistance: 0,
    studentConfidence: 0.9,
    sourceArtifactId: "artifact-1",
    createdAt: new Date(NOW.getTime() - hoursAgo * 60 * 60 * 1000).toISOString(),
  };
}

function confidentCorrectEvent(id: string, hoursAgo: number): EvidenceEvent {
  return { ...confidentIncorrectEvent(id, hoursAgo), correctness: true };
}

test("one confident incorrect independent event alone does NOT set hasUnresolvedMisconception", () => {
  const result = computeLearnerState(
    [confidentIncorrectEvent("e1", 2)],
    NOW,
    DEFAULT_EVIDENCE_WEIGHTS,
    "concept",
  );
  assert.equal(result.hasUnresolvedMisconception, false);
});

test("a second confident incorrect independent event on the same target DOES set hasUnresolvedMisconception", () => {
  const result = computeLearnerState(
    [confidentIncorrectEvent("e1", 3), confidentIncorrectEvent("e2", 2)],
    NOW,
    DEFAULT_EVIDENCE_WEIGHTS,
    "concept",
  );
  assert.equal(result.hasUnresolvedMisconception, true);
});

test("a subsequent strong correct independent event after both clears it back to false", () => {
  const result = computeLearnerState(
    [
      confidentIncorrectEvent("e1", 3),
      confidentIncorrectEvent("e2", 2),
      confidentCorrectEvent("e3", 1),
    ],
    NOW,
    DEFAULT_EVIDENCE_WEIGHTS,
    "concept",
  );
  assert.equal(result.hasUnresolvedMisconception, false);
});

test("a non-confident incorrect event does not count toward the threshold", () => {
  const nonConfident: EvidenceEvent = { ...confidentIncorrectEvent("e1", 3), studentConfidence: 0.1 };
  const result = computeLearnerState(
    [nonConfident, confidentIncorrectEvent("e2", 2)],
    NOW,
    DEFAULT_EVIDENCE_WEIGHTS,
    "concept",
  );
  assert.equal(result.hasUnresolvedMisconception, false);
});

test("a missing studentConfidence does not count toward the threshold", () => {
  const missing: EvidenceEvent = { ...confidentIncorrectEvent("e1", 3) };
  delete (missing as { studentConfidence?: number }).studentConfidence;
  const result = computeLearnerState(
    [missing, confidentIncorrectEvent("e2", 2)],
    NOW,
    DEFAULT_EVIDENCE_WEIGHTS,
    "concept",
  );
  assert.equal(result.hasUnresolvedMisconception, false);
});
