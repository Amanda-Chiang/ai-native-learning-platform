import { listCourses } from "@/features/courses/actions.ts";
import { CoursePicker } from "@/features/tutor-agent/components/CoursePicker.tsx";

export default async function ChatPage() {
  const courses = await listCourses();

  return (
    <div style={s.page}>
      <div style={s.inner}>
        <h1 style={s.heading}>What would you like to learn today?</h1>
        <CoursePicker courses={courses} />
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    height: "100%",
    overflowY: "auto",
    background: "var(--bg)",
    padding: "36px 40px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  inner: { width: "100%", maxWidth: 560, display: "flex", flexDirection: "column", gap: 24, alignItems: "center" },
  heading: {
    margin: 0,
    fontSize: 24,
    fontWeight: 500,
    letterSpacing: "-0.03em",
    color: "var(--text-primary)",
    textAlign: "center",
  },
};
