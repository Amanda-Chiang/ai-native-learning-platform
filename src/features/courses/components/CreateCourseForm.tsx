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
    >
      <label>
        Course name
        <input type="text" name="name" required placeholder="e.g. Data Structures & Algorithms" />
      </label>
      <button type="submit" disabled={pending}>
        Create course
      </button>
      {error && <p style={{ color: "#dc2626" }}>{error}</p>}
    </form>
  );
}
