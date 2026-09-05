"use client";

import { useState } from "react";
import {
  confirmCandidate,
  rejectCandidate,
  editCandidate,
  type ReviewQueueItem,
} from "@/features/course-graph-ingestion/actions.ts";
import { STANDARD_RELATION_TYPES } from "@/types/domain/index.ts";

/**
 * Reviewer UI for User Story 3: lists proposed concepts/edges, shows
 * reconciliation reasoning and flags when present, and lets a reviewer
 * confirm/edit/reject each one (contracts/ingestion-actions.md).
 *
 * A candidate with an "uncertain" reconciliation decision is visibly
 * distinguished from one with none at all -- FR-005 requires an
 * uncertain case never look the same as ordinary, unflagged confidence.
 */
export function ReviewQueue({ items: initialItems }: { items: ReviewQueueItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorById, setErrorById] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);

  function itemId(item: ReviewQueueItem): string {
    return item.kind === "concept" ? item.concept.id : item.edge.id;
  }

  async function handleConfirm(item: ReviewQueueItem) {
    const id = itemId(item);
    setPendingId(id);
    const { error } = await confirmCandidate(item.kind, id);
    setPendingId(null);
    if (error) {
      setErrorById((e) => ({ ...e, [id]: error }));
      return;
    }
    setItems((current) => current.filter((i) => itemId(i) !== id));
  }

  async function handleReject(item: ReviewQueueItem) {
    const id = itemId(item);
    setPendingId(id);
    const { error } = await rejectCandidate(item.kind, id);
    setPendingId(null);
    if (error) {
      setErrorById((e) => ({ ...e, [id]: error }));
      return;
    }
    setItems((current) => current.filter((i) => itemId(i) !== id));
  }

  async function handleSaveEdit(item: ReviewQueueItem, form: FormData) {
    const id = itemId(item);
    setPendingId(id);

    const { error } =
      item.kind === "concept"
        ? await editCandidate("concept", id, {
            canonicalName: String(form.get("canonicalName") ?? ""),
            description: String(form.get("description") ?? ""),
          })
        : await editCandidate("edge", id, {
            relationType: String(form.get("relationType") ?? "") as (typeof STANDARD_RELATION_TYPES)[number],
            explanation: String(form.get("explanation") ?? ""),
          });

    setPendingId(null);
    if (error) {
      setErrorById((e) => ({ ...e, [id]: error }));
      return;
    }
    setErrorById((e) => {
      const { [id]: _removed, ...rest } = e;
      return rest;
    });
    setEditingId(null);
    setItems((current) =>
      current.map((i) => {
        if (itemId(i) !== id) return i;
        if (i.kind === "concept") {
          return {
            ...i,
            concept: {
              ...i.concept,
              canonicalName: String(form.get("canonicalName") ?? i.concept.canonicalName),
              description: String(form.get("description") ?? i.concept.description),
            },
          };
        }
        return {
          ...i,
          edge: {
            ...i.edge,
            relationType: String(form.get("relationType") ?? i.edge.relationType) as typeof i.edge.relationType,
            explanation: String(form.get("explanation") ?? i.edge.explanation),
          },
        };
      }),
    );
  }

  if (items.length === 0) {
    return <p style={s.empty}>No proposed concepts or relationships waiting for review.</p>;
  }

  return (
    <ul style={s.list}>
      {items.map((item) => {
        const id = itemId(item);
        const isPending = pendingId === id;
        const isEditing = editingId === id;
        const error = errorById[id];
        const isUncertain = item.reconciliation?.decision === "uncertain";

        return (
          <li key={id} style={s.card}>
            {item.kind === "concept" ? (
              <>
                <h3 style={s.cardTitle}>{item.concept.canonicalName}</h3>
                {item.concept.aliases.length > 0 && (
                  <p style={s.aliases}>Also known as: {item.concept.aliases.join(", ")}</p>
                )}
                <p style={s.description}>{item.concept.description}</p>
              </>
            ) : (
              <>
                <h3 style={s.cardTitle}>{item.edge.relationType}</h3>
                <p style={s.description}>{item.edge.explanation}</p>
              </>
            )}

            {item.reconciliation && (
              <p style={{ ...s.reconciliation, ...(isUncertain ? s.reconciliationUncertain : {}) }}>
                {isUncertain ? "⚠ Uncertain match: " : "Reconciliation: "}
                {item.reconciliation.reasoning}
              </p>
            )}

            {item.flags.length > 0 && (
              <div style={s.flags}>
                <strong>
                  {item.flags.length} student flag{item.flags.length === 1 ? "" : "s"}:
                </strong>
                <ul style={s.flagList}>
                  {item.flags.map((flag) => (
                    <li key={flag.id}>{flag.reason}</li>
                  ))}
                </ul>
              </div>
            )}

            {error && <p style={s.error}>{error}</p>}

            {isEditing ? (
              <form action={(form) => handleSaveEdit(item, form)} style={s.editForm}>
                {item.kind === "concept" ? (
                  <>
                    <input name="canonicalName" defaultValue={item.concept.canonicalName} style={s.input} />
                    <textarea name="description" defaultValue={item.concept.description} style={s.textarea} />
                  </>
                ) : (
                  <>
                    <select name="relationType" defaultValue={item.edge.relationType} style={s.input}>
                      {STANDARD_RELATION_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <textarea name="explanation" defaultValue={item.edge.explanation} style={s.textarea} />
                  </>
                )}
                <div style={s.buttonRow}>
                  <button type="submit" disabled={isPending} style={s.primaryButton}>
                    Save
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} style={s.secondaryButton}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div style={s.buttonRow}>
                <button type="button" disabled={isPending} onClick={() => handleConfirm(item)} style={s.primaryButton}>
                  Confirm
                </button>
                <button type="button" disabled={isPending} onClick={() => setEditingId(id)} style={s.secondaryButton}>
                  Edit
                </button>
                <button type="button" disabled={isPending} onClick={() => handleReject(item)} style={s.rejectButton}>
                  Reject
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const s: Record<string, React.CSSProperties> = {
  empty: { fontSize: 13.5, color: "var(--text-tertiary)" },
  list: { listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 },
  card: {
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    padding: 16,
    background: "var(--surface)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  cardTitle: { margin: 0, fontSize: 14.5, fontWeight: 500, color: "var(--text-primary)", letterSpacing: "-0.01em" },
  aliases: { margin: 0, fontSize: 12.5, color: "var(--text-tertiary)" },
  description: { margin: 0, fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.55 },
  reconciliation: { margin: 0, fontSize: 12.5, color: "var(--text-tertiary)" },
  reconciliationUncertain: { color: "var(--urgent-amber)", fontWeight: 600 },
  flags: { fontSize: 12.5, color: "var(--clay)" },
  flagList: { margin: "4px 0 0", paddingLeft: 18 },
  error: { margin: 0, fontSize: 12.5, color: "var(--clay)" },
  editForm: { display: "flex", flexDirection: "column", gap: 8, marginTop: 4 },
  input: {
    padding: "8px 10px",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    fontSize: 13.5,
    fontFamily: "var(--font-sans)",
  },
  textarea: {
    padding: "8px 10px",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    fontSize: 13.5,
    fontFamily: "var(--font-sans)",
    resize: "vertical",
  },
  buttonRow: { display: "flex", gap: 8, marginTop: 4 },
  primaryButton: {
    padding: "7px 14px",
    background: "var(--clay)",
    color: "var(--clay-fg)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    fontSize: 12.5,
    fontWeight: 500,
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
  },
  secondaryButton: {
    padding: "7px 14px",
    background: "transparent",
    color: "var(--text-secondary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    fontSize: 12.5,
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
  },
  rejectButton: {
    padding: "7px 14px",
    background: "transparent",
    color: "var(--clay)",
    border: "1px solid var(--clay-border)",
    borderRadius: "var(--radius-sm)",
    fontSize: 12.5,
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
  },
};
