/**
 * Pure assistance-ladder algorithm (data-model.md "computeLadderStep").
 * Recomputed fresh from a conversation's own attempt history every call
 * -- no persisted step counter (research.md "Assistance ladder:
 * recomputed from conversation history, not a persisted counter"), same
 * recompute-from-log reasoning learner-graph-evidence's
 * computeLearnerState already established for this project.
 */

export type LadderAttempt = {
  /** Whether the student got this attempt right. */
  resolved: boolean;
  /** Whether the student explicitly asked to skip the ladder (FR-006). */
  requestedDirectAnswer: boolean;
};

export type LadderWeights = {
  /**
   * Unresolved attempts at one step before escalating to the next -- a
   * tunable starting parameter (PRD S14.3), not a calibrated constant,
   * same labeling convention evidence-weights.ts already established.
   */
  attemptsPerStep: number;
};

export const DEFAULT_LADDER_WEIGHTS: LadderWeights = {
  attemptsPerStep: 1,
};

const MAX_STEP = 6;

const DIRECT_ANSWER_PHRASES = [
  "just explain",
  "just tell me",
  "give me the answer",
  "just give me the answer",
  "skip to the answer",
  "tell me the answer",
];

/**
 * Detects an explicit request to skip the ladder (FR-006's "just
 * explain" escape hatch) from the student's own message text.
 */
export function detectsDirectAnswerRequest(message: string): boolean {
  const lower = message.toLowerCase();
  return DIRECT_ANSWER_PHRASES.some((phrase) => lower.includes(phrase));
}

export function computeLadderStep(priorAttempts: LadderAttempt[], weights: LadderWeights): number {
  // The escape hatch always wins, checked first, regardless of how many
  // attempts came before it (FR-006).
  if (priorAttempts.some((a) => a.requestedDirectAnswer)) {
    return MAX_STEP;
  }

  const unresolvedCount = priorAttempts.filter((a) => !a.resolved).length;
  const step = Math.floor(unresolvedCount / weights.attemptsPerStep);
  return Math.min(step, MAX_STEP);
}
