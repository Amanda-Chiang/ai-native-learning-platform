import test from "node:test";
import assert from "node:assert/strict";
import { resolveUnitReferences } from "../../../trigger/extract-course-graph.ts";
import type { CandidateUnit } from "../../../src/features/course-graph-ingestion/extraction-schema.ts";
import type { UnitReconciliationResult } from "../../../src/features/course-graph-ingestion/reconciliation.ts";

test("a unit reconciled as 'merge' resolves to the matched existing id, with no new row to insert", () => {
  const units: CandidateUnit[] = [{ localId: "u1", title: "Graphs" }];
  const reconciliations = new Map<string, UnitReconciliationResult>([
    ["u1", { decision: "merge", matchedUnitId: "existing-graph-theory-id", reasoning: "same topic" }],
  ]);

  const { unitLocalIdToRealId, toInsert } = resolveUnitReferences(
    units,
    reconciliations,
    new Set(["existing-graph-theory-id"]),
  );

  assert.equal(unitLocalIdToRealId.get("u1"), "existing-graph-theory-id");
  assert.equal(toInsert.length, 0);
});

test("a unit reconciled as 'distinct' or 'uncertain' needs a new row inserted", () => {
  const units: CandidateUnit[] = [
    { localId: "u1", title: "Dynamic Programming" },
    { localId: "u2", title: "Maybe Recursion" },
  ];
  const reconciliations = new Map<string, UnitReconciliationResult>([
    ["u1", { decision: "distinct", reasoning: "genuinely new" }],
    ["u2", { decision: "uncertain", reasoning: "not sure" }],
  ]);

  const { toInsert } = resolveUnitReferences(units, reconciliations, new Set<string>());

  assert.equal(toInsert.length, 2);
  assert.deepEqual(toInsert.map((u) => u.localId).sort(), ["u1", "u2"]);
});

test("a units array with no reconciliation entry throws (every unit must have been reconciled)", () => {
  const units: CandidateUnit[] = [{ localId: "u1", title: "Graphs" }];
  assert.throws(() => resolveUnitReferences(units, new Map(), new Set<string>()));
});

test("a 'merge' onto a unit id the classifier was never shown throws (hallucinated or another course's unit)", () => {
  const units: CandidateUnit[] = [{ localId: "u1", title: "Graphs" }];
  const reconciliations = new Map<string, UnitReconciliationResult>([
    ["u1", { decision: "merge", matchedUnitId: "some-other-courses-unit", reasoning: "same topic" }],
  ]);

  assert.throws(
    () => resolveUnitReferences(units, reconciliations, new Set(["the-only-real-unit"])),
    /not among the existing units it was given/,
  );
});
