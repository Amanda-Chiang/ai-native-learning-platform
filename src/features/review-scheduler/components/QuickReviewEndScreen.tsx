"use client";

import Link from "next/link";
import type { SessionItem } from "@/features/review-scheduler/daily-session.ts";
import type { NextDueCourse } from "@/features/courses/next-due-course.ts";
import { deepReviewStubLabel } from "@/features/review-scheduler/quick-review-state.ts";

/**
 * The end of a quick-review session (Orca Phase 4).
 *
 * The deep-review offer ships DISABLED and says so in its own copy.
 * Deep review is Phase 9 and on hold, so there is nothing to link to;
 * a control that silently did nothing would be exactly the kind of
 * plausible-looking stand-in this project forbids, while a labeled
 * dead control is honest about the state of the product.
 *
 * Its wording comes from the real model. This codebase has no numeric
 * levels (the wireframe's "level 4"); mastery is the band enum, and
 * deepReviewStubLabel names the band above the session's weakest
 * concept.
 */
export function QuickReviewEndScreen({
  items,
  correct,
  answered,
  skipped,
  courseId,
  nextDueCourse,
}: {
  items: SessionItem[];
  correct: number;
  answered: number;
  skipped: number;
  courseId: string;
  nextDueCourse: NextDueCourse;
}) {
  const stubLabel = deepReviewStubLabel(items.map((item) => item.masteryState));

  return (
    <div style={s.page}>
      <div style={s.card}>
        <header style={s.header}>
          {nextDueCourse.kind === "found" ? (
            <Link href={`/courses/${nextDueCourse.courseId}/study`} style={s.nextTaskLink}>
              Go to next task
            </Link>
          ) : (
            // Two different disabled states on purpose: "nothing else
            // is due" is a calm fact, while a failed lookup is a thing
            // that went wrong. Rendering them identically would hide a
            // real failure behind a reassuring sentence.
            <span style={s.nextTaskDisabled} aria-disabled="true">
              {nextDueCourse.kind === "none" ? "Nothing else due today" : `Couldn't check other courses — ${nextDueCourse.reason}`}
            </span>
          )}
        </header>

        <h1 style={s.headline}>Keep going. Keep growing.</h1>

        {stubLabel && (
          <button type="button" disabled style={s.deepReviewStub}>
            {stubLabel} — coming soon
          </button>
        )}

        <p style={s.score}>
          {correct}/{answered} correct
        </p>
        {skipped > 0 && <p style={s.skipped}>{skipped} skipped — still due for next time</p>}

        <section style={s.coveredBlock}>
          <h2 style={s.coveredHeading}>Concepts covered in this review</h2>
          <ul style={s.coveredList}>
            {items.map((item) => (
              <li key={item.conceptId} style={s.coveredItem}>
                {item.conceptName}
              </li>
            ))}
          </ul>
        </section>

        <footer style={s.footer}>
          <Link href={`/courses/${courseId}`} style={s.doneBtn}>
            Done
          </Link>
        </footer>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { height: "100%", overflowY: "auto", background: "var(--bg)", padding: "36px 40px", display: "flex", justifyContent: "center", alignItems: "flex-start" },
  card: {
    width: "100%",
    maxWidth: 560,
    padding: 28,
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  header: { display: "flex", justifyContent: "flex-end" },
  nextTaskLink: { fontSize: 13, color: "var(--accent)", textDecoration: "none", fontWeight: 500 },
  nextTaskDisabled: { fontSize: 13, color: "var(--text-tertiary)" },
  headline: { margin: 0, fontSize: 24, fontWeight: 500, letterSpacing: "-0.025em", color: "var(--text-primary)" },
  deepReviewStub: {
    alignSelf: "flex-start",
    padding: "8px 14px",
    background: "transparent",
    color: "var(--text-tertiary)",
    border: "1px dashed var(--border)",
    borderRadius: "var(--radius-sm)",
    fontSize: 13,
    fontFamily: "var(--font-sans)",
    cursor: "not-allowed",
  },
  score: { margin: 0, fontSize: 18, fontWeight: 500, color: "var(--text-primary)", fontFamily: "var(--font-mono)" },
  skipped: { margin: 0, fontSize: 13, color: "var(--status-warning)" },
  coveredBlock: { display: "flex", flexDirection: "column", gap: 6, paddingTop: 6, borderTop: "1px solid var(--border)" },
  coveredHeading: { margin: 0, fontSize: 12.5, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" },
  coveredList: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 3 },
  coveredItem: { fontSize: 13.5, color: "var(--text-secondary)" },
  footer: { display: "flex", justifyContent: "flex-end", paddingTop: 6 },
  doneBtn: {
    padding: "9px 20px",
    background: "var(--accent)",
    color: "var(--accent-fg)",
    borderRadius: "var(--radius-sm)",
    fontSize: 13.5,
    fontWeight: 500,
    textDecoration: "none",
  },
};
