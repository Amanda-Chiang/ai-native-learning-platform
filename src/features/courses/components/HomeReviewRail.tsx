import Link from "next/link";
import { formatCalendarDateLong } from "@/lib/format-date.ts";
import { IconPlay } from "@/components/icons.tsx";
import type { CourseReviewSummary, ExamSection } from "@/features/courses/home-summary.ts";

/**
 * The rail: every course's next review session, soonest first, with
 * the upcoming exams pinned underneath.
 *
 * The exam section sits OUTSIDE the scrolling region on purpose. A
 * student with eight courses would otherwise scroll the exam countdown
 * out of view exactly when the list is busiest, and an exam in three
 * days outranks everything else on this screen.
 *
 * `courses` is never empty here: `IslandHome` returns its own
 * "add a class" empty state before this component ever renders, so
 * there is no reachable empty-courses case to render inside the rail.
 *
 * Width and height on narrow viewports are the two properties that
 * flip between the desktop (side-by-side) and mobile (stacked) layout
 * IslandHome switches between, so they live in this injected
 * `<style>`/className pair rather than the `s.rail` inline object --
 * same split DueQueue.tsx's own `.due-queue-connect-panel` uses
 * (CONNECT_PANEL_MEDIA_QUERY there): an inline `style` value always
 * wins over a class rule, so anything a media query needs to override
 * has to be absent from the inline object, not merely overridden by a
 * "mobile" inline object swapped in from JS. This also means the rail
 * stays correct on the very first paint (no JS breakpoint hook, no
 * hydration flash) -- pure CSS, like ConceptDetailPanel's own
 * side-panel/bottom-sheet switch.
 *
 * On mobile the rail no longer sits beside `main` at the row's full
 * height -- it's now a second block stacked under it, bounded by an
 * explicit `max-height` rather than left to size itself via
 * flex-shrink. That wasn't the first thing tried: giving the rail
 * `flex: 1 1 auto` next to `main`'s matching `flex: "1 1 auto"`
 * (IslandHome.tsx) so both would shrink together, relying on each
 * side's own `min-height: auto` floor for protection, is the
 * textbook-correct flexbox technique -- but measuring it live (a real
 * Chromium render, not just reasoning about the spec) showed the rail
 * simply never shrank below its full unclamped content (its `.scroller`
 * included, all 8 rows), overflowing `main` off-screen instead of
 * sharing space with it. Nested flex-in-flex automatic-minimum
 * calculation is a known cross-engine soft spot, and chasing the
 * "correct" spec behavior further wasn't worth it for one screen (see
 * architecture-log.md's Phase 3 entry for the measurements). An
 * explicit `max-height` sidesteps that uncertainty entirely: it's a
 * hard, deterministic cap, and `.scroller`'s own `min-height: 0` +
 * `overflow-y: auto` (unchanged, the same mechanism the desktop layout
 * already relied on) still absorbs whatever doesn't fit inside it.
 *
 * 400px is that cap: both headings (18px each) + all three of the
 * fixture's exam rows (62px each) + the five 10px gaps between every
 * direct child of `.home-review-rail` come to ~273px measured live --
 * 400px leaves genuine room (~127px, more than two course rows) for
 * `.scroller` to show real content above that floor instead of
 * collapsing to a sliver, while still leaving `main` (`flex: 1 1 auto`,
 * `min-height: 256px`, IslandHome.tsx) real room for the header and at
 * least one island row on the viewport this was measured against
 * (iPhone 13, 390 wide). `page`'s own `overflowY: "auto"`
 * (`IslandHome.tsx`) is the last-resort safety valve for a shorter
 * phone or a student with more exams than this fits.
 *
 * Desktop's `flex: 0 0 auto` matches its unchanged pre-fix behavior
 * (the rail's real height there comes from `align-items: stretch` on
 * the row layout, not from flex-grow/shrink or `max-height`, so this
 * is a no-op sizing-wise -- kept explicit so the mobile override reads
 * as a real change, not an accidental omission).
 */
