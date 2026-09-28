"use client";

import { useState } from "react";
import type { Course } from "@/features/courses/actions.ts";
import { CreateCourseForm } from "@/features/courses/components/CreateCourseForm.tsx";
import { IconPlus, IconClose } from "@/components/icons.tsx";

/**
 * Wraps the existing CreateCourseForm in a modal so the course list
 * isn't dominated by a form that's used once per course. The form and
 * its server action are untouched -- this only changes where it lives.
 */
export function CreateCourseModal({
  createCourse,
}: {
  // Exactly the prop type CreateCourseForm already declares -- this
  // component only forwards it, so the two must not drift.
  createCourse: (name: string) => Promise<{ course: Course } | { error: string }>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={s.trigger}>
        <IconPlus />
        Add class
      </button>

      {open && (
        <div style={s.backdrop} role="dialog" aria-modal="true" aria-label="Add a class">
          <div style={s.panel}>
            <div style={s.header}>
              <h2 style={s.title}>Class name</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" style={s.close}>
                <IconClose />
              </button>
            </div>
            <CreateCourseForm createCourse={createCourse} />
          </div>
        </div>
      )}
    </>
  );
}

const s: Record<string, React.CSSProperties> = {
  trigger: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 14px",
    background: "var(--accent)",
    color: "var(--accent-fg)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    fontSize: 13.5,
    fontFamily: "var(--font-sans)",
    fontWeight: 500,
    cursor: "pointer",
  },
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgb(0 0 0 / 0.35)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    zIndex: 50,
  },
  panel: {
    width: "100%",
    maxWidth: 420,
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  title: { margin: 0, fontSize: 16, fontWeight: 500, letterSpacing: "-0.02em", color: "var(--text-primary)" },
  close: {
    display: "flex",
    alignItems: "center",
    background: "transparent",
    border: "none",
    color: "var(--text-tertiary)",
    cursor: "pointer",
    padding: 4,
  },
};
