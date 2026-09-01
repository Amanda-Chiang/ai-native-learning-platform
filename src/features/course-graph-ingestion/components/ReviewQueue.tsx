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
    return <p>No proposed concepts or relationships waiting for review.</p>;
  }

  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {items.map((item) => {
        const id = itemId(item);
        const isPending = pendingId === id;
        const isEditing = editingId === id;
        const error = errorById[id];

        return (
          <li
            key={id}
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: 16,
              marginBottom: 12,
            }}
          >
            {item.kind === "concept" ? (
              <>
                <h3 style={{ margin: 0 }}>{item.concept.canonicalName}</h3>
                {item.concept.aliases.length > 0 && (
                  <p style={{ color: "#6b7280", fontSize: 13 }}>
                    Also known as: {item.concept.aliases.join(", ")}
                  </p>
                )}
                <p>{item.concept.description}</p>
              </>
            ) : (
              <>
                <h3 style={{ margin: 0 }}>{item.edge.relationType}</h3>
                <p>{item.edge.explanation}</p>
              </>
            )}

            {item.reconciliation && (
              <p
                style={{
                  fontSize: 13,
                  color: item.reconciliation.decision === "uncertain" ? "#d97706" : "#6b7280",
                  fontWeight: item.reconciliation.decision === "uncertain" ? 600 : 400,
                }}
              >
                {item.reconciliation.decision === "uncertain" ? "⚠ Uncertain match: " : "Reconciliation: "}
                {item.reconciliation.reasoning}
              </p>
            )}

            {item.flags.length > 0 && (
              <div style={{ fontSize: 13, color: "#dc2626" }}>
                <strong>
                  {item.flags.length} student flag{item.flags.length === 1 ? "" : "s"}:
                </strong>
                <ul>
                  {item.flags.map((flag) => (
                    <li key={flag.id}>{flag.reason}</li>
                  ))}
                </ul>
              </div>
            )}

            {error && <p style={{ color: "#dc2626", fontSize: 13 }}>{error}</p>}

            {isEditing ? (
              <form
                action={(form) => handleSaveEdit(item, form)}
                style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}
              >
                {item.kind === "concept" ? (
                  <>
                    <input name="canonicalName" defaultValue={item.concept.canonicalName} />
                    <textarea name="description" defaultValue={item.concept.description} />
                  </>
                ) : (
                  <>
                    <select name="relationType" defaultValue={item.edge.relationType}>
                      {STANDARD_RELATION_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <textarea name="explanation" defaultValue={item.edge.explanation} />
                  </>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="submit" disabled={isPending}>
                    Save
                  </button>
                  <button type="button" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button type="button" disabled={isPending} onClick={() => handleConfirm(item)}>
                  Confirm
                </button>
                <button type="button" disabled={isPending} onClick={() => setEditingId(id)}>
                  Edit
                </button>
                <button type="button" disabled={isPending} onClick={() => handleReject(item)}>
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