const RAIL_RESPONSIVE_STYLE = `
  .home-review-rail {
    width: var(--right-w);
    flex: 0 0 auto;
  }
  @media (max-width: 768px) {
    .home-review-rail {
      width: 100%;
      flex: 0 0 auto;
      max-height: 400px;
    }
  }
`;

export function HomeReviewRail({
  courses,
  exams,
}: {
  courses: CourseReviewSummary[];
  exams: ExamSection;
}) {
  return (
    <aside className="home-review-rail" style={s.rail}>
      <style>{RAIL_RESPONSIVE_STYLE}</style>
      <h2 style={s.heading}>Next review</h2>
      <div style={s.scroller}>
        {courses.map((course) => (
          <CourseRow key={course.courseId} course={course} />
        ))}
      </div>

      <h2 style={s.heading}>Upcoming exams</h2>
      {exams.kind === "failed" ? (
        <p style={s.failed}>Couldn&apos;t load exams: {exams.reason}</p>
      ) : exams.upcoming.length === 0 ? (
        <p style={s.quiet}>No exams scheduled.</p>
      ) : (
        exams.upcoming.map((exam) => (
          <Link
            key={exam.examConfigId}
            href={`/courses/${exam.courseId}/exam-plan?exam=${exam.examConfigId}`}
            style={s.examRow}
          >
            <span style={s.rowTitle}>{exam.courseName}</span>
            <span style={s.rowMeta}>
              {formatCalendarDateLong(exam.examDate)} · in {exam.daysLeft}{" "}
              {exam.daysLeft === 1 ? "day" : "days"}
            </span>
          </Link>
        ))
      )}
    </aside>
  );
}

function CourseRow({ course }: { course: CourseReviewSummary }) {
  if (course.kind === "failed") {
    return (
      <div style={s.row}>
        <div style={s.rowText}>
          <span style={s.rowTitle}>{course.courseName}</span>
          <span style={s.failed}>Couldn&apos;t load: {course.reason}</span>
        </div>
      </div>
    );
  }

  if (course.kind === "nothing-scheduled") {
    return (
      <div style={s.row}>
        <div style={s.rowText}>
          <span style={s.rowTitle}>{course.courseName}</span>
          <span style={s.quiet}>Nothing scheduled</span>
        </div>
      </div>
    );
  }

  return (
    <div style={s.row}>
      <div style={s.rowText}>
        <span style={s.rowTitle}>{course.courseName}</span>
        <span style={s.rowMeta}>
          {course.label}
          {course.dueNowCount !== null && ` · ${course.dueNowCount} due`}
        </span>
      </div>
      <Link
        href={`/courses/${course.courseId}/study`}
        aria-label={`Start review for ${course.courseName}`}
        style={s.play}
      >
        <IconPlay />
      </Link>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  // width/flex are NOT set here -- RAIL_RESPONSIVE_STYLE's
  // `.home-review-rail` class owns both so the mobile media query can
  // override them (an inline value here would always win over the
  // class rule and silently defeat the breakpoint).
  // No minHeight: 0 here, deliberately -- on mobile this is what gives
  // the rail its content-based floor (headings + exam rows) instead of
  // letting it get shrunk arbitrarily small; see RAIL_RESPONSIVE_STYLE.
  rail: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  // min-height: 0 (unlike `rail` above) is what lets THIS shrink inside
  // the flex column so the exam section below stays visible instead of
  // being pushed off -- the desktop behavior this always had, now also
  // what gives mobile's stacked rail a real floor (see
  // RAIL_RESPONSIVE_STYLE's comment: this is the one child whose
  // min-content contribution to the rail's own auto floor is 0).
  scroller: { overflowY: "auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 8 },
  heading: {
    margin: 0,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-tertiary)",
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "10px 12px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
  },
  examRow: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: "10px 12px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    textDecoration: "none",
  },
  rowText: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
  rowTitle: { fontSize: 13.5, fontWeight: 500, color: "var(--text-primary)" },
  rowMeta: { fontSize: 12, color: "var(--text-secondary)" },
  quiet: { margin: 0, fontSize: 12, color: "var(--text-tertiary)" },
  failed: { fontSize: 12, color: "var(--status-warning)" },
  play: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    flexShrink: 0,
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text-primary)",
  },
};
