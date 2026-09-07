import test from "node:test";
import assert from "node:assert/strict";
import { shouldAutoConfirmConcept } from "../../../src/features/course-graph-ingestion/concept-auto-confirm.ts";

/**
 * Confirm-time half of the 2026-09-07 decision (architecture-log.md):
 * a concept whose unit was still 'proposed' at extraction time catches
 * up the moment a reviewer confirms that unit (actions.ts's
 * autoConfirmEligibleConcepts). The unit half of the invariant is true
 * by construction at the call site (only called for concepts under the
 * unit just confirmed) -- only the concept's own reconciliation decision
 * is in question here. The insert-time half (trigger/extract-course-
 * graph.ts's own copy, checked against the unit's status directly) is
 * tested separately in concept-insert-time-auto-confirm.test.ts.
 */

test("a routine ('distinct') decision is eligible", () => {
  assert.equal(shouldAutoConfirmConcept("distinct"), true);
});

test("an uncertain match is never eligible, regardless of its unit", () => {
  assert.equal(shouldAutoConfirmConcept("uncertain"), false);
});

test("no reconciliation_decisions row found (undefined) -> not eligible, conservative default", () => {
  assert.equal(shouldAutoConfirmConcept(undefined), false);
});
