"use client";

import { useState } from "react";
import type { CourseUnit } from "@/types/domain/index.ts";

/**
 * Manual "add a unit" form (design.md) -- lets a student declare a
 * source-of-truth unit up front, so a later upload about it lands
 * there directly instead of relying on extraction to invent and later
 * merge a duplicate. Matches CreateCourseForm.tsx's exact pattern
 * (client component, own pending/error state).
 */
export function AddUnitForm({
  courseId,
  createUnit,
  onCreated,
}: {
  courseId: string;
  createUnit: (courseId: string, title: string) => Promise<{ unit: CourseUnit } | { error: string }>;
  onCreated: (unit: CourseUnit) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const title = (new FormData(e.currentTarget).get("title") as string | null) ?? "";
        setPending(true);
        const outcome = await createUnit(courseId, title);
        setPending(false);
        if ("error" in outcome) {
          setError(outcome.error);
          return;
        }
        setError(null);
        (e.currentTarget as HTMLFormElement).reset();
        onCreated(outcome.unit);
      }}
      style={s.form}
    >
      <div style={s.row}>
        <input
          type="text"
          name="title"
          required
          placeholder="Unit title, e.g. Dynamic Programming"
          style={s.input}
          disabled={pending}
        />
        <button type="submit" disabled={pending} style={{ ...s.submit, opacity: pending ? 0.6 : 1 }}>
          {pending ? "Adding…" : "Add unit"}
        </button>
      </div>
      {error && <p style={s.error}>{error}</p>}
    </form>
  );
}

const s: Record<string, React.CSSProperties> = {
  form: { display: "flex", flexDirection: "column", gap: 8 },
  row: { display: "flex", gap: 8 },
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
  error: { margin: 0, fontSize: 12.5, color: "var(--clay)" },
};
