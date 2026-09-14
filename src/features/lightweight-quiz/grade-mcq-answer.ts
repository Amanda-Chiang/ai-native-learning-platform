export type McqGradeResult =
  | { outcome: "correct" | "incorrect"; selectedIndex: number; correctOptionIndex: number }
  | { outcome: "incorrect"; selectedIndex: number; correctOptionIndex: -1; error: string };

/**
 * Pure deterministic grading logic for a multiple_choice question_bank
 * row -- no LLM call, no checker dispatch (design doc "Grading"): just
 * compare the selected index against rubric.correctOptionIndex. Split
 * out from submitMultipleChoiceReviewAnswer so the actual comparison
 * logic is testable without a database/auth context, same "pure logic
 * separated from the DB-touching action" convention
 * deterministic-grading's toCommitEvidenceInput already established.
 */
export function gradeMultipleChoiceAnswer(rubric: Record<string, unknown>, selectedIndex: number): McqGradeResult {
  const correctOptionIndex = rubric.correctOptionIndex;
  if (typeof correctOptionIndex !== "number") {
    return {
      outcome: "incorrect",
      selectedIndex,
      correctOptionIndex: -1,
      error: "This question has no recorded correct answer -- cannot grade it.",
    };
  }
  return {
    outcome: selectedIndex === correctOptionIndex ? "correct" : "incorrect",
    selectedIndex,
    correctOptionIndex,
  };
}
