/**
 * Pure validators for each tool this feature's schema defines
 * (tutor-tools-schema.ts), run before any Supabase call happens --
 * factored out the same way learner-graph-evidence/
 * commit-evidence-validation.ts was, since run-tutor-turn.ts calls
 * server actions ("use server" modules may only export async functions).
 */

export type ValidationResult = { valid: true } | { valid: false; error: string };

export function validateSearchCourseMaterialsArgs(args: {
  query?: unknown;
  conceptIds?: unknown;
}): ValidationResult {
  if (typeof args.query !== "string" || args.query.trim().length === 0) {
    return { valid: false, error: "search_course_materials requires a non-empty query." };
  }
  return { valid: true };
}

export function validateGetConceptStateArgs(args: { conceptIds?: unknown }): ValidationResult {
  if (!Array.isArray(args.conceptIds) || args.conceptIds.length === 0) {
    return { valid: false, error: "get_concept_state requires at least one concept id." };
  }
  return { valid: true };
}

export function validateGetConceptNeighborsArgs(args: { conceptId?: unknown }): ValidationResult {
  if (typeof args.conceptId !== "string" || args.conceptId.length === 0) {
    return { valid: false, error: "get_concept_neighbors requires a conceptId." };
  }
  return { valid: true };
}

/** Mirrors learner-graph-evidence/commit-evidence-validation.ts's existing "at least one target" rule. */
function validateHasTarget(conceptIds: unknown, edgeIds: unknown): ValidationResult {
  const conceptCount = Array.isArray(conceptIds) ? conceptIds.length : 0;
  const edgeCount = Array.isArray(edgeIds) ? edgeIds.length : 0;
  if (conceptCount === 0 && edgeCount === 0) {
    return { valid: false, error: "Evidence must target at least one concept or edge." };
  }
  return { valid: true };
}

export function validateRecordExposureArgs(args: { conceptIds?: unknown; edgeIds?: unknown }): ValidationResult {
  return validateHasTarget(args.conceptIds, args.edgeIds);
}

export function validateRecordMisconceptionCandidateArgs(args: {
  conceptIds?: unknown;
  description?: unknown;
}): ValidationResult {
  const hasTarget = validateHasTarget(args.conceptIds, []);
  if (!hasTarget.valid) {
    return hasTarget;
  }
  if (typeof args.description !== "string" || args.description.trim().length === 0) {
    return { valid: false, error: "record_misconception_candidate requires a description." };
  }
  return { valid: true };
}
