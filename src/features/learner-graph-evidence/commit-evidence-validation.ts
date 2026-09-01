/**
 * Pure validation, factored out of actions.ts's commitEvidence the same
 * way course-graph-ingestion/flag-validation.ts was -- "use server"
 * modules may only export async functions, so this can't live directly
 * in actions.ts alongside the server action itself.
 *
 * Reuses isEvidenceEvent's existing "at least one target" shape rule
 * (src/types/domain/evidence-event.ts) rather than reimplementing it --
 * only the parts of that check that can be verified before any database
 * call happens (whether a real course_concepts/concept_edges row exists
 * is checked in actions.ts, not here).
 */
export function validateHasTarget(
  conceptIds: string[],
  edgeIds: string[],
): { valid: true } | { valid: false; error: string } {
  if (conceptIds.length === 0 && edgeIds.length === 0) {
    return { valid: false, error: "Evidence must target at least one concept or edge." };
  }
  return { valid: true };
}
