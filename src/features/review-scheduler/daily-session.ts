import type { ConceptPriority } from "./review-priority.ts";
import type { CheckerDomain } from "../visual-assessment/problem-setup.ts";
import type { MasteryState } from "../../types/graph/course-graph.ts";

/** Display metadata for one concept, looked up by the caller that has
 * database access. Kept out of ConceptPriority: that type is the
 * ranking domain's, and a concept's name is not a ranking input. */
export type ConceptMeta = { name: string; masteryState: MasteryState };

export type QuestionBankEntrySummary = {
  id: string;
  conceptId: string;
  questionText: string;
  responseModality: string;
  rubric: Record<string, unknown>;
  /** Reused verbatim from question_bank -- when set, the item can be
   * answered via a structured claim-fields form (submitStructuredReviewAnswer)
   * instead of only free text. */
  checkerDomain: CheckerDomain | null;
  checkerInput: Record<string, unknown> | null;
};

export type SessionItem = {
  conceptId: string;
  /** course_concepts.canonical_name -- what the end screen lists as
   * covered. */
  conceptName: string;
  /** learner_concept_state.mastery_state, via getConceptState. A
   * concept with no state row is genuinely "unverified"; that is a
   * real band, not a stand-in for a missing value. */
  masteryState: MasteryState;
  questionBankEntryId: string;
  questionText: string;
  responseModality: string;
  rubric: Record<string, unknown>;
  checkerDomain: CheckerDomain | null;
  checkerInput: Record<string, unknown> | null;
  /** ConceptPriority.reasons, carried through (FR-007). */
  reasons: string[];
};

export type DailySessionResult =
  | { status: "ok"; items: SessionItem[]; moreAvailable: boolean }
  | { status: "no_content"; message: string }
  | { status: "budget_too_small"; items: SessionItem[]; message: string };

/** Tunable (research.md pattern) -- question_bank doesn't record a
 * per-question time estimate, so every item is treated as this fixed
 * cost until a real signal exists. */
export const DEFAULT_MINUTES_PER_QUESTION = 2;

/**
 * Composes a time-bounded daily session from already-ranked, already-
 * filtered-to-due concepts (rankConceptsByPriority + isDue upstream in
 * actions.ts) and the real validated questions available for them. A
 * due concept with zero available questions is skipped, never
 * fabricated as a placeholder item (FR-009) and never counted toward
 * the time budget.
 */
export function composeDailySession(
  rankedDueConcepts: ConceptPriority[],
  questionsByConcept: Map<string, QuestionBankEntrySummary[]>,
  conceptMetaById: Map<string, ConceptMeta>,
  timeBudgetMinutes: number,
  excludeConceptIds: string[],
): DailySessionResult {
  const excluded = new Set(excludeConceptIds);
  const eligible = rankedDueConcepts.filter((c) => !excluded.has(c.conceptId) && (questionsByConcept.get(c.conceptId)?.length ?? 0) > 0);

  if (eligible.length === 0) {
    return {
      status: "no_content",
      message: "No review content is available yet for what's due today.",
    };
  }

  const maxItems = Math.max(1, Math.floor(timeBudgetMinutes / DEFAULT_MINUTES_PER_QUESTION));
  const budgetWasTooSmall = timeBudgetMinutes < DEFAULT_MINUTES_PER_QUESTION;

  const selected = eligible.slice(0, maxItems);
  const items: SessionItem[] = selected.map((priority) => {
    const questions = questionsByConcept.get(priority.conceptId)!;
    const question = questions[0];
    const conceptMeta = conceptMetaById.get(priority.conceptId);
    // Every ranked concept came from the same course_concepts read
    // that builds this map, so a miss is a wiring bug, not a student
    // state. Throwing keeps it loud -- a fallback name here would put
    // an invented concept on the end screen's "covered" list.
    if (!conceptMeta) {
      throw new Error(`No concept metadata for ranked concept ${priority.conceptId}`);
    }
    return {
      conceptId: priority.conceptId,
      conceptName: conceptMeta.name,
      masteryState: conceptMeta.masteryState,
      questionBankEntryId: question.id,
      questionText: question.questionText,
      responseModality: question.responseModality,
      rubric: question.rubric,
      checkerDomain: question.checkerDomain,
      checkerInput: question.checkerInput,
      reasons: priority.reasons,
    };
  });

  if (budgetWasTooSmall) {
    return {
      status: "budget_too_small",
      items,
      message: `Your time budget (${timeBudgetMinutes} min) is smaller than one question typically takes -- showing the single highest-priority item.`,
    };
  }

  return {
    status: "ok",
    items,
    moreAvailable: eligible.length > selected.length,
  };
}
