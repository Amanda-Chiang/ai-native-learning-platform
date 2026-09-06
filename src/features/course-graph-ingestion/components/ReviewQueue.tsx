"use client";

import { useEffect, useRef, useState } from "react";
import {
  confirmCandidate,
  rejectCandidate,
  editCandidate,
  getReviewQueue,
  sweepEligibleEdges,
  type ReviewQueueItem,
} from "@/features/course-graph-ingestion/actions.ts";
import { createClient } from "@/lib/supabase/client.ts";

function itemId(item: ReviewQueueItem): string {
  if (item.kind === "concept") return item.concept.id;
  return item.unit.id;
}

const KIND_LABEL: Record<ReviewQueueItem["kind"], string> = {
  concept: "Concept",
  unit: "Unit",
};

/**
 * The rendering/editing logic for a single review-queue candidate,
 * extracted out so the plain always-visible list and the one-time
 * per-run popup render the exact same card -- confirming, editing, or
 * rejecting an item behaves identically no matter which surface it was
 * clicked from, and there is only one JSX implementation to keep in
 * sync (see the popup feature's "don't duplicate the card a second
 * time" requirement).
 */
function CandidateCard({
  item,
  isPending,
  isEditing,
  error,
  onSetEditing,
  onCancelEdit,
  onSaveEdit,
  onConfirm,
  onReject,
}: {
  item: ReviewQueueItem;
  isPending: boolean;
  isEditing: boolean;
  error: string | undefined;
  onSetEditing: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (form: FormData) => void;
  onConfirm: () => void;
  onReject: () => void;
}) {
  const id = itemId(item);
  const isUncertain = item.reconciliation?.decision === "uncertain";

  return (
    <li style={s.card}>
      <div style={s.cardContent}>
        {isEditing ? (
          item.kind === "concept" ? (
            <>
              <input name="canonicalName" form={`edit-form-${id}`} defaultValue={item.concept.canonicalName} style={s.input} />
              <textarea name="description" form={`edit-form-${id}`} defaultValue={item.concept.description} style={s.textarea} />
            </>
          ) : (
            <input name="title" form={`edit-form-${id}`} defaultValue={item.unit.title} style={s.input} />
          )
        ) : item.kind === "concept" ? (
          <>
            <h3 style={s.cardTitle}>{item.concept.canonicalName}</h3>
            {/* Which unit this concept files under, and whether that unit
                is itself still awaiting review -- a concept can't be
                confirmed before its unit is (actions.ts's
                confirmCandidate guard), so the dependency has to be
                visible on the card rather than only discovered as an
                error after clicking Confirm. */}
            <p style={s.aliases}>
              {item.unit === null ? (
                <span style={s.unitPending}>Unit: unknown (this concept points at a unit not found in this course)</span>
              ) : item.unit.status === "confirmed" ? (
                <>Unit: {item.unit.title}</>
              ) : (
                <span style={s.unitPending}>Unit: {item.unit.title} — confirm this unit first</span>
              )}
            </p>
            {item.concept.aliases.length > 0 && (
              <p style={s.aliases}>Also known as: {item.concept.aliases.join(", ")}</p>
            )}
            <p style={s.description}>{item.concept.description}</p>
          </>
        ) : (
          <>
            <h3 style={s.cardTitle}>{item.unit.title}</h3>
            {item.otherExistingUnitTitles.length > 0 && (
              <p style={s.aliases}>
                This course's other existing units: {item.otherExistingUnitTitles.join(", ")}
              </p>
            )}
          </>
        )}

        {item.reconciliation && (
          <p style={{ ...s.reconciliation, ...(isUncertain ? s.reconciliationUncertain : {}) }}>
            {isUncertain ? "⚠ Uncertain match: " : "Reconciliation: "}
            {item.reconciliation.reasoning}
          </p>
        )}

        {item.kind !== "unit" && item.flags.length > 0 && (
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
      </div>

      {isEditing ? (
        <form
          id={`edit-form-${id}`}
          action={(form) => onSaveEdit(form)}
          style={s.actionColumn}
        >
          <button type="submit" disabled={isPending} style={s.primaryButton}>
            Save
          </button>
          <button type="button" onClick={onCancelEdit} style={s.secondaryButton}>
            Cancel
          </button>
        </form>
      ) : (
        <div style={s.actionColumn}>
          <button type="button" disabled={isPending} onClick={onConfirm} style={s.primaryButton}>
            Confirm
          </button>
          <button type="button" disabled={isPending} onClick={onSetEditing} style={s.secondaryButton}>
            Edit
          </button>
          <button type="button" disabled={isPending} onClick={onReject} style={s.rejectButton}>
            Reject
          </button>
        </div>
      )}
    </li>
  );
}

/**
 * Reviewer UI for User Story 3: lists proposed concepts/edges, shows
 * reconciliation reasoning and flags when present, and lets a reviewer
 * confirm/edit/reject each one (contracts/ingestion-actions.md).
 *
 * A candidate with an "uncertain" reconciliation decision is visibly
 * distinguished from one with none at all -- FR-005 requires an
 * uncertain case never look the same as ordinary, unflagged confidence.
 *
 * On top of the always-visible plain list, this also surfaces a
 * one-time popup scoped to whichever single extraction run just
 * completed (or, on page load, whichever run still has unreviewed
 * candidates left over from last time) -- see
 * .superpowers/sdd/2026-09-05-unit-extraction-reconciliation/ for the
 * full spec this satisfies. The popup and the plain list share the
 * same `items` state and the same CandidateCard renderer, so confirming
 * or rejecting an item anywhere removes it from both immediately.
 */
export function ReviewQueue({ items: initialItems, courseId }: { items: ReviewQueueItem[]; courseId: string }) {
  const [items, setItems] = useState(initialItems);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorById, setErrorById] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  // On page load, if any leftover 'proposed' candidate from a prior
  // extraction run is still sitting unreviewed, re-open the popup for
  // that run -- items is already priority-sorted, so the first item
  // with a non-null extractionRunId picks a single run deterministically
  // (per the spec: no multi-run queue, handle one run at a time).
  const [activeModalRunId, setActiveModalRunId] = useState<string | null>(
    () => initialItems.find((i) => i.extractionRunId !== null)?.extractionRunId ?? null,
  );

  // Live trigger: the moment Realtime reports an extraction_runs row for
  // this course flipping to "completed", re-fetch the full review queue
  // (a fresh read, not an incremental patch -- getReviewQueue already
  // does the joins/sorting) and open the popup for that run.
  //
  // Two "completed" events can arrive close together (e.g. a multi-file
  // batch upload triggers parallel extraction runs), and their async
  // getReviewQueue() re-fetches can resolve out of order -- whichever
  // fetch happens to finish last would otherwise win regardless of which
  // event was actually the most recent one received. latestRunIdRef is
  // stamped synchronously the instant each event arrives (before its
  // fetch is even started), so when a fetch resolves it can check "is my
  // event still the latest one?" and only commit state if so. If a newer
  // event has already arrived by the time an older fetch resolves, that
  // older fetch's result is discarded -- the newer event's own fetch is
  // the one responsible for landing the final, correct state.
  const latestRunIdRef = useRef<string | null>(null);
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`extraction-runs-review-${courseId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "extraction_runs", filter: `course_id=eq.${courseId}` },
        (payload) => {
          const row = payload.new as { id: string; status: string };
          if (row.status !== "completed") return;

          latestRunIdRef.current = row.id;

          void (async () => {
            const fresh = await getReviewQueue(courseId);
            if (latestRunIdRef.current !== row.id) return;
            setItems(fresh);
            setActiveModalRunId(row.id);
          })();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [courseId]);

  function closeModal() {
    setActiveModalRunId(null);
  }

  // Returns the server's error (or null) as well as rendering it on the
  // card, so a bulk caller can count real failures instead of assuming
  // every dispatched confirm succeeded.
  async function handleConfirm(item: ReviewQueueItem): Promise<string | null> {
    const id = itemId(item);
    setPendingId(id);
    const { error } = await confirmCandidate(item.kind, id);
    setPendingId(null);
    if (error) {
      setErrorById((e) => ({ ...e, [id]: error }));
      return error;
    }
    setItems((current) => current.filter((i) => itemId(i) !== id));
    return null;
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
        : await editCandidate("unit", id, { title: String(form.get("title") ?? "") });

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
        return { ...i, unit: { ...i.unit, title: String(form.get("title") ?? i.unit.title) } };
      }),
    );
  }

  // Popup scope: only candidates from the one run currently active.
  // If everything in that run just got confirmed/rejected (including via
  // a bulk-confirm click below), there's nothing left to show for it --
  // auto-close rather than leave an empty modal open.
  const modalItems = activeModalRunId === null ? [] : items.filter((i) => i.extractionRunId === activeModalRunId);
  useEffect(() => {
    if (activeModalRunId !== null && modalItems.length === 0) {
      setActiveModalRunId(null);
    }
  }, [activeModalRunId, modalItems.length]);

  /**
   * Bulk confirm, in the one order the server actually allows: every
   * pending unit in this run first, then (if concepts were asked for)
   * the concepts. confirmCandidate refuses a concept whose unit is
   * still 'proposed', so a "Confirm N Concepts" click on a fresh run --
   * where the units are proposed too -- would otherwise fail for every
   * single concept. Units are confirmed regardless of which bulk button
   * was pressed, because they are a precondition of the concepts, not a
   * separate opt-in.
   *
   * Sequential, not Promise.all: correctness of the edge auto-confirm
   * cascade previously depended on Next.js dispatching Server Function
   * calls one at a time ("an implementation detail [that] may change"),
   * and concurrent confirms of two edge-joined concepts can each read
   * the other endpoint as still 'proposed'. sweepEligibleEdges below is
   * the deterministic backstop; sequencing here also keeps the per-item
   * error reporting (pendingId is a single id) coherent, and makes the
   * units-before-concepts ordering above actually hold.
   *
   * Failures are never swallowed: each one renders on its own card via
   * handleConfirm, and the count is summarised in the modal footer so a
   * reviewer who clicked a bulk button gets a signal even if the failing
   * card is scrolled out of view.
   */
  async function handleBulkConfirm(kind: ReviewQueueItem["kind"]) {
    setBulkError(null);
    const ordered = [
      ...modalItems.filter((i) => i.kind === "unit"),
      ...(kind === "concept" ? modalItems.filter((i) => i.kind === "concept") : []),
    ];

    let failures = 0;
    let confirmedAnyConcept = false;
    for (const item of ordered) {
      const error = await handleConfirm(item);
      if (error) failures += 1;
      else if (item.kind === "concept") confirmedAnyConcept = true;
    }

    // Deterministic backstop for the edge cascade (see actions.ts):
    // re-checks every proposed edge in the course once, after the whole
    // batch has landed, instead of trusting the per-confirm cascade to
    // have observed the final statuses.
    if (confirmedAnyConcept) {
      const { error: sweepError } = await sweepEligibleEdges(courseId);
      if (sweepError) {
        setBulkError(`Confirmed, but relationships could not be re-checked: ${sweepError}`);
        return;
      }
    }

    if (failures > 0) {
      setBulkError(
        `${failures} candidate${failures === 1 ? "" : "s"} could not be confirmed -- see the message on each card.`,
      );
    }
  }

  function renderCard(item: ReviewQueueItem) {
    const id = itemId(item);
    return (
      <CandidateCard
        key={id}
        item={item}
        isPending={pendingId === id}
        isEditing={editingId === id}
        error={errorById[id]}
        onSetEditing={() => setEditingId(id)}
        onCancelEdit={() => setEditingId(null)}
        onSaveEdit={(form) => handleSaveEdit(item, form)}
        onConfirm={() => handleConfirm(item)}
        onReject={() => handleReject(item)}
      />
    );
  }

  const bulkKinds = (["concept", "unit"] as const).filter(
    (kind) => modalItems.some((i) => i.kind === kind),
  );

  // Nothing pending and no popup open -- this is the steady-state, most
  // of the time this component is mounted (it stays mounted always so
  // its Realtime subscription above keeps listening for the next
  // extraction run to complete). Render nothing visible at all: no
  // heading, no description, no empty-state sentence. The "Pending
  // review" chrome only ever earns its place on the page when there is
  // something to actually review.
  if (items.length === 0 && activeModalRunId === null) {
    return null;
  }

  return (
    <div style={s.section}>
      <h2 style={s.subsectionTitle}>Pending review</h2>
      <p style={s.sectionDesc}>
        Concepts and units extraction proposed from your uploads -- confirm, edit, or reject each one before it
        becomes part of the real concept graph. Relationships aren't reviewed here: each one confirms itself once
        both concepts it connects are confirmed.
      </p>

      {items.length === 0 ? (
        <p style={s.empty}>No proposed concepts or units waiting for review.</p>
      ) : (
        <ul style={s.list}>{items.map((item) => renderCard(item))}</ul>
      )}

      {activeModalRunId !== null && modalItems.length > 0 && (
        <div style={s.overlay} role="dialog" aria-modal="true">
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <h2 style={s.modalTitle}>New extraction results</h2>
              <button type="button" onClick={closeModal} style={s.closeButton} aria-label="Close">
                ×
              </button>
            </div>
            <ul style={s.modalList}>{modalItems.map((item) => renderCard(item))}</ul>
            <div style={s.modalFooter}>
              {bulkError && (
                <p style={s.error} role="alert">
                  {bulkError}
                </p>
              )}
              {bulkKinds.map((kind) => {
                const count = modalItems.filter((i) => i.kind === kind).length;
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => handleBulkConfirm(kind)}
                    style={s.primaryButton}
                  >
                    Confirm {count} {KIND_LABEL[kind]}
                    {count === 1 ? "" : "s"}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  section: { display: "flex", flexDirection: "column", gap: 4 },
  subsectionTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 500,
    letterSpacing: "-0.02em",
    color: "var(--text-primary)",
  },
  sectionDesc: {
    margin: 0,
    fontSize: 13.5,
    color: "var(--text-secondary)",
    lineHeight: 1.55,
    letterSpacing: "-0.005em",
  },
  empty: { fontSize: 13.5, color: "var(--text-tertiary)" },
  list: { listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 },
  card: {
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    padding: 16,
    background: "var(--surface)",
    display: "flex",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
  },
  cardContent: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 },
  cardTitle: { margin: 0, fontSize: 14.5, fontWeight: 500, color: "var(--text-primary)", letterSpacing: "-0.01em" },
  aliases: { margin: 0, fontSize: 12.5, color: "var(--text-tertiary)" },
  description: { margin: 0, fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.55 },
  reconciliation: { margin: 0, fontSize: 12.5, color: "var(--text-tertiary)" },
  reconciliationUncertain: { color: "var(--urgent-amber)", fontWeight: 600 },
  flags: { fontSize: 12.5, color: "var(--clay)" },
  flagList: { margin: "4px 0 0", paddingLeft: 18 },
  error: { margin: 0, fontSize: 12.5, color: "var(--clay)" },
  unitPending: { color: "var(--urgent-amber)", fontWeight: 600 },
  actionColumn: { flexShrink: 0, width: 96, display: "flex", flexDirection: "column", gap: 6 },
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
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0, 0, 0, 0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: 24,
  },
  modal: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    width: "100%",
    maxWidth: 640,
    maxHeight: "85vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  modalHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  modalTitle: { margin: 0, fontSize: 16, fontWeight: 500, color: "var(--text-primary)", letterSpacing: "-0.02em" },
  closeButton: {
    background: "transparent",
    border: "none",
    fontSize: 20,
    lineHeight: 1,
    color: "var(--text-tertiary)",
    cursor: "pointer",
    padding: 4,
  },
  modalList: {
    listStyle: "none",
    padding: 20,
    margin: 0,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    overflowY: "auto",
    flex: 1,
  },
  modalFooter: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    padding: "16px 20px",
    borderTop: "1px solid var(--border)",
    flexShrink: 0,
  },
};
