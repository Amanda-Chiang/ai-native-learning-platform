import Link from "next/link";
import { createCourse, listCourses } from "@/features/courses/actions.ts";
import { CreateCourseForm } from "@/features/courses/components/CreateCourseForm.tsx";
import { IconChevronRight } from "@/components/icons.tsx";

export default async function CoursesPage() {
  const courses = await listCourses();

  return (
    <div style={s.page}>
      <div style={s.inner}>
        <div style={s.pageHeader}>
          <div>
            <h1 style={s.pageTitle}>Courses</h1>
            <p style={s.pageSubtitle}>
              {courses.length} {courses.length === 1 ? "course" : "courses"}
            </p>
          </div>
        </div>

        <CreateCourseForm createCourse={createCourse} />

        {courses.length > 0 && (
          <div style={s.courseList}>
            {courses.map((course) => (
              <Link key={course.id} href={`/courses/${course.id}`} style={s.courseCard}>
                <div style={s.courseMain}>
                  <span style={s.courseName}>{course.name}</span>
                  <span style={s.chevron}>
                    <IconChevronRight />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    height: "100%",
    overflowY: "auto",
    background: "var(--bg)",
    padding: "48px 56px",
    display: "flex",
    justifyContent: "center",
  },
  inner: {
    width: "100%",
    maxWidth: 620,
    display: "flex",
    flexDirection: "column",
    gap: 28,
  },
  pageHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  pageTitle: {
    margin: 0,
    fontSize: 26,
    fontWeight: 500,
    letterSpacing: "-0.03em",
    color: "var(--text-primary)",
    lineHeight: 1.2,
  },
  pageSubtitle: {
    margin: "4px 0 0",
    fontSize: 13.5,
    color: "var(--text-tertiary)",
    letterSpacing: "-0.005em",
  },
  courseList: {
    display: "flex",
    flexDirection: "column",
    gap: 1,
    borderRadius: "var(--radius-md)",
    overflow: "hidden",
    border: "1px solid var(--border)",
  },
  courseCard: {
    display: "block",
    padding: "18px 20px",
    background: "var(--surface)",
    borderBottom: "1px solid var(--border)",
  },
  courseMain: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  courseName: {
    fontSize: 14.5,
    fontWeight: 500,
    color: "var(--text-primary)",
    letterSpacing: "-0.015em",
    lineHeight: 1.3,
  },
  chevron: {
    color: "var(--text-tertiary)",
    display: "flex",
    alignItems: "center",
    opacity: 0.5,
    flexShrink: 0,
  },
};
