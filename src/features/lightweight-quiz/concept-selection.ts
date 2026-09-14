/**
 * "High-level concepts" = importance_score at or above this threshold
 * (the field already exists on course_concepts for exactly this kind of
 * judgment -- design doc's "Concept selection & question count").
 * Tunable, same convention as review-scheduler's own weight constants.
 */
export const IMPORTANCE_THRESHOLD = 0.6;

/** Hard cap on total questions generated per extraction run, regardless
 * of how many concepts qualify -- bounds cost/latency for a large
 * upload. */
export const MAX_QUESTIONS_PER_RUN = 15;

export function selectEligibleConceptIds(concepts: { id: string; importanceScore: number }[]): string[] {
  return concepts.filter((c) => c.importanceScore >= IMPORTANCE_THRESHOLD).map((c) => c.id);
}
