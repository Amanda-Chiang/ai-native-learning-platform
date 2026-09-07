import test from "node:test";
import assert from "node:assert/strict";

/**
 * autoConfirmEligibleConcepts (actions.ts, 2026-09-07 decision --
 * architecture-log.md) needs a live Supabase client, so its structure is
 * asserted by source inspection, the same technique edge-sweep.test.ts's
 * own structural tests and submit-flag.test.ts established for this
 * codebase's other "use server" cascades. Its pure decision half
 * (shouldAutoConfirmConcept) is tested directly in
 * concept-auto-confirm.test.ts.
 */

async function readActionsSource(): Promise<string> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  return fs.readFile(
    path.join(import.meta.dirname, "../../../src/features/course-graph-ingestion/actions.ts"),
    "utf-8",
  );
}

test("confirmCandidate triggers the concept cascade when (and only when) a unit was just confirmed", async () => {
  const source = await readActionsSource();
  const body = source.slice(
    source.indexOf("export async function confirmCandidate"),
    source.indexOf("async function autoConfirmEligibleEdges"),
  );

  assert.ok(
    /if \(!error && kind === "unit"\)\s*\{\s*await autoConfirmEligibleConcepts\(supabase, id\);/.test(body),
    "confirmCandidate must call autoConfirmEligibleConcepts after successfully confirming a unit",
  );
});

test("autoConfirmEligibleConcepts never fails silently -- every early-out reports", async () => {
  const source = await readActionsSource();
  const start = source.indexOf("async function autoConfirmEligibleConcepts");
  const end = source.indexOf("export async function rejectCandidate");
  assert.ok(start !== -1 && end > start, "expected autoConfirmEligibleConcepts before rejectCandidate");
  const body = source.slice(start, end);

  // Three failure paths: a failed proposed-concepts query, a failed
  // reconciliation-decisions query, and the confirm's own error --
  // mirrors autoConfirmEligibleEdges's own three, same reasoning: a
  // concept that misses this cascade has no other path to becoming
  // visible short of a reviewer clicking its own Confirm button by hand.
  const logCalls = [...body.matchAll(/console\.error\(/g)];
  assert.equal(logCalls.length, 3, "each of the three failure paths must be logged");
  assert.ok(
    body.includes('const { error: confirmError } = await confirmCandidate("concept", conceptId)'),
    "the cascade must inspect confirmCandidate's returned error rather than discarding it",
  );
});

test("autoConfirmEligibleConcepts checks each concept's own reconciliation decision before confirming it", async () => {
  const source = await readActionsSource();
  const start = source.indexOf("async function autoConfirmEligibleConcepts");
  const end = source.indexOf("export async function rejectCandidate");
  const body = source.slice(start, end);

  assert.ok(
    body.includes('.eq("candidate_kind", "concept")'),
    "the cascade must look up each concept's own reconciliation_decisions row",
  );
  assert.ok(
    body.includes("shouldAutoConfirmConcept(decisionByConceptId.get(conceptId)"),
    "the cascade must gate each concept through shouldAutoConfirmConcept, not confirm unconditionally",
  );
});
