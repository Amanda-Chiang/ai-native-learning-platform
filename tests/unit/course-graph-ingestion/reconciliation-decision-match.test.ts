import test from "node:test";
import assert from "node:assert/strict";
import { indexDecisionsByCandidateId } from "../../../src/features/course-graph-ingestion/reconciliation-decision-match.ts";
import type { ReconciliationDecisionRow } from "../../../src/lib/supabase/database.types.ts";

function decision(overrides: Partial<ReconciliationDecisionRow>): ReconciliationDecisionRow {
  return {
    id: "decision-1",
    course_id: "course-1",
    owner_id: "owner-1",
    extraction_run_id: "run-1",
    candidate_kind: "unit",
    decision: "distinct",
    matched_concept_id: null,
    matched_unit_id: null,
    candidate_id: null,
    reasoning: "...",
    created_at: "2026-09-05T00:00:00Z",
    ...overrides,
  };
}

test("two units proposed by the SAME run each get their own decision, not the first one twice", () => {
  const first = decision({ id: "d1", candidate_id: "unit-a", reasoning: "A is genuinely new" });
  const second = decision({ id: "d2", candidate_id: "unit-b", reasoning: "B might duplicate Graphs", decision: "uncertain" });

  const byCandidate = indexDecisionsByCandidateId([first, second]);

  assert.equal(byCandidate.get("unit-a")?.reasoning, "A is genuinely new");
  assert.equal(byCandidate.get("unit-b")?.reasoning, "B might duplicate Graphs");
  assert.equal(byCandidate.get("unit-b")?.decision, "uncertain");
});

test("a candidate with no decision of its own matches nothing (never a neighbour's)", () => {
  const byCandidate = indexDecisionsByCandidateId([decision({ id: "d1", candidate_id: "unit-a" })]);

  assert.equal(byCandidate.get("unit-b"), undefined);
});

test("a 'merge' decision (no candidate row produced) is excluded rather than bucketed somewhere", () => {
  const merge = decision({ id: "d1", decision: "merge", matched_unit_id: "existing-unit", candidate_id: null });

  const byCandidate = indexDecisionsByCandidateId([merge]);

  assert.equal(byCandidate.size, 0);
});

test("a pre-0014 row with no candidate_id is excluded, not attached to an arbitrary card", () => {
  const legacy = decision({ id: "d-old", candidate_id: null, reasoning: "written before candidate_id existed" });
  const current = decision({ id: "d-new", candidate_id: "unit-a", reasoning: "current" });

  const byCandidate = indexDecisionsByCandidateId([legacy, current]);

  assert.equal(byCandidate.size, 1);
  assert.equal(byCandidate.get("unit-a")?.reasoning, "current");
});
