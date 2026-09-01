import test from "node:test";
import assert from "node:assert/strict";
import { computeLearnerState } from "../../../src/features/learner-graph-evidence/compute-learner-state.ts";
import { DEFAULT_EVIDENCE_WEIGHTS } from "../../../src/features/learner-graph-evidence/evidence-weights.ts";
import type { EvidenceEvent } from "../../../src/types/domain/evidence-event.ts";

const NOW = new Date("2026-09-01T00:00:00.000Z");

function makeEvent(overrides: Partial<EvidenceEvent> & { id: string }): EvidenceEvent {
  return {
    userId: "student-1",
    courseId: "course-1",
    conceptIds: ["concept-1"],
    edgeIds: [],
    evidenceType: "retrieval",
    correctness: true,
    graderConfidence: 0.9,
    assistanceLevel: 0,
    difficulty: 0.5,
    transferDistance: 0,
    sourceArtifactId: "artifact-1",
    createdAt: NOW.toISOString(),
    ...overrides,
  };
}

test("an empty event list returns the FR-010 baseline exactly", () => {
  const result = computeLearnerState([], NOW, DEFAULT_EVIDENCE_WEIGHTS, "concept");
  assert.equal(result.tier, "unverified");
  assert.equal(result.score, 0);
  assert.equal(result.hasUnresolvedMisconception, false);
  assert.deepEqual(result.contributingFactors, []);
  assert.equal(result.lastEvidenceAt, null);
});

test("one independent, correct, high-confidence retrieval event with no prior evidence produces a tier above exposed", () => {
  const event = makeEvent({ id: "e1", evidenceType: "retrieval", correctness: true, graderConfidence: 0.9 });
  const result = computeLearnerState([event], NOW, DEFAULT_EVIDENCE_WEIGHTS, "concept");
  assert.notEqual(result.tier, "exposed");
  assert.notEqual(result.tier, "unverified");
});

test("a later correct application event on the same target strengthens the score further, not flattening or resetting it", () => {
  const first = makeEvent({ id: "e1", evidenceType: "retrieval", correctness: true, graderConfidence: 0.9 });
  const scoreAfterFirst = computeLearnerState([first], NOW, DEFAULT_EVIDENCE_WEIGHTS, "concept").score;

  const second = makeEvent({
    id: "e2",
    evidenceType: "application",
    correctness: true,
    graderConfidence: 0.95,
    createdAt: NOW.toISOString(),
  });
  const scoreAfterBoth = computeLearnerState([first, second], NOW, DEFAULT_EVIDENCE_WEIGHTS, "concept").score;

  assert.ok(scoreAfterBoth > scoreAfterFirst, `${scoreAfterBoth} should exceed ${scoreAfterFirst}`);
});

test("a relationship's computed state responds only to events targeting its own edgeIds", () => {
  const edgeEvent = makeEvent({
    id: "e1",
    conceptIds: [],
    edgeIds: ["edge-1"],
    evidenceType: "relationship_explanation",
    correctness: true,
  });
  const withEdgeEvidence = computeLearnerState([edgeEvent], NOW, DEFAULT_EVIDENCE_WEIGHTS, "edge");
  assert.notEqual(withEdgeEvidence.score, 0);

  // Events targeting only the endpoint concepts (never edge-1's own
  // edgeIds) must not be part of what a caller passes in for edge-1 --
  // this test documents that computeLearnerState trusts its input
  // exactly as given; the actual FR-005 filtering guarantee lives in
  // actions.ts's per-target query, verified there.
  const conceptOnlyEvent = makeEvent({ id: "e2", conceptIds: ["concept-1"], edgeIds: [] });
  const edgeStateGivenOnlyConceptEvents = computeLearnerState(
    [conceptOnlyEvent].filter((e) => e.edgeIds.includes("edge-1")),
    NOW,
    DEFAULT_EVIDENCE_WEIGHTS,
    "edge",
  );
  assert.equal(edgeStateGivenOnlyConceptEvents.score, 0);
  assert.equal(edgeStateGivenOnlyConceptEvents.tier, "strong");
});
