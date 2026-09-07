import test from "node:test";
import assert from "node:assert/strict";
import { shouldAutoConfirmConcept } from "../../../trigger/extract-course-graph.ts";

/**
 * Insert-time half of the 2026-09-07 decision (architecture-log.md):
 * units, not concepts, are the review-gated side of extraction. This is
 * trigger/extract-course-graph.ts's own copy of the decision, checked
 * against the unit's status at the moment a concept is extracted; the
 * confirm-time half (a concept whose unit was still 'proposed' at
 * extraction time, catching up once a reviewer confirms it) is
 * src/features/course-graph-ingestion/concept-auto-confirm.ts, tested
 * separately in concept-auto-confirm.test.ts.
 */

test("unit already confirmed, concept not uncertain -> auto-confirms", () => {
  assert.equal(shouldAutoConfirmConcept("confirmed", "distinct"), true);
});

test("unit already confirmed, concept uncertain -> stays proposed regardless", () => {
  assert.equal(shouldAutoConfirmConcept("confirmed", "uncertain"), false);
});

test("unit still proposed -> stays proposed even if the concept itself isn't uncertain", () => {
  assert.equal(shouldAutoConfirmConcept("proposed", "distinct"), false);
});

test("unit status unresolved (undefined) -> treated as not confirmed, safe default", () => {
  assert.equal(shouldAutoConfirmConcept(undefined, "distinct"), false);
});

test("unit archived -> never auto-confirms (only 'confirmed' counts)", () => {
  assert.equal(shouldAutoConfirmConcept("archived", "distinct"), false);
});
