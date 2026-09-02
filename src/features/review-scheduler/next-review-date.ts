import type { LearnerConceptState } from "../learner-graph-evidence/actions.ts";

/**
 * "When is this concept next due" is derived purely from
 * computeLearnerState's existing output (score, lastEvidenceAt,
 * hasUnresolvedMisconception), never a stored, incrementally-patched
 * column (research.md "No new persistence layer"). This is what makes
 * spec.md US2/SC-005 hold structurally: a correct, independent answer
 * raises computeLearnerState's score on the next read, which this
 * function turns into a longer interval, with no need to separately
 * track "was the last answer right" -- that's already what produced
 * the new score.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Tunable starting parameters, same convention as review-priority.ts. */
export const BASE_REVIEW_INTERVAL_DAYS = 3;
export const MAX_REVIEW_INTERVAL_DAYS = 30;
/** How soon an unresolved misconception forces a concept back, regardless of score. */
export const UNRESOLVED_MISCONCEPTION_INTERVAL_DAYS = 1;

function intervalDaysForScore(score: number): number {
  const clamped = Math.min(1, Math.max(0, score));
  return BASE_REVIEW_INTERVAL_DAYS + clamped * (MAX_REVIEW_INTERVAL_DAYS - BASE_REVIEW_INTERVAL_DAYS);
}

export function computeNextReviewDate(learnerState: LearnerConceptState, now: Date): Date {
  // FR-004: no prior evidence -> immediately due, not skipped.
  if (learnerState.lastEvidenceAt === null) {
    return now;
  }

  const lastEvidenceAt = new Date(learnerState.lastEvidenceAt);

  if (learnerState.hasUnresolvedMisconception) {
    return new Date(lastEvidenceAt.getTime() + UNRESOLVED_MISCONCEPTION_INTERVAL_DAYS * MS_PER_DAY);
  }

  const intervalDays = intervalDaysForScore(learnerState.score);
  return new Date(lastEvidenceAt.getTime() + intervalDays * MS_PER_DAY);
}

export function isDue(learnerState: LearnerConceptState, now: Date): boolean {
  return computeNextReviewDate(learnerState, now).getTime() <= now.getTime();
}
