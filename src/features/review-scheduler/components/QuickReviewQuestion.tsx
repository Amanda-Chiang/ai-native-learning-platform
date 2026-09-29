"use client";

import Link from "next/link";
import type { SessionItem } from "@/features/review-scheduler/daily-session.ts";
import { type AnswerOutcome, type ItemStatus, isPassedOutcome, progressPercent } from "@/features/review-scheduler/quick-review-state.ts";
import { StructuredAnswerForm } from "@/features/review-scheduler/components/StructuredAnswerForm.tsx";
import { MultipleChoiceForm } from "@/features/review-scheduler/components/MultipleChoiceForm.tsx";
import { IconCheck, IconArrow } from "@/components/icons.tsx";

/**
 * One question of the quick-review flow (Orca Phase 4). Stateless by
 * design: the session state machine (QuickReviewSession) owns the
 * index, the results and the skip set, and every rule about them
 * lives in quick-review-state.ts where it is unit-tested. This file
 * renders and reports events, nothing more.
 */
export function QuickReviewQuestion({
  item,
  index,
  total,
  addressedCount,
  status,
  outcome,
  pending,
  backHref,
  onAnswerText,
  onAnswerStructured,
  onAnswerMultipleChoice,
  onSkip,
  onBack,
  onNext,
}: {
  item: SessionItem;
  index: number;
  total: number;
  addressedCount: number;
  status: ItemStatus;
  outcome: AnswerOutcome | undefined;
  pending: boolean;
  backHref: string;
  onAnswerText: (response: string) => void;
  onAnswerStructured: (claimFields: Record<string, unknown>) => void;
  onAnswerMultipleChoice: (selectedIndex: number) => void;
  onSkip: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const percent = progressPercent(addressedCount, total);
  const passed = outcome && outcome.error === null && isPassedOutcome(outcome.result);
  const options = (item.rubric.options as string[] | undefined) ?? [];
  const isAnswered = status === "answered";

  return (
    <div style={s.page}>
      <div style={s.inner}>
        <header style={s.header}>
          {/* Navigation back to the course, not a dialog dismissal --
              and on mobile, where AppShell hides the bottom nav for
              this route, the only way out. Leaving costs nothing:
              every answer already committed its own evidence. */}
          {index === 0 ? (
            <Link href={backHref} style={s.backBtn} aria-label="Back to course">
              ‹
            </Link>
          ) : (
            <button type="button" onClick={onBack} style={s.backBtn} aria-label="Previous question">
              ‹
            </button>
          )}
          <div style={s.progressTrack}>
            <div style={{ ...s.progressFill, width: `${percent}%` }} />
          </div>
          <span style={s.progressLabel}>{percent}%</span>
        </header>

        <p style={s.questionText}>{item.questionText}</p>
        <ul style={s.reasonList}>
          {item.reasons.map((reason, i) => (
            <li key={i} style={s.reason}>
              {reason}
            </li>
          ))}
        </ul>

        {!isAnswered &&
          (item.checkerDomain ? (
            <StructuredAnswerForm checkerDomain={item.checkerDomain} onSubmit={onAnswerStructured} pending={pending} />
          ) : item.responseModality === "multiple_choice" ? (
            <MultipleChoiceForm options={options} onSubmit={onAnswerMultipleChoice} pending={pending} />
          ) : item.responseModality === "text" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const response = (new FormData(e.currentTarget).get("response") as string | null) ?? "";
                if (response.trim().length === 0) return;
                onAnswerText(response);
              }}
              style={s.answerForm}
            >
              <textarea name="response" rows={4} style={s.textarea} placeholder="Write your answer…" />
              <button type="submit" disabled={pending} style={s.submitBtn}>
                Submit <IconArrow />
              </button>
            </form>
          ) : (
            <p style={s.notice}>This question type isn&apos;t answerable here yet.</p>
          ))}

        {/* A real submission error (auth failure, or a
            did_not_complete grading failure) must read as an error,
            never as a plausible-looking grading outcome -- and it
            leaves the question answerable, because nothing was
            committed. */}
        {outcome?.error ? <p style={s.errorText}>{outcome.error}</p> : null}

        {outcome && outcome.error === null && (
          <div
            style={{
              ...s.verdict,
              background: passed ? "var(--status-success-muted)" : "var(--status-danger-muted)",
              border: `1px solid ${passed ? "var(--status-success-border)" : "var(--status-danger-border)"}`,
            }}
          >
            <div style={s.verdictRow}>
              <span style={{ ...s.verdictIcon, color: passed ? "var(--status-success)" : "var(--status-danger)" }}>
                {passed ? <IconCheck /> : "✕"}
              </span>
              <span style={{ ...s.verdictText, color: passed ? "var(--status-success)" : "var(--status-danger)" }}>
                Result: {String(outcome.result.outcome)}
              </span>
            </div>
            {/* Don't just say "incorrect" -- show what the right
                answer was, so a wrong guess is a learning moment. */}
            {item.responseModality === "multiple_choice" && !passed && typeof outcome.result.correctOptionIndex === "number" && (
              <span style={s.correctAnswerText}>Correct answer: {options[outcome.result.correctOptionIndex as number] ?? "(unavailable)"}</span>
            )}
          </div>
        )}

        <footer style={s.footer}>
          {/* An unanswered question offers only Skip -- Next would be a
              third, unaccounted-for way to leave a question neither
              answered nor recorded as skipped. Skip advances (and on
              the last question, still opens the skip-confirmation
              dialog) exactly as the forward button used to. Once
              answered, there is nothing left to skip, so only the
              forward button remains. */}
          {!isAnswered ? (
            <button type="button" onClick={onSkip} style={{ ...s.skipBtn, marginLeft: "auto" }}>
              Skip
            </button>
          ) : (
            <button type="button" onClick={onNext} style={s.nextBtn}>
              {index === total - 1 ? "Finish" : "Next"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { height: "100%", overflowY: "auto", background: "var(--bg)", padding: "36px 40px", display: "flex", justifyContent: "center" },
  inner: { width: "100%", maxWidth: 640, display: "flex", flexDirection: "column", gap: 20 },
  header: { display: "flex", alignItems: "center", gap: 12 },
  backBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    flexShrink: 0,
    padding: 0,
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-secondary)",
    fontSize: 18,
    lineHeight: 1,
    textDecoration: "none",
    cursor: "pointer",
  },
  progressTrack: { flex: 1, height: 10, borderRadius: 999, background: "var(--border)", overflow: "hidden" },
  progressFill: { height: "100%", background: "var(--accent)", borderRadius: 999, transition: "width 0.2s" },
  progressLabel: { fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--text-secondary)", flexShrink: 0 },
  questionText: { margin: 0, fontSize: 18, fontWeight: 450, color: "var(--text-primary)", lineHeight: 1.6, letterSpacing: "-0.01em" },
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
    background: "var(--accent)",
    color: "var(--accent-fg)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    fontSize: 13.5,
    fontWeight: 500,
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
  },
  notice: { margin: 0, fontSize: 13.5, color: "var(--text-tertiary)" },
  errorText: { margin: 0, fontSize: 12.5, color: "var(--status-danger)" },
  verdict: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, padding: "10px 14px", borderRadius: "var(--radius-sm)" },
  verdictRow: { display: "flex", alignItems: "center", gap: 9 },
  verdictIcon: { display: "flex", flexShrink: 0 },
  verdictText: { fontSize: 13.5, fontWeight: 500, letterSpacing: "-0.01em" },
  correctAnswerText: { fontSize: 13, color: "var(--text-secondary)" },
  footer: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", paddingTop: 8 },
  skipBtn: {
    padding: "9px 16px",
    background: "transparent",
    color: "var(--text-secondary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    fontSize: 13.5,
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
  },
  nextBtn: {
    marginLeft: "auto",
    padding: "9px 20px",
    background: "var(--accent)",
    color: "var(--accent-fg)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    fontSize: 13.5,
    fontWeight: 500,
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
  },
};
