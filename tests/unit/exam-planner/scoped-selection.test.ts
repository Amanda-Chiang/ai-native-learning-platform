import test from "node:test";
import assert from "node:assert/strict";
import {
  selectDiagnosticConcepts,
  selectFinalWeaknessConcepts,
  selectInterleavingEdges,
  selectTimedMixedConcepts,
} from "../../../src/features/exam-planner/scoped-selection.ts";

const NOW = new Date("2026-09-01T00:00:00Z");

function learnerState(overrides: Partial<{ score: number; lastEvidenceAt: string | null; hasUnresolvedMisconception: boolean }> = {}) {
  return {
    masteryState: "weak" as const,
    score: 0.5,
    hasUnresolvedMisconception: false,
    contributingFactors: [],
    lastEvidenceAt: null,
    ...overrides,
  };
}

function conceptInput(conceptId: string, overrides: Partial<{ importanceScore: number; prerequisiteOutDegree: number; learnerState: ReturnType<typeof learnerState> }> = {}) {
  return {
    conceptId,
    importanceScore: 0.5,
    prerequisiteOutDegree: 0,
    learnerState: learnerState(),
    ...overrides,
  };
}

test("selectDiagnosticConcepts/selectFinalWeaknessConcepts only return concepts present in the scoped input", () => {
  const scoped = [conceptInput("a"), conceptInput("b")];
  const diagnostic = selectDiagnosticConcepts(scoped, NOW, 10);
  const final = selectFinalWeaknessConcepts(scoped, NOW, 10);
  for (const result of [diagnostic, final]) {
    assert.ok(result.every((r) => ["a", "b"].includes(r.conceptId)));
    assert.equal(result.length, 2);
  }
});

test("selectDiagnosticConcepts ranks the same way rankConceptsByPriority does (unresolved misconception first)", () => {
  const scoped = [
    conceptInput("unflagged"),
    conceptInput("flagged", { learnerState: learnerState({ hasUnresolvedMisconception: true }) }),
  ];
  const result = selectDiagnosticConcepts(scoped, NOW, 10);
  assert.equal(result[0].conceptId, "flagged");
});

test("selectInterleavingEdges only returns an edge when learner state is weak", () => {
  const edges = [
    { edgeId: "weak-edge", sourceConceptId: "a", targetConceptId: "b", learnerState: { learnerState: "weak" as const, score: 0, hasUnresolvedMisconception: false, contributingFactors: [], lastEvidenceAt: null } },
    { edgeId: "strong-edge", sourceConceptId: "c", targetConceptId: "d", learnerState: { learnerState: "strong" as const, score: 1, hasUnresolvedMisconception: false, contributingFactors: [], lastEvidenceAt: null } },
  ];
  const result = selectInterleavingEdges(edges);
  assert.equal(result.length, 1);
  assert.equal(result[0].edgeId, "weak-edge");
});

test("selectTimedMixedConcepts returns a spread across mastery tiers, not only the top-ranked", () => {
  const scoped = [
    conceptInput("weakest", { learnerState: learnerState({ score: 0.05 }) }),
    conceptInput("mid", { learnerState: learnerState({ score: 0.5 }) }),
    conceptInput("strongest", { learnerState: learnerState({ score: 0.95 }) }),
  ];
  const result = selectTimedMixedConcepts(scoped, NOW, 2);
  assert.equal(result.length, 2);
  // Should not be just the two highest-priority (weakest two) --
  // a spread includes at least one from the opposite end.
  const ids = result.map((r) => r.conceptId);
  assert.ok(!(ids.includes("weakest") && ids.includes("mid") && !ids.includes("strongest")));
});
