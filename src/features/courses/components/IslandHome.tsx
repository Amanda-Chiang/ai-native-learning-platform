import Link from "next/link";
import { createCourse } from "@/features/courses/actions.ts";
import { CreateCourseModal } from "@/features/courses/components/CreateCourseModal.tsx";
import { IslandCanvas } from "@/features/courses/components/IslandCanvas.tsx";
import { HomeReviewRail } from "@/features/courses/components/HomeReviewRail.tsx";
import { orderByCreatedAt, type HomeOverview } from "@/features/courses/home-summary.ts";

export function IslandHome({ overview }: { overview: HomeOverview }) {
  // Distinct from "signed in, zero courses" below: a signed-out
  // visitor cannot create a course (createCourse rejects with no
  // session), so this state points at sign-in instead of offering a
  // create button that would fail on submit.
  if (overview.kind === "signed-out") {
    return (
      <div style={s.page}>
        <div style={s.centered}>
          <h1 style={s.heading}>Welcome to Orca.</h1>
          <p style={s.quiet}>Sign in to see your courses.</p>
          <Link href="/sign-in" style={s.signInLink}>
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  // A failed course list must never render as "no courses yet": that
  // would tell a student with twelve courses they have none.
  if (overview.kind === "courses-unavailable") {
    return (
      <div style={s.page}>
        <div style={s.centered}>
          <h1 style={s.heading}>Welcome to Orca.</h1>
          <p style={s.failed}>Your courses couldn&apos;t be loaded: {overview.reason}</p>
        </div>
      </div>
    );
  }

  if (overview.courses.length === 0) {
    return (
      <div style={s.page}>
        <div style={s.centered}>
          <h1 style={s.heading}>Welcome to Orca.</h1>
          <p style={s.quiet}>Add a class to get started.</p>
          <CreateCourseModal createCourse={createCourse} />
        </div>
      </div>
    );
  }

  // The canvas and the rail deliberately render the SAME set of
  // courses in DIFFERENT orders. `overview.courses` is due-date order
  // (home-overview.ts's `orderSummaries`) -- right for the rail, wrong
  // for the canvas: island-layout.ts derives each island's grid cell
  // from array ordinal, so feeding it due-date order would relocate a
  // course's island every time its due date changes. `orderByCreatedAt`
  // gives the canvas the one ordinal that never changes after a course
  // is created.
  const canvasCourses = orderByCreatedAt(overview.courses);

  return (
    <div style={s.page}>
      <div style={s.inner}>
        <div style={s.main}>
          <div style={s.header}>
            <h1 style={s.heading}>Welcome back.</h1>
            <CreateCourseModal createCourse={createCourse} />
          </div>
          <IslandCanvas courses={canvasCourses} />
        </div>
        <HomeReviewRail courses={overview.courses} exams={overview.exams} />
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { height: "100%", background: "var(--bg)", padding: "36px 40px", display: "flex", justifyContent: "center" },
  inner: { width: "100%", maxWidth: 1000, display: "flex", gap: 32, alignItems: "stretch", minHeight: 0 },
  main: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 20, overflowY: "auto" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 },
  centered: { margin: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 },
  heading: { margin: 0, fontSize: 24, fontWeight: 500, letterSpacing: "-0.03em", color: "var(--text-primary)" },
  quiet: { margin: 0, fontSize: 13.5, color: "var(--text-secondary)" },
  failed: { margin: 0, fontSize: 13.5, color: "var(--status-warning)" },
  signInLink: { fontSize: 13.5, fontWeight: 500, color: "var(--accent)", textDecoration: "none" },
};
