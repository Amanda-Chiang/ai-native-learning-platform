import test from "node:test";
import assert from "node:assert/strict";
import { computeLearnerState } from "../../../src/features/learner-graph-evidence/compute-learner-state.ts";
import { DEFAULT_EVIDENCE_WEIGHTS } from "../../../src/features/learner-graph-evidence/evidence-weights.ts";
import type { EvidenceEvent } from "../../../src/types/domain/evidence-event.ts";

const NOW = new Date("2026-09-01T00:00:00.000Z");

function makeExposureEvent(i: number): EvidenceEvent {
  // Vary recency, confidence, and difficulty across the synthetic set --
  // spec.md SC-001's guarantee must hold no matter how these vary, not
  // just for one fixed combination.
  const daysAgo = (i * 3) % 90;
  return {
    id: `exposure-${i}`,
    userId: "student-1",
    courseId: "course-1",
    conceptIds: ["concept-1"],
    edgeIds: [],
    evidenceType: "exposure",
    correctness: null,
    graderConfidence: 0.5 + (i % 5) / 10,
    assistanceLevel: i % 7,
    difficulty: (i % 10) / 10,
    transferDistance: 0,
    sourceArtifactId: "artifact-1",
    createdAt: new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
  };
}

test("50 synthetic exposure-only events, varying recency/confidence/difficulty, never resolve above unverified", () => {
  // strengthByType.exposure sits strictly below tierCutoffs.exposed
  // (evidence-weights-invariant.test.ts) -- exposure-only evidence
  // therefore never crosses even into "exposed", let alone
  // "weak"/"solid", no matter how many exposure events accumulate or how
  // favorably recency/confidence/difficulty line up (spec.md SC-001,
  // Constitution Principle III at its strictest reading).
  const events = Array.from({ length: 50 }, (_, i) => makeExposureEvent(i));
  const result = computeLearnerState(events, NOW, DEFAULT_EVIDENCE_WEIGHTS, "concept");
  assert.equal(result.tier, "unverified");
});

test("even 50 maximally favorable (recent, confident, easy) exposure-only events stay at unverified", () => {
  const events = Array.from({ length: 50 }, (_, i) => ({
    ...makeExposureEvent(i),
    id: `favorable-exposure-${i}`,
    graderConfidence: 1,
    difficulty: 1,
    assistanceLevel: 0,
    createdAt: NOW.toISOString(),
  }));
  const result = computeLearnerState(events, NOW, DEFAULT_EVIDENCE_WEIGHTS, "concept");
  assert.equal(result.tier, "unverified");
});

test("the edge-level equivalent: exposure-only edge evidence never reaches strong", () => {
  const events = Array.from({ length: 50 }, (_, i) => ({
    ...makeExposureEvent(i),
    id: `edge-exposure-${i}`,
    conceptIds: [],
    edgeIds: ["edge-1"],
  }));
  const result = computeLearnerState(events, NOW, DEFAULT_EVIDENCE_WEIGHTS, "edge");
  assert.equal(result.tier, "weak");
});

test("an exposure event arriving after a concept already reached weak/solid from real evidence does not downgrade it", () => {
  const strongEvent: EvidenceEvent = {
    id: "strong-1",
    userId: "student-1",
    courseId: "course-1",
    conceptIds: ["concept-1"],
    edgeIds: [],
    evidenceType: "transfer",
    correctness: true,
    graderConfidence: 0.95,
    assistanceLevel: 0,
    difficulty: 0.9,
    transferDistance: 1,
    sourceArtifactId: "artifact-1",
    createdAt: NOW.toISOString(),
  };
  const beforeExposure = computeLearnerState([strongEvent], NOW, DEFAULT_EVIDENCE_WEIGHTS, "concept");
  assert.notEqual(beforeExposure.tier, "unverified");
  assert.notEqual(beforeExposure.tier, "exposed");

  const laterExposure: EvidenceEvent = { ...makeExposureEvent(0), id: "later-exposure", createdAt: NOW.toISOString() };
  const afterExposure = computeLearnerState(
    [strongEvent, laterExposure],
    NOW,
    DEFAULT_EVIDENCE_WEIGHTS,
    "concept",
  );
  assert.ok(
    ["weak", "solid"].includes(afterExposure.tier),
    `expected tier to stay at weak/solid, got ${afterExposure.tier}`,
  );
});
