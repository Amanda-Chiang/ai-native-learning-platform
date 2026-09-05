"use client";

import Link from "next/link";
import type { TodayOverview } from "@/features/courses/today.ts";
import { DEFAULT_MINUTES_PER_QUESTION } from "@/features/review-scheduler/daily-session.ts";
import { IconArrow } from "@/components/icons.tsx";

function urgencyColor(daysLeft: number) {
  if (daysLeft <= 6) return "var(--clay)";
  if (daysLeft <= 20) return "var(--urgent-amber)";
  return "var(--teal)";
}

export function TodayDashboard({ overview }: { overview: TodayOverview }) {
  const { nearestExam, upcomingExams, dailySession, hasCourses } = overview;

  if (!hasCourses) {
    return (
      <div style={s.emptyPage}>
        <div style={s.emptyBlock}>
          <h1 style={s.greetingHeading}>Welcome to Luminary.</h1>
          <p style={s.greetingSubtext}>Create your first course to start building a knowledge graph.</p>
          <Link href="/courses" style={s.startButton}>
            Go to Courses <IconArrow />
          </Link>
        </div>
      </div>
    );
  }

  if (!nearestExam) {
    return (
      <div style={s.emptyPage}>
        <div style={s.emptyBlock}>
          <h1 style={s.greetingHeading}>Welcome back.</h1>
          <p style={s.greetingSubtext}>
            No course has an exam configured yet -- set one up on a course&apos;s Exam plan tab to see your daily
            review here.
          </p>
          <Link href="/courses" style={s.startButton}>
            Go to Courses <IconArrow />
          </Link>
        </div>
      </div>
    );
  }

  const items = dailySession && "items" in dailySession ? dailySession.items : [];
  const questionCount = items.length;
  const estimatedMinutes = questionCount * DEFAULT_MINUTES_PER_QUESTION;

  return (
    <div style={s.layout}>
      <main style={s.center}>
        <div style={s.centerInner}>
          <div style={s.greeting}>
            <h1 style={s.greetingHeading}>Welcome back.</h1>
            <p style={s.greetingSubtext}>Ready for your daily review?</p>
          </div>

          <p style={s.summary}>
            Your <strong>{nearestExam.courseName}</strong> exam is{" "}
            <span style={{ color: urgencyColor(nearestExam.daysLeft), fontWeight: 500 }}>
              in {nearestExam.daysLeft} day{nearestExam.daysLeft === 1 ? "" : "s"}
            </span>
            .
          </p>

          {dailySession?.status === "no_content" && <p style={s.summary}>{dailySession.message}</p>}
          {dailySession?.status === "budget_too_small" && <p style={s.summary}>{dailySession.message}</p>}

          {questionCount > 0 && (
            <div style={s.conceptsPreview}>
              <div style={s.conceptsLabel}>In this session</div>
              <ul style={s.conceptsList}>
                {items.map((item) => (
                  <li key={item.conceptId} style={s.conceptItem}>
                    <span style={s.conceptDot} />
                    <span style={s.conceptName}>{item.questionText}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {questionCount > 0 && (
            <div style={s.actionBlock}>
              <div style={s.sessionMeta}>
                <span style={s.metaChip}>
                  <span style={s.metaValue}>{questionCount}</span> questions
                </span>
                <span style={s.metaDot}>·</span>
                <span style={s.metaChip}>
                  ~<span style={s.metaValue}>{estimatedMinutes} min</span>
                </span>
              </div>
              <Link href={`/courses/${nearestExam.courseId}/study`} style={s.startButton}>
                Start daily review <IconArrow />
              </Link>
            </div>
          )}
        </div>
      </main>

      <aside style={s.sidebar}>
        <div style={s.sidebarHeader}>
          <span style={s.sidebarTitle}>Upcoming</span>
        </div>
        <div style={s.examList}>
          {upcomingExams.map((exam) => (
            <Link key={exam.courseId} href={`/courses/${exam.courseId}/exam-plan`} style={s.examCardLink}>
              <div
                style={{
                  ...s.examCard,
                  borderLeftWidth: "2px",
                  borderLeftStyle: "solid",
                  borderLeftColor: urgencyColor(exam.daysLeft),
                }}
              >
                <div style={s.examHeader}>
                  <span style={s.examCourse}>{exam.courseName}</span>
                  <span style={{ ...s.examDays, color: urgencyColor(exam.daysLeft) }}>{exam.daysLeft}d</span>
                </div>
                <div style={s.examDate}>
                  {new Date(exam.examDate).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </div>
              </div>
            </Link>
          ))}
        </div>
        <div style={s.sidebarFooter}>
          <span style={s.footerNote}>Exam proximity shapes your daily review priority.</span>
        </div>
      </aside>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  emptyPage: {
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 48,
  },
  emptyBlock: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    maxWidth: 420,
    textAlign: "center",
    alignItems: "center",
  },
  layout: {
    display: "flex",
    height: "100%",
    overflow: "hidden",
  },
  center: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "48px 56px",
  },
  centerInner: {
    width: "100%",
    maxWidth: 520,
    display: "flex",
    flexDirection: "column",
    gap: 32,
    marginBottom: "4vh",
  },
  greeting: { display: "flex", flexDirection: "column", gap: 4 },
  greetingHeading: {
    margin: 0,
    fontSize: 30,
    fontWeight: 500,
    letterSpacing: "-0.035em",
    color: "var(--text-primary)",
    lineHeight: 1.15,
  },
  greetingSubtext: {
    margin: 0,
    fontSize: 16,
    color: "var(--text-secondary)",
    fontWeight: 400,
    letterSpacing: "-0.01em",
  },
  summary: {
    margin: 0,
    fontSize: 14,
    color: "var(--text-secondary)",
    lineHeight: 1.65,
    letterSpacing: "-0.008em",
  },
  conceptsPreview: { display: "flex", flexDirection: "column", gap: 12 },
  conceptsLabel: {
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--text-tertiary)",
  },
  conceptsList: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 7 },
  conceptItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    fontSize: 13.5,
    color: "var(--text-secondary)",
    letterSpacing: "-0.005em",
  },
  conceptDot: {
    width: 5,
    height: 5,
    borderRadius: "50%",
    background: "var(--clay)",
    opacity: 0.45,
    flexShrink: 0,
    marginTop: 6,
  },
  conceptName: { flex: 1 },
  actionBlock: { display: "flex", flexDirection: "column", gap: 14, paddingTop: 4, borderTop: "1px solid var(--border)" },
  sessionMeta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--text-tertiary)",
  },
  metaChip: { letterSpacing: "0.01em" },
  metaValue: { color: "var(--text-secondary)", fontWeight: 500 },
  metaDot: { color: "var(--border-strong)" },
  startButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "13px 22px",
    background: "var(--clay)",
    color: "var(--clay-fg)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    fontSize: 14,
    fontWeight: 500,
    fontFamily: "var(--font-sans)",
    letterSpacing: "-0.01em",
    cursor: "pointer",
    boxShadow: "0 1px 3px rgba(201,79,83,0.3), 0 0 0 1px rgba(201,79,83,0.12)",
    alignSelf: "flex-start",
  },
  sidebar: {
    width: "var(--right-w)",
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    height: "100%",
    padding: "28px 20px 24px",
    overflowY: "auto",
    gap: 16,
  },
  sidebarHeader: { padding: 0 },
  sidebarTitle: {
    fontSize: 10.5,
    fontWeight: 500,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--text-tertiary)",
  },
  examList: { display: "flex", flexDirection: "column", gap: 8 },
  examCardLink: { display: "block" },
  examCard: {
    padding: "11px 13px",
    paddingLeft: 11,
    borderRadius: "var(--radius-md)",
    background: "rgba(255,255,255,0.72)",
    borderTop: "1px solid var(--border)",
    borderRight: "1px solid var(--border)",
    borderBottom: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    gap: 3,
  },
  examHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  examCourse: { fontSize: 12.5, fontWeight: 500, color: "var(--text-primary)", letterSpacing: "-0.01em", lineHeight: 1.3 },
  examDays: { fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500, flexShrink: 0, marginTop: 1 },
  examDate: { fontSize: 11.5, color: "var(--text-tertiary)", letterSpacing: "-0.005em" },
  sidebarFooter: { marginTop: "auto", padding: 0 },
  footerNote: { fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.5, letterSpacing: "-0.005em", opacity: 0.8 },
};
