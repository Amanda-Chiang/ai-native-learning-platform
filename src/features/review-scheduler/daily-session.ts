import type { ConceptPriority } from "./review-priority.ts";

export type QuestionBankEntrySummary = {
  id: string;
  conceptId: string;
  questionText: string;
  responseModality: string;
};

export type SessionItem = {
  conceptId: string;
  questionBankEntryId: string;
  questionText: string;
  responseModality: string;
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
    return {
      conceptId: priority.conceptId,
      questionBankEntryId: question.id,
      questionText: question.questionText,
      responseModality: question.responseModality,
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
