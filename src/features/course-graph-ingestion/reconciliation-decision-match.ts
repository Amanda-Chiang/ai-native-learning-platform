import type { ReconciliationDecisionRow } from "../../lib/supabase/database.types.ts";

/**
 * Pure: indexes a course's reconciliation_decisions rows by the specific
 * candidate row each one produced (reconciliation_decisions.candidate_id,
 * migration 0014), for getReviewQueue to attach each card its OWN
 * reasoning.
 *
 * Split out of actions.ts with no "@/"-aliased imports so the matching
 * rule is testable without a Next.js request context or a live Supabase
 * client (same reason review-queue-priority.ts and edge-auto-confirm.ts
 * were split out).
 *
 * Rows with a null candidate_id are excluded, never bucketed under some
 * fallback key: a null means either "this was a merge, so no candidate
 * row exists" or "this row predates 0014". Neither is a decision about
 * any card on screen, and attaching it to one would be exactly the
 * plausible-looking stand-in the earlier `.find()`-by-kind version
 * produced.
 */
export function indexDecisionsByCandidateId(
  decisions: ReconciliationDecisionRow[],
): Map<string, ReconciliationDecisionRow> {
  const byCandidateId = new Map<string, ReconciliationDecisionRow>();
  for (const decision of decisions) {
    if (decision.candidate_id) {
      byCandidateId.set(decision.candidate_id, decision);
    }
  }
  return byCandidateId;
}
