import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_EVIDENCE_WEIGHTS } from "../../../src/features/learner-graph-evidence/evidence-weights.ts";

/**
 * A structural guard directly on the config object, backing up
 * exposure-never-exceeds-exposed.test.ts's behavioral proof -- if a
 * future edit to evidence-weights.ts ever violates Constitution
 * Principle III, this fails immediately and specifically (same
 * belt-and-suspenders reasoning as course-graph-ingestion's
 * database-level self-reference check backing its application-level one).
 */
test("exposure's strength weight is strictly below the exposed tier cutoff", () => {
  assert.ok(
    DEFAULT_EVIDENCE_WEIGHTS.strengthByType.exposure < DEFAULT_EVIDENCE_WEIGHTS.tierCutoffs.exposed,
  );
});
