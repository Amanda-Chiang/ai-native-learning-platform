import test from "node:test";
import assert from "node:assert/strict";
import * as EvidenceEventModule from "../../../src/types/domain/evidence-event.ts";
import { isEvidenceEvent, type EvidenceEvent } from "../../../src/types/domain/evidence-event.ts";

const validEvent: EvidenceEvent = {
  id: "evidence-001",
  userId: "user-amanda",
  courseId: "course-6006",
  conceptIds: ["concept-bfs"],
  edgeIds: [],
  evidenceType: "retrieval",
  correctness: true,
  graderConfidence: 0.9,
  assistanceLevel: 0,
  difficulty: 0.5,
  transferDistance: 0.1,
  sourceArtifactId: undefined,
  assessmentAttemptId: "attempt-001",
  conversationTurnId: undefined,
  createdAt: "2026-09-01T00:00:00.000Z",
};

test("a valid EvidenceEvent passes isEvidenceEvent", () => {
  assert.equal(isEvidenceEvent(validEvent), true);
});

test("an EvidenceEvent with both conceptIds and edgeIds empty fails", () => {
  const invalid = { ...validEvent, conceptIds: [], edgeIds: [] };
  assert.equal(isEvidenceEvent(invalid), false);
});

test("an EvidenceEvent with no origin (sourceArtifactId/assessmentAttemptId/conversationTurnId all unset) fails", () => {
  const invalid = { ...validEvent, assessmentAttemptId: undefined };
  assert.equal(isEvidenceEvent(invalid), false);
});

test("exposure and retrieval are structurally distinguishable evidence types (Constitution Principle III)", () => {
  const exposure: EvidenceEvent = { ...validEvent, evidenceType: "exposure", correctness: null };
  assert.equal(isEvidenceEvent(exposure), true);
  assert.notEqual(exposure.evidenceType, validEvent.evidenceType);
});

test("the evidence-event module exports no update or delete function (append-only by construction)", () => {
  const exportNames = Object.keys(EvidenceEventModule);
  const hasMutation = exportNames.some((name) => /update|delete|mutate/i.test(name));
  assert.equal(hasMutation, false);
});
