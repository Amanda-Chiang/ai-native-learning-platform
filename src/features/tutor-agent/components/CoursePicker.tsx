"use client";

import { useRouter } from "next/navigation";
import type { Course } from "@/features/courses/actions.ts";

/**
 * Chat needs a course before it can start.
 *
 * `tutor_conversations.course_id` is a NOT NULL foreign key, and that is
 * deliberate rather than incidental: every tutor answer is grounded in
 * one course's confirmed material, so a course-less conversation has no
 * grounding to check itself against. Rather than relax the column, this
 * asks which course first, then hands off to the existing per-course
 * tutor route unchanged.
 */
export function CoursePicker({ courses }: { courses: Course[] }) {
  const router = useRouter();

  if (courses.length === 0) {
    return (
      <p style={s.empty}>
        You need a course first — Orca grounds every answer in your own material.
      </p>
    );
  }

  return (
    <div style={s.wrap}>
      <p style={s.prompt}>Which course?</p>
      <div style={s.options}>
        {courses.map((course) => (
          <button
            key={course.id}
            type="button"
            onClick={() => router.push(`/courses/${course.id}/tutor`)}
            style={s.option}
          >
            {course.name}
          </button>
        ))}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 10, alignItems: "center" },
  prompt: { margin: 0, fontSize: 13.5, color: "var(--text-secondary)" },
  empty: { margin: 0, fontSize: 13.5, color: "var(--text-secondary)", textAlign: "center", lineHeight: 1.55 },
  options: { display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  option: {
    padding: "8px 14px",
    background: "var(--surface)",
    color: "var(--text-primary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    fontSize: 13.5,
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
  },
};
