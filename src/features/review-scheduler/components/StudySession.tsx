"use client";

import { useState } from "react";
import type { DailySessionResult, SessionItem } from "@/features/review-scheduler/daily-session.ts";
import { StructuredAnswerForm } from "@/features/review-scheduler/components/StructuredAnswerForm.tsx";
import { MultipleChoiceForm } from "@/features/review-scheduler/components/MultipleChoiceForm.tsx";
import { IconCheck, IconArrow } from "@/components/icons.tsx";

type SubmitResult = { result: { outcome: string; [key: string]: unknown }; error: string | null };

/**
 * "Passed" isn't just outcome === "correct" -- deterministic-grading's
 * code-sandbox path reports outcome "graded" with a separate
 * allPassed boolean, not "correct"/"incorrect" (grading-evidence.ts).
 * Treating every non-"correct" outcome as a failure would mislabel a
 * real passing code submission as a red X.
 */
function isPassedOutcome(result: SubmitResult["result"]): boolean {
  if (result.outcome === "correct") return true;
  if (result.outcome === "graded") return result.allPassed === true;
  return false;
}

/**
 * Daily review session UI (T009). Text-modality items are answerable
 * via submitTextReviewAnswer; structured (graph/tree, checkerDomain
 * set) items are answerable via the generic StructuredAnswerForm +
 * submitStructuredReviewAnswer -- both route through
 * deterministic-grading's existing grading actions unchanged (FR-010),
 * no new grading path. The weekly Connect session (T014) moved to the
 * Review page (DueQueue.tsx) -- see that file's own comment.
 */
