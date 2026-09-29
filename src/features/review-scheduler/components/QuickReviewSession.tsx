"use client";

import { useState } from "react";
import type { DailySessionResult, SessionItem } from "@/features/review-scheduler/daily-session.ts";
import type { NextDueCourse } from "@/features/courses/next-due-course.ts";
import { type AnswerOutcome, statusFor, sessionScore, firstSkippedIndex } from "@/features/review-scheduler/quick-review-state.ts";
import { QuickReviewQuestion } from "@/features/review-scheduler/components/QuickReviewQuestion.tsx";
import { QuickReviewEndScreen } from "@/features/review-scheduler/components/QuickReviewEndScreen.tsx";

type SubmitResult = AnswerOutcome;

/**
 * The quick-review flow's state machine (Orca Phase 4), replacing
 * the old all-items-at-once study list.
 *
 * Three rules worth stating, because each is a deliberate decision
 * from the design doc rather than an implementation detail:
 *
 * 1. An answer commits its evidence the moment it is submitted, so
 *    there is no "submit the quiz" step -- which is why the skip
 *    dialog hangs off leaving the LAST question (by Skip, if it is
 *    still unanswered, or by Next/Finish once it is answered) rather
 *    than off a submit button. An unanswered question only ever offers
 *    Skip: a bare "Next" that recorded nothing would be a third,
 *    unaccounted-for way to leave a concept unaddressed, which is
 *    exactly the defect this rule closes.
 * 2. An answered question is read-only when revisited. Its evidence
 *    is already committed, and a second submission would be recorded
 *    as a second independent retrieval attempt the student never made.
 * 3. A skip writes nothing at all -- no evidence, no mastery change.
 *    The concept simply produced no evidence, so it stays due by the
 *    existing ranking and returns tomorrow.
 */
