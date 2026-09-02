// Type-only import of LearnerConceptState from the "use server" actions
// module -- `import type` is fully erased by Node's type-stripping, so
// it never triggers resolving that module (which itself imports
// "@/lib/supabase/server.ts", only resolvable under Next.js's bundler).
// This keeps review-priority.ts a pure, plain-node-testable function,
// same pattern deterministic-grading/grading-evidence.ts already
// established.
import type { LearnerConceptState } from "../learner-graph-evidence/actions.ts";

/**
 * Tunable starting parameters (research.md "Priority formula weights:
 * tunable constants, not calibrated values") -- same convention as
 * evidence-weights.ts's strengthByType, assistance-ladder.ts's
 * attemptsPerStep, deterministic-grading's confidence threshold, and
 * assessment-generation-pipeline's MAX_GENERATION_ATTEMPTS.
 */
export type ReviewPriorityWeights = {
  forgettingRiskWeight: number;
  courseImportanceWeight: number;
  evidenceGapWeight: number;
  prerequisiteCentralityWeight: number;
  unresolvedConfusionWeight: number;
  /** Neutral until exam-planner exists (spec.md FR-012) -- multiplies
   * the combined score by exactly 1, never fabricating exam relevance. */
  neutralExamWeight: number;
};

export const DEFAULT_REVIEW_PRIORITY_WEIGHTS: ReviewPriorityWeights = {
  forgettingRiskWeight: 1,
  courseImportanceWeight: 1,
  evidenceGapWeight: 1,
  prerequisiteCentralityWeight: 0.5,
  unresolvedConfusionWeight: 2,
  neutralExamWeight: 1,
};

export type ConceptPriorityInput = {
  conceptId: string;
  /** course_concepts.importance_score, 0-1. */
  importanceScore: number;
  /** # of prerequisite_for edges FROM this concept -- how many other
   * concepts list it as a prerequisite. */
  prerequisiteOutDegree: number;
  /** From learner-graph-evidence's getConceptState, unchanged. */
  learnerState: LearnerConceptState;
};

export type ConceptPriority = {
  conceptId: string;
  priorityScore: number;
  /** Real, specific reasons (FR-007) -- never a generic "this is due"
   * placeholder. */
  reasons: string[];
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * How thin the evidence for this concept is -- higher when there's
 * less of it (0 evidence yet -> maximum gap) or when the tier itself
 * is low. Reads learnerState.score directly rather than re-deriving
 * recency decay itself (that's already computeLearnerState's job).
 */
function evidenceGap(learnerState: LearnerConceptState): number {
  return Math.max(0, 1 - learnerState.score);
}

/**
 * Forgetting risk grows with days since last evidence -- a concept
 * with no evidence yet gets the maximum risk (FR-004: immediately due,
 * not deprioritized for lack of history).
 */
function forgettingRisk(learnerState: LearnerConceptState, now: Date): number {
  if (learnerState.lastEvidenceAt === null) return 1;
  const ageDays = Math.max(0, (now.getTime() - new Date(learnerState.lastEvidenceAt).getTime()) / MS_PER_DAY);
  // Saturates toward 1 as age grows -- bounded so a very old concept
  // doesn't dominate the score arbitrarily, same "bounded factor"
  // shape as deterministic-grading's difficultyFactor.
  return Math.min(1, ageDays / 14);
}

function buildReasons(
  learnerState: LearnerConceptState,
  forgetting: number,
  gap: number,
  prerequisiteOutDegree: number,
): string[] {
  const reasons: string[] = [];
  if (learnerState.lastEvidenceAt === null) {
    reasons.push("You haven't practiced this concept yet.");
  } else if (forgetting > 0.5) {
    const ageDays = Math.round((Date.now() - new Date(learnerState.lastEvidenceAt).getTime()) / MS_PER_DAY);
    reasons.push(`It's been ${ageDays} day${ageDays === 1 ? "" : "s"} since you last practiced this.`);
  }
  if (learnerState.hasUnresolvedMisconception) {
    reasons.push("You have an unresolved mix-up flagged here.");
  }
  if (gap > 0.6) {
    reasons.push("Your evidence for this concept is still thin.");
  }
  if (prerequisiteOutDegree > 0) {
    reasons.push(`${prerequisiteOutDegree} other concept${prerequisiteOutDegree === 1 ? "" : "s"} build on this one.`);
  }
  if (reasons.length === 0) {
    reasons.push("This concept is due for a routine check-in.");
  }
  return reasons;
}

export function computeConceptPriority(
  input: ConceptPriorityInput,
  now: Date,
  weights: ReviewPriorityWeights,
): ConceptPriority {
  const forgetting = forgettingRisk(input.learnerState, now);
  const gap = evidenceGap(input.learnerState);

  const priorityScore =
    forgetting * weights.forgettingRiskWeight +
    input.importanceScore * weights.courseImportanceWeight +
    gap * weights.evidenceGapWeight +
    Math.min(1, input.prerequisiteOutDegree / 5) * weights.prerequisiteCentralityWeight +
    (input.learnerState.hasUnresolvedMisconception ? 1 : 0) * weights.unresolvedConfusionWeight;

  return {
    conceptId: input.conceptId,
    priorityScore: priorityScore * weights.neutralExamWeight,
    reasons: buildReasons(input.learnerState, forgetting, gap, input.prerequisiteOutDegree),
  };
}

export function rankConceptsByPriority(
  inputs: ConceptPriorityInput[],
  now: Date,
  weights: ReviewPriorityWeights,
): ConceptPriority[] {
  return inputs
    .map((input) => computeConceptPriority(input, now, weights))
    .sort((a, b) => b.priorityScore - a.priorityScore);
}
