"use client";

import { useEffect, useRef, useState } from "react";
import type { ScopeableConcept } from "@/features/exam-planner/actions.ts";
import { IconChevronRight } from "@/components/icons.tsx";

/**
 * Multi-select dropdown for exam scope (T012's config form). Replaces a
 * raw comma-separated concept-id text field -- a student was never meant
 * to know or type a concept's uuid; this renders the real, confirmed
 * concept names for the course instead. Selection state lives in real
 * checkbox inputs (name="scopeConceptIds") so the enclosing <form>'s own
 * FormData.getAll still collects it -- no separate client-side wiring
 * needed to get the values to the submit handler.
 */
export function ConceptScopeSelect({ name, concepts }: { name: string; concepts: ScopeableConcept[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const summary =
    selected.size === 0 ? "Select concepts…" : `${selected.size} concept${selected.size === 1 ? "" : "s"} selected`;

  return (
    <div ref={rootRef} style={s.root}>
      <button type="button" onClick={() => setOpen((v) => !v)} style={s.trigger} disabled={concepts.length === 0}>
        <span style={selected.size === 0 ? s.triggerPlaceholder : s.triggerText}>{summary}</span>
        <span style={{ ...s.chevron, transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>
          <IconChevronRight />
        </span>
      </button>

      {concepts.length === 0 && (
        <p style={s.emptyNote}>No confirmed concepts yet — confirm some in Material review before scoping an exam.</p>
      )}

      {/* Always mounted, even while closed -- these are the real
          form-collected inputs (FormData.getAll(name) reads them by
          name/checked state). Unmounting them on close, as this used
          to do via `{open && ...}`, drops every selection from the
          form the instant the panel closes -- exactly the state right
          before a real submit. Only `hidden` toggles visibility. */}
      {concepts.length > 0 && (
        <div style={s.panel} hidden={!open}>
          {concepts.map((concept) => (
            <label key={concept.id} style={s.option}>
              <input
                type="checkbox"
                name={name}
                value={concept.id}
                checked={selected.has(concept.id)}
                onChange={() => toggle(concept.id)}
                style={s.checkbox}
              />
              {concept.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: { position: "relative" },
  trigger: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 10px",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    background: "var(--surface)",
    fontSize: 13.5,
    fontFamily: "var(--font-sans)",
    color: "var(--text-primary)",
    cursor: "pointer",
    boxSizing: "border-box",
  },
  triggerText: { color: "var(--text-primary)" },
  triggerPlaceholder: { color: "var(--text-tertiary)" },
  chevron: { display: "flex", color: "var(--text-tertiary)", transition: "transform 0.1s" },
  panel: {
    position: "absolute",
    top: "calc(100% + 4px)",
    left: 0,
    right: 0,
    maxHeight: 220,
    overflowY: "auto",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
    zIndex: 10,
    padding: 4,
  },
  option: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 8px",
    fontSize: 13.5,
    color: "var(--text-primary)",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
  },
  checkbox: { accentColor: "var(--clay)", cursor: "pointer" },
  emptyNote: { margin: "6px 0 0", fontSize: 12.5, color: "var(--text-tertiary)" },
};