export function QuickReviewSession({
  courseId,
  daily,
  nextDueCourse,
  submitTextAnswer,
  submitStructuredAnswer,
  submitMultipleChoiceAnswer,
}: {
  courseId: string;
  daily: DailySessionResult;
  nextDueCourse: NextDueCourse;
  submitTextAnswer: (input: { courseId: string; conceptId: string; rubric: Record<string, unknown>; response: string }) => Promise<SubmitResult>;
  submitStructuredAnswer: (input: { courseId: string; conceptId: string; checkerDomain: NonNullable<SessionItem["checkerDomain"]>; checkerInput: Record<string, unknown>; claimFields: Record<string, unknown> }) => Promise<SubmitResult>;
  submitMultipleChoiceAnswer: (input: { courseId: string; conceptId: string; rubric: Record<string, unknown>; selectedIndex: number }) => Promise<SubmitResult>;
}) {
  const items = "items" in daily ? daily.items : [];
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Record<string, SubmitResult>>({});
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [phase, setPhase] = useState<"question" | "confirm-skips" | "end">("question");

  if (daily.status === "no_content") {
    return (
      <div style={s.messagePage}>
        <p style={s.notice}>{daily.message}</p>
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div style={s.messagePage}>
        <p style={s.notice}>No review questions are available for this course right now.</p>
      </div>
    );
  }

  const item = items[index];
  const score = sessionScore(results, skipped);

  function record(conceptId: string, outcome: SubmitResult) {
    setResults((current) => ({ ...current, [conceptId]: outcome }));
    // A successful answer clears any earlier skip of the same
    // question -- the student came back and answered it.
    if (outcome.error === null) {
      setSkipped((current) => {
        if (!current.has(conceptId)) return current;
        const next = new Set(current);
        next.delete(conceptId);
        return next;
      });
    }
  }

  async function handleText(response: string) {
    setPending(true);
    const outcome = await submitTextAnswer({ courseId, conceptId: item.conceptId, rubric: item.rubric, response });
    setPending(false);
    record(item.conceptId, outcome);
  }

  async function handleStructured(claimFields: Record<string, unknown>) {
    if (!item.checkerDomain || !item.checkerInput) return;
    setPending(true);
    const outcome = await submitStructuredAnswer({
      courseId,
      conceptId: item.conceptId,
      checkerDomain: item.checkerDomain,
      checkerInput: item.checkerInput,
      claimFields,
    });
    setPending(false);
    record(item.conceptId, outcome);
  }

  async function handleMultipleChoice(selectedIndex: number) {
    setPending(true);
    const outcome = await submitMultipleChoiceAnswer({ courseId, conceptId: item.conceptId, rubric: item.rubric, selectedIndex });
    setPending(false);
    record(item.conceptId, outcome);
  }

  function handleSkip() {
    // Computed locally rather than inside the setSkipped updater: the
    // set membership decides which screen comes next, and branching on
    // `current`/`skipped` (the render closure, not yet updated) would
    // silently skip the skip-confirmation dialog on the last question.
    // Keeping the branch outside the updater also avoids nesting a
    // setPhase/setIndex call inside a setState updater, which is not
    // guaranteed to run exactly once under StrictMode.
    const next = new Set(skipped).add(item.conceptId);
    setSkipped(next);
    if (index < items.length - 1) {
      setIndex(index + 1);
      return;
    }
    setPhase(next.size > 0 ? "confirm-skips" : "end");
  }

  function advance() {
    if (index < items.length - 1) {
      setIndex(index + 1);
      return;
    }
    // Last question. Anything skipped gets one honest prompt before
    // the end screen; otherwise finish straight away.
    setPhase(skipped.size > 0 ? "confirm-skips" : "end");
  }

  if (phase === "end") {
    return (
      <QuickReviewEndScreen
        items={items}
        correct={score.correct}
        answered={score.answered}
        skipped={score.skipped}
        courseId={courseId}
        nextDueCourse={nextDueCourse}
      />
    );
  }

  return (
    <>
      <QuickReviewQuestion
        item={item}
        index={index}
        total={items.length}
        answeredCount={score.answered}
        status={statusFor(item.conceptId, results, skipped)}
        outcome={results[item.conceptId]}
        pending={pending}
        backHref={`/courses/${courseId}`}
        onAnswerText={handleText}
        onAnswerStructured={handleStructured}
        onAnswerMultipleChoice={handleMultipleChoice}
        onSkip={handleSkip}
        onBack={() => setIndex(Math.max(0, index - 1))}
        onNext={advance}
      />

      {phase === "confirm-skips" && (
        <div style={s.dialogBackdrop} role="dialog" aria-modal="true" aria-label="Unanswered questions">
          <div style={s.dialog}>
            <h2 style={s.dialogTitle}>
              {score.skipped} {score.skipped === 1 ? "question" : "questions"} skipped
            </h2>
            <p style={s.dialogBody}>
              {score.answered} of {items.length} answered.
            </p>
            <div style={s.dialogActions}>
              <button
                type="button"
                style={s.dialogPrimary}
                onClick={() => {
                  const target = firstSkippedIndex(items.map((i) => i.conceptId), skipped);
                  // firstSkippedIndex only returns null when nothing is
                  // skipped, which is not how this dialog opens.
                  if (target !== null) setIndex(target);
                  setPhase("question");
                }}
              >
                Answer them
              </button>
              <button type="button" style={s.dialogSecondary} onClick={() => setPhase("end")}>
                Finish anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const s: Record<string, React.CSSProperties> = {
  messagePage: { height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 40, background: "var(--bg)" },
  notice: { margin: 0, fontSize: 14, color: "var(--text-tertiary)", textAlign: "center", maxWidth: 420 },
  dialogBackdrop: {
    position: "fixed",
    inset: 0,
    // No `--scrim` custom property exists in src/app/globals.css -- a
    // var() fallback that always fires is a variable that reads as
    // configurable but is not, so this is a plain literal instead.
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    zIndex: 40,
  },
  dialog: {
    width: "100%",
    maxWidth: 380,
    padding: 22,
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  dialogTitle: { margin: 0, fontSize: 16, fontWeight: 500, color: "var(--text-primary)", letterSpacing: "-0.015em" },
  dialogBody: { margin: 0, fontSize: 13.5, color: "var(--text-secondary)" },
  dialogActions: { display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 },
  dialogPrimary: {
    padding: "9px 16px",
    background: "var(--accent)",
    color: "var(--accent-fg)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    fontSize: 13.5,
    fontWeight: 500,
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
  },
  dialogSecondary: {
    padding: "9px 16px",
    background: "transparent",
    color: "var(--text-secondary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    fontSize: 13.5,
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
  },
};
