/**
 * One of the two lightweight-quiz generation triggers (design doc
 * "Trigger: either of two signals"): every concept/unit from an
 * extraction run has left 'proposed' (confirmed or archived), so
 * there's nothing left for a reviewer to decide.
 */
export function isExtractionRunFullyReviewed(proposedConceptCount: number, proposedUnitCount: number): boolean {
  return proposedConceptCount === 0 && proposedUnitCount === 0;
}
