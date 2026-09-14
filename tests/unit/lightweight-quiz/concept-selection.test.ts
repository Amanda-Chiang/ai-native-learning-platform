import test from "node:test";
import assert from "node:assert/strict";
import { selectEligibleConceptIds, IMPORTANCE_THRESHOLD } from "../../../src/features/lightweight-quiz/concept-selection.ts";

test("a concept at or above the importance threshold is eligible", () => {
  const ids = selectEligibleConceptIds([{ id: "c1", importanceScore: IMPORTANCE_THRESHOLD }]);
  assert.deepEqual(ids, ["c1"]);
});

test("a concept below the importance threshold is not eligible", () => {
  const ids = selectEligibleConceptIds([{ id: "c1", importanceScore: IMPORTANCE_THRESHOLD - 0.01 }]);
  assert.deepEqual(ids, []);
});

test("filters a mixed list down to only the eligible concepts", () => {
  const ids = selectEligibleConceptIds([
    { id: "high", importanceScore: 0.9 },
    { id: "low", importanceScore: 0.2 },
    { id: "borderline", importanceScore: IMPORTANCE_THRESHOLD },
  ]);
  assert.deepEqual(ids.sort(), ["borderline", "high"].sort());
});

test("an empty concept list produces an empty result, not an error", () => {
  assert.deepEqual(selectEligibleConceptIds([]), []);
});
