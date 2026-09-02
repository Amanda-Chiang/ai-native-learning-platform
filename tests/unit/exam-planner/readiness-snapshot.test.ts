import test from "node:test";
import assert from "node:assert/strict";
import { computeReadinessSnapshot } from "../../../src/features/exam-planner/readiness-snapshot.ts";

function state(masteryState: "unverified" | "exposed" | "weak" | "solid", overrides: Partial<{ lastEvidenceAt: string | null; hasUnresolvedMisconception: boolean }> = {}) {
  return {
    masteryState,
    score: 0.5,
    hasUnresolvedMisconception: false,
    contributingFactors: [],
    lastEvidenceAt: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

test("a concept with lastEvidenceAt: null lands in untouched, never unverified/weak", () => {
  const snapshot = computeReadinessSnapshot([
    { conceptId: "c1", learnerState: state("unverified", { lastEvidenceAt: null }) },
  ]);
  assert.deepEqual(snapshot.untouched, ["c1"]);
  assert.deepEqual(snapshot.unverified, []);
});

test("a concept with hasUnresolvedMisconception appears in unresolvedMisconceptions regardless of tier bucket", () => {
  const snapshot = computeReadinessSnapshot([
    { conceptId: "solid-but-flagged", learnerState: state("solid", { hasUnresolvedMisconception: true }) },
  ]);
  assert.deepEqual(snapshot.solid, ["solid-but-flagged"]);
  assert.deepEqual(snapshot.unresolvedMisconceptions, ["solid-but-flagged"]);
});

test("concepts bucket by real mastery tier", () => {
  const snapshot = computeReadinessSnapshot([
    { conceptId: "a", learnerState: state("solid") },
    { conceptId: "b", learnerState: state("weak") },
    { conceptId: "c", learnerState: state("exposed") },
  ]);
  assert.deepEqual(snapshot.solid, ["a"]);
  assert.deepEqual(snapshot.weak, ["b"]);
  assert.deepEqual(snapshot.exposed, ["c"]);
});
