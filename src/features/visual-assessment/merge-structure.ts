/**
 * Recombines a real problem setup with a (possibly student-corrected)
 * set of claim fields into the exact full checkerInput
 * gradeStructuredResponse expects. Pure -- does no confidence
 * checking, no grading, only reassembly. The inverse of
 * problem-setup.ts's extractProblemSetup: claimFields' own keys always
 * win on overlap, since they're what the student actually confirmed.
 */
export function mergeStructure(
  problemSetup: Record<string, unknown>,
  claimFields: Record<string, unknown>,
): Record<string, unknown> {
  return { ...problemSetup, ...claimFields };
}
