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
 */
export function HomeReviewRail({
  courses,
  exams,
}: {
  courses: CourseReviewSummary[];
  exams: ExamSection;
}) {
  return (
    <aside style={s.rail}>
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
  rail: {
    width: 280,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    maxHeight: "100%",
    minHeight: 0,
  },
  // min-height: 0 is what lets this shrink inside the flex column so
  // the exam section below stays visible instead of being pushed off.
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
