// Alias-free by design: the plain `node --test` runner resolves no
// `@/*` alias, and every rule the quick-review screens depend on lives
// here precisely so it can be tested without a DOM (this repo has no
// component-test tooling). `import type` is erased at parse time, so
// the type-only import below never triggers resolution.
import type { MasteryState } from "../../types/graph/course-graph.ts";

export type AnswerOutcome = {
  result: { outcome: string; [key: string]: unknown };
  error: string | null;
};

export type ItemStatus = "answered" | "skipped" | "unanswered";

/**
 * "Passed" is not just outcome === "correct". Deterministic-grading's
 * code-sandbox path reports outcome "graded" with a separate
 * allPassed boolean (grading-evidence.ts), so treating every
 * non-"correct" outcome as failure would mislabel a real passing code
 * submission as a red X. Moved here from the old all-items-at-once
 * study component, where it had no test.
 */
export function isPassedOutcome(result: AnswerOutcome["result"]): boolean {
  if (result.outcome === "correct") return true;
  if (result.outcome === "graded") return result.allPassed === true;
  return false;
}

/**
 * A submission that errored is "unanswered", not "answered": it
 * committed no evidence, so the student may and should try again. A
 * graded-wrong answer and a failed-to-grade answer must never be
 * treated alike.
 */
export function statusFor(
  conceptId: string,
  results: Record<string, AnswerOutcome>,
  skipped: ReadonlySet<string>,
): ItemStatus {
  const outcome = results[conceptId];
  if (outcome && outcome.error === null) return "answered";
  if (skipped.has(conceptId)) return "skipped";
  return "unanswered";
}

/**
 * How far through the session the student is -- answered AND skipped
 * items both count, because this bar reports progress through today's
 * review, not a score. A skipped question has been dealt with: the
 * student saw it, decided, and moved on, and it will not come back in
 * this session.
 *
 * This deliberately reverses an earlier rule that counted answered
 * items only. That version left the bar reading 0% for a student who
 * had worked through half the session, which misreports the one thing
 * a progress bar is for. Nothing is overstated by it either: the end
 * screen reports correctness and skips separately (`sessionScore`), so
 * "how much is done" and "how much did you get right" stay distinct
 * numbers rather than one number trying to mean both.
 *
 * A failed submission is not addressed -- `statusFor` leaves it
 * "unanswered" and it stays answerable -- so a grading failure never
 * advances the bar.
 */
export function progressPercent(addressedCount: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((addressedCount / total) * 100);
}

export function sessionScore(
  results: Record<string, AnswerOutcome>,
  skipped: ReadonlySet<string>,
): { correct: number; answered: number; skipped: number } {
  const graded = Object.values(results).filter((outcome) => outcome.error === null);
  return {
    correct: graded.filter((outcome) => isPassedOutcome(outcome.result)).length,
    answered: graded.length,
    skipped: skipped.size,
  };
}

/** Session order, not skip order -- "answer them" should walk the
 * student forward from the earliest gap. */
export function firstSkippedIndex(
  conceptIdsInOrder: string[],
  skipped: ReadonlySet<string>,
): number | null {
  const index = conceptIdsInOrder.findIndex((id) => skipped.has(id));
  return index === -1 ? null : index;
}

const BAND_ORDER: MasteryState[] = ["unverified", "exposed", "weak", "solid"];

/**
 * Copy for the (disabled until Phase 9) deep-review offer, worded from
 * the real model: this codebase has no numeric levels, only the band
 * enum. The label names the band directly above the session's weakest
 * concept, so it is true now and stays true when Phase 9 wires the
 * control up. With nothing left to climb it says so plainly, and with
 * no concepts at all it returns null rather than inventing a target.
 */
export function deepReviewStubLabel(bands: MasteryState[]): string | null {
  if (bands.length === 0) return null;
  const lowestIndex = Math.min(...bands.map((band) => BAND_ORDER.indexOf(band)));
  const next = BAND_ORDER[lowestIndex + 1];
  return next ? `Deep review to reach ${next}` : "Deep review for extra practice";
}