export function StudySession({
  courseId,
  initialDaily,
  loadMore,
  submitTextAnswer,
  submitStructuredAnswer,
  submitMultipleChoiceAnswer,
}: {
  courseId: string;
  initialDaily: DailySessionResult;
  loadMore: (courseId: string, excludeConceptIds: string[]) => Promise<DailySessionResult>;
  submitTextAnswer: (input: { courseId: string; conceptId: string; rubric: Record<string, unknown>; response: string }) => Promise<SubmitResult>;
  submitStructuredAnswer: (input: { courseId: string; conceptId: string; checkerDomain: NonNullable<SessionItem["checkerDomain"]>; checkerInput: Record<string, unknown>; claimFields: Record<string, unknown> }) => Promise<SubmitResult>;
  submitMultipleChoiceAnswer: (input: { courseId: string; conceptId: string; rubric: Record<string, unknown>; selectedIndex: number }) => Promise<SubmitResult>;
}) {
  const [daily, setDaily] = useState(initialDaily);
  const [shownConceptIds, setShownConceptIds] = useState<string[]>(
    "items" in initialDaily ? initialDaily.items.map((item) => item.conceptId) : [],
  );
  const [results, setResults] = useState<Record<string, SubmitResult>>({});
  const [pendingConceptId, setPendingConceptId] = useState<string | null>(null);

  async function handleAnswer(item: SessionItem, response: string) {
    if (response.trim().length === 0) return;
    setPendingConceptId(item.conceptId);
    const outcome = await submitTextAnswer({
      courseId,
      conceptId: item.conceptId,
      rubric: item.rubric,
      response,
    });
    setPendingConceptId(null);
    setResults((current) => ({ ...current, [item.conceptId]: outcome }));
  }

  async function handleStructuredAnswer(item: SessionItem, claimFields: Record<string, unknown>) {
    if (!item.checkerDomain || !item.checkerInput) return;
    setPendingConceptId(item.conceptId);
    const outcome = await submitStructuredAnswer({
      courseId,
      conceptId: item.conceptId,
      checkerDomain: item.checkerDomain,
      checkerInput: item.checkerInput,
      claimFields,
    });
    setPendingConceptId(null);
    setResults((current) => ({ ...current, [item.conceptId]: outcome }));
  }

  async function handleMultipleChoiceAnswer(item: SessionItem, selectedIndex: number) {
    setPendingConceptId(item.conceptId);
    const outcome = await submitMultipleChoiceAnswer({
      courseId,
      conceptId: item.conceptId,
      rubric: item.rubric,
      selectedIndex,
    });
    setPendingConceptId(null);
    setResults((current) => ({ ...current, [item.conceptId]: outcome }));
  }

  async function handleLoadMore() {
    const more = await loadMore(courseId, shownConceptIds);
    if ("items" in more) {
      setShownConceptIds((current) => [...current, ...more.items.map((item) => item.conceptId)]);
    }
    setDaily((current) => {
      if (!("items" in current) || !("items" in more)) return more;
      return { ...more, items: [...current.items, ...more.items] };
    });
  }

  const total = "items" in daily ? daily.items.length : 0;
  const answeredCount = Object.keys(results).length;

  return (
    <div style={s.page}>
      <div style={s.inner}>
        <h1 style={s.pageTitle}>Study</h1>
        <section style={s.section}>
          {total > 0 && (
            <div style={s.progressBlock}>
              <div style={s.progressBar}>
                {Array.from({ length: total }).map((_, i) => (
                  <div key={i} style={{ ...s.progressSeg, background: i < answeredCount ? "var(--clay)" : "var(--border)" }} />
                ))}
              </div>
              <span style={s.progressLabel}>
                {answeredCount} of {total} answered
              </span>
            </div>
          )}

          {daily.status === "no_content" && <p style={s.notice}>{daily.message}</p>}
          {daily.status === "budget_too_small" && <p style={s.noticeWarn}>{daily.message}</p>}

          {(daily.status === "ok" || daily.status === "budget_too_small") && (
            <>
              <div style={s.itemList}>
                {daily.items.map((item) => {
                  const outcome = results[item.conceptId];
                  const isPending = pendingConceptId === item.conceptId;
                  const passed = outcome && !outcome.error && isPassedOutcome(outcome.result);

                  return (
                    <div key={item.conceptId} style={s.questionCard}>
                      <p style={s.questionText}>{item.questionText}</p>
                      <ul style={s.reasonList}>
                        {item.reasons.map((reason, i) => (
                          <li key={i} style={s.reason}>
                            {reason}
                          </li>
                        ))}
                      </ul>

                      {!outcome &&
                        (item.checkerDomain ? (
                          <StructuredAnswerForm
                            checkerDomain={item.checkerDomain}
                            onSubmit={(claimFields) => handleStructuredAnswer(item, claimFields)}
                            pending={isPending}
                          />
                        ) : item.responseModality === "multiple_choice" ? (
                          <MultipleChoiceForm
                            options={(item.rubric.options as string[] | undefined) ?? []}
                            onSubmit={(selectedIndex) => handleMultipleChoiceAnswer(item, selectedIndex)}
                            pending={isPending}
                          />
                        ) : item.responseModality === "text" ? (
                          <form
                            onSubmit={async (e) => {
                              e.preventDefault();
                              const response = (new FormData(e.currentTarget).get("response") as string | null) ?? "";
                              await handleAnswer(item, response);
                            }}
                            style={s.answerForm}
                          >
                            <textarea name="response" rows={4} style={s.textarea} placeholder="Write your answer…" />
                            <button type="submit" disabled={isPending} style={s.submitBtn}>
                              Submit <IconArrow />
                            </button>
                          </form>
                        ) : (
                          <p style={s.notice}>This question type isn&apos;t answerable here yet.</p>
                        ))}

                      {/* A real submitTextAnswer error (auth failure, or a
                          did_not_complete grading failure) must be shown as
                          an error, never rendered as a plausible-looking
                          grading outcome (found during a hardening-pass
                          audit -- this previously always rendered
                          result.outcome regardless of error). */}
                      {outcome &&
                        (outcome.error ? (
                          <p style={s.errorText}>{outcome.error}</p>
                        ) : (
                          <div
                            style={{
                              ...s.verdict,
                              flexDirection: "column",
                              alignItems: "flex-start",
                              background: passed ? "var(--teal-muted)" : "var(--clay-muted)",
                              border: `1px solid ${passed ? "var(--teal-border)" : "var(--clay-border)"}`,
                            }}
                          >
                            <div style={s.verdictRow}>
                              <span style={{ ...s.verdictIcon, color: passed ? "var(--teal)" : "var(--clay)" }}>
                                {passed ? <IconCheck /> : "✕"}
                              </span>
                              <span style={{ ...s.verdictText, color: passed ? "var(--teal)" : "var(--clay)" }}>
                                Result: {String(outcome.result.outcome)}
                              </span>
                            </div>
                            {/* MCQ-specific: don't just say "incorrect" --
                                show what the right answer actually was, so a
                                wrong guess is still a learning moment, not a
                                dead end. */}
                            {item.responseModality === "multiple_choice" &&
                              !passed &&
                              typeof outcome.result.correctOptionIndex === "number" && (
                                <span style={s.correctAnswerText}>
                                  Correct answer:{" "}
                                  {((item.rubric.options as string[] | undefined) ?? [])[
                                    outcome.result.correctOptionIndex as number
                                  ] ?? "(unavailable)"}
                                </span>
                              )}
                          </div>
                        ))}
                    </div>
                  );
                })}
              </div>
              {daily.status === "ok" && daily.moreAvailable && (
                <button type="button" onClick={handleLoadMore} style={s.moreBtn}>
                  Show more
                </button>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { height: "100%", overflowY: "auto", background: "var(--bg)", padding: "36px 40px", display: "flex", justifyContent: "center" },
  inner: { width: "100%", maxWidth: 640, display: "flex", flexDirection: "column", gap: 40 },
  section: { display: "flex", flexDirection: "column", gap: 16 },
  pageTitle: { margin: 0, fontSize: 20, fontWeight: 500, letterSpacing: "-0.025em", color: "var(--text-primary)" },
  progressBlock: { display: "flex", flexDirection: "column", gap: 8 },
  progressBar: { display: "flex", gap: 4 },
  progressSeg: { height: 3, flex: 1, borderRadius: 2 },
  progressLabel: { fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" },
  notice: { margin: 0, fontSize: 13.5, color: "var(--text-tertiary)" },
  noticeWarn: { margin: 0, fontSize: 13.5, color: "var(--urgent-amber)" },
  itemList: { display: "flex", flexDirection: "column", gap: 16 },
  questionCard: {
    padding: 20,
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  questionText: { margin: 0, fontSize: 15, fontWeight: 450, color: "var(--text-primary)", lineHeight: 1.6, letterSpacing: "-0.01em" },
  reasonList: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 3 },
  reason: { fontSize: 12, color: "var(--text-tertiary)" },
  answerForm: { display: "flex", flexDirection: "column", gap: 10 },
  textarea: {
    width: "100%",
    padding: "12px 14px",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    fontSize: 14,
    fontFamily: "var(--font-sans)",
    color: "var(--text-primary)",
    background: "var(--bg)",
    resize: "vertical",
    lineHeight: 1.6,
    boxSizing: "border-box",
  },
  submitBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    alignSelf: "flex-start",
    padding: "9px 16px",
    background: "var(--clay)",
    color: "var(--clay-fg)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    fontSize: 13.5,
    fontWeight: 500,
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
  },
  errorText: { margin: 0, fontSize: 12.5, color: "var(--clay)" },
  verdict: { display: "flex", alignItems: "center", gap: 9, padding: "10px 14px", borderRadius: "var(--radius-sm)", border: "1px solid" },
  verdictRow: { display: "flex", alignItems: "center", gap: 9 },
  verdictIcon: { display: "flex", flexShrink: 0 },
  verdictText: { fontSize: 13.5, fontWeight: 500, letterSpacing: "-0.01em" },
  correctAnswerText: { fontSize: 13, color: "var(--text-secondary)", marginTop: 2 },
  moreBtn: {
    alignSelf: "flex-start",
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
