"use client";

import { useState } from "react";
import type { DailySessionResult, SessionItem } from "@/features/review-scheduler/daily-session.ts";
import type { ConnectSessionResult } from "@/features/review-scheduler/connect-session.ts";
import { StructuredAnswerForm } from "@/features/review-scheduler/components/StructuredAnswerForm.tsx";
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
 * Daily + weekly Connect session UI (T009/T014). Text-modality items
 * are answerable via submitTextReviewAnswer; structured (graph/tree,
 * checkerDomain set) items are answerable via the generic
 * StructuredAnswerForm + submitStructuredReviewAnswer -- both route
 * through deterministic-grading's existing grading actions unchanged
 * (FR-010), no new grading path.
 */
export function StudySession({
  courseId,
  initialDaily,
  connect,
  loadMore,
  submitTextAnswer,
  submitStructuredAnswer,
}: {
  courseId: string;
  initialDaily: DailySessionResult;
  connect: ConnectSessionResult;
  loadMore: (courseId: string, excludeConceptIds: string[]) => Promise<DailySessionResult>;
  submitTextAnswer: (input: { courseId: string; conceptId: string; rubric: Record<string, unknown>; response: string }) => Promise<SubmitResult>;
  submitStructuredAnswer: (input: { courseId: string; conceptId: string; checkerDomain: NonNullable<SessionItem["checkerDomain"]>; checkerInput: Record<string, unknown>; claimFields: Record<string, unknown> }) => Promise<SubmitResult>;
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
                              background: passed ? "var(--teal-muted)" : "var(--clay-muted)",
                              borderColor: passed ? "var(--teal-border)" : "var(--clay-border)",
                            }}
                          >
                            <span style={{ ...s.verdictIcon, color: passed ? "var(--teal)" : "var(--clay)" }}>
                              {passed ? <IconCheck /> : "✕"}
                            </span>
                            <span style={{ ...s.verdictText, color: passed ? "var(--teal)" : "var(--clay)" }}>
                              Result: {String(outcome.result.outcome)}
                            </span>
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

        <section style={s.section}>
          <h2 style={s.sectionTitle}>Connect</h2>
          <ConnectGroup label="New this week" items={connect.newConcepts.map((c) => c.conceptId)} />
          <ConnectGroup
            label="Still-weak connections to new material"
            items={connect.weakConnections.map((c) => `${c.sourceConceptId} → ${c.targetConceptId}`)}
          />
          <ConnectGroup
            label="Concepts worth connecting to the rest of the course"
            items={connect.lowConnectivityConcepts.map((c) => c.conceptId)}
          />
          <ConnectGroup
            label="Commonly confused pairs"
            items={connect.confusedPairs.map((c) => `${c.conceptAId} vs ${c.conceptBId}`)}
          />
        </section>
      </div>
    </div>
  );
}

function ConnectGroup({ label, items }: { label: string; items: string[] }) {
  return (
    <div style={s.connectGroup}>
      <span style={s.connectLabel}>{label}</span>
      {items.length === 0 ? (
        <p style={s.notice}>None this week.</p>
      ) : (
        <ul style={s.connectList}>
          {items.map((item, i) => (
            <li key={i} style={s.connectItem}>
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { height: "100%", overflowY: "auto", background: "var(--bg)", padding: "36px 40px", display: "flex", justifyContent: "center" },
  inner: { width: "100%", maxWidth: 640, display: "flex", flexDirection: "column", gap: 40 },
  section: { display: "flex", flexDirection: "column", gap: 16 },
  sectionTitle: { margin: 0, fontSize: 18, fontWeight: 500, letterSpacing: "-0.02em", color: "var(--text-primary)" },
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
  verdictIcon: { display: "flex", flexShrink: 0 },
  verdictText: { fontSize: 13.5, fontWeight: 500, letterSpacing: "-0.01em" },
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
  connectGroup: { display: "flex", flexDirection: "column", gap: 6, marginTop: 4 },
  connectLabel: { fontSize: 10.5, fontWeight: 500, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-tertiary)" },
  connectList: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 },
  connectItem: { fontSize: 13.5, color: "var(--text-secondary)" },
};
