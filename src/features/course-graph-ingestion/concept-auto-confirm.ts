/**
 * Pure decision logic for the confirm-time half of concept auto-confirm
 * (2026-09-07 decision, architecture-log.md -- units, not concepts, are
 * the review-gated side of extraction). trigger/extract-course-graph.ts
 * carries its own copy of this same decision for the insert-time half
 * (a concept whose unit is already confirmed at extraction time); this
 * file covers the other half -- a concept whose unit was still
 * 'proposed' at insert time catches up the moment a reviewer confirms
 * that unit. Factored out with no "@/"-aliased imports, same reasoning
 * as edge-auto-confirm.ts, so it stays loadable and testable without a
 * live Supabase client or Next.js request context.
 */

/**
 * Decides whether a 'proposed' concept under a just-confirmed unit is
 * eligible to auto-confirm. The unit half of the invariant is true by
 * construction here (the caller only calls this for concepts under the
 * unit it just confirmed) -- only the concept's own reconciliation
 * decision is still in question. An uncertain match is never swept in,
 * same reasoning ReviewQueue.tsx's bulk-confirm already applies:
 * uncertainty about the *concept itself* doesn't go away just because
 * its unit was fine. `undefined` (no reconciliation_decisions row found
 * for this concept) is treated as "not eligible" rather than assumed
 * safe -- every pipeline-inserted concept has one, so a missing row here
 * is unexpected and the conservative read is to leave it for individual
 * review rather than silently confirm something no record backs.
 */
export function shouldAutoConfirmConcept(reconciliationDecision: string | undefined): boolean {
  return reconciliationDecision !== undefined && reconciliationDecision !== "uncertain";
}
