"use client";

import { useState } from "react";

/**
 * The multiple_choice-modality answer form (design doc "Grading" /
 * "Where it surfaces"): 4 radio options, one submit. No textarea, no
 * JSON, matching the "answerable in your head in a few seconds" intent
 * -- the deliberate contrast with StructuredAnswerForm's typed-JSON
 * approach for the heavier checker-domain items.
 */
export function MultipleChoiceForm({
  options,
  onSubmit,
  pending,
}: {
  options: string[];
  onSubmit: (selectedIndex: number) => void;
  pending: boolean;
}) {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div style={s.form}>
      <div style={s.options}>
        {options.map((option, i) => (
          <label key={i} style={{ ...s.option, ...(selected === i ? s.optionSelected : {}) }}>
            <input
              type="radio"
              name="mcq-option"
              checked={selected === i}
              onChange={() => setSelected(i)}
              style={s.radio}
            />
            {option}
          </label>
        ))}
      </div>
      <button
        type="button"
        disabled={pending || selected === null}
        onClick={() => selected !== null && onSubmit(selected)}
        style={{ ...s.submitBtn, opacity: pending || selected === null ? 0.6 : 1 }}
      >
        Submit
      </button>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  form: { display: "flex", flexDirection: "column", gap: 10 },
  options: { display: "flex", flexDirection: "column", gap: 6 },
  option: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "9px 12px",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    fontSize: 13.5,
    color: "var(--text-primary)",
    cursor: "pointer",
  },
  // Shorthand, matching `option`'s own `border` -- not the longhand
  // `borderColor`. Mixing a shorthand base with a longhand override is
  // the exact bug already root-caused and fixed in course-shell.tsx's
  // tab underline (architecture-log.md 2026-09-11): React's inline-style
  // diffing drops the longhand key on the next render where it's no
  // longer selected, but since the shorthand `border` string is
  // unchanged, React never re-applies it either -- leaving a stale
  // border-color instead of reverting to the base one. Using the
  // shorthand here means every render sets/diffs one atomic key.
  optionSelected: { border: "1px solid var(--clay)", background: "var(--clay-muted)" },
  radio: { accentColor: "var(--clay)", cursor: "pointer" },
  submitBtn: {
    alignSelf: "flex-start",
    padding: "9px 16px",
    background: "var(--clay)",
    color: "var(--clay-fg)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    fontSize: 13.5,
    fontWeight: 500,
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
  },
};
