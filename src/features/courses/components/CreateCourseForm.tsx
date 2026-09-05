"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Course } from "@/features/courses/actions.ts";

/**
 * Found live (a course creation that silently did nothing on failure,
 * and never took the student anywhere on success): the original inline
 * server action in courses/page.tsx discarded createCourse's real
 * {course}|{error} result entirely. This client component surfaces a
 * real error, and on success navigates straight to the new course --
 * matching the error-display convention every other form in this app
 * already uses (TutorChat, StudySession, ExamPlanner, ReviewQueue).
 */
export function CreateCourseForm({
  createCourse,
}: {
  createCourse: (name: string) => Promise<{ course: Course } | { error: string }>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const name = (new FormData(e.currentTarget).get("name") as string | null) ?? "";
        setPending(true);
        const outcome = await createCourse(name);
        setPending(false);
        if ("error" in outcome) {
          setError(outcome.error);
          return;
        }
        setError(null);
        router.push(`/courses/${outcome.course.id}`);
      }}
      style={s.form}
    >
      <div style={s.row}>
        <input
          type="text"
          name="name"
          required
          placeholder="Course name, e.g. Data Structures & Algorithms"
          style={s.input}
          disabled={pending}
        />
        <button type="submit" disabled={pending} style={{ ...s.submit, opacity: pending ? 0.6 : 1 }}>
          {pending ? "Creating…" : "Create course"}
        </button>
      </div>
      {error && <p style={s.error}>{error}</p>}
    </form>
  );
}

const s: Record<string, React.CSSProperties> = {
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: 16,
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
  },
  row: {
    display: "flex",
    gap: 8,
  },
  input: {
    flex: 1,
    padding: "9px 12px",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    fontSize: 14,
    fontFamily: "var(--font-sans)",
    color: "var(--text-primary)",
    background: "var(--bg)",
    outline: "none",
  },
  submit: {
    padding: "9px 16px",
    background: "var(--clay)",
    color: "var(--clay-fg)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    fontSize: 13.5,
    fontWeight: 500,
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  error: {
    margin: 0,
    fontSize: 12.5,
    color: "var(--clay)",
  },
};
