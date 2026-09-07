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

// A candidate the auto-matcher itself flagged as a likely duplicate --
// this is exactly the case bulk-confirm must never silently sweep in
// alongside routine candidates (see handleBulkConfirmUnits).
function isUncertain(item: ReviewQueueItem): boolean {
  return item.reconciliation?.decision === "uncertain";
}

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
  const formId = `edit-form-${id}`;
  const uncertain = isUncertain(item);

  return (
    <li style={s.card}>
      <div style={s.cardContent}>
        {isEditing ? (
          item.kind === "concept" ? (
            <>
              <input name="canonicalName" form={formId} defaultValue={item.concept.canonicalName} style={s.input} />
              <textarea name="description" form={formId} defaultValue={item.concept.description} style={s.textarea} />
            </>
          ) : (
            <input name="title" form={formId} defaultValue={item.unit.title} style={s.input} />
          )
        ) : item.kind === "concept" ? (
          <>
            <h3 style={s.cardTitle}>{item.concept.canonicalName}</h3>
            {/* The extraction pipeline's own per-item confidence (distinct
                from the reconciliation "uncertain" flag below, which is
                about duplicate-matching, not extraction quality) -- shown
                so a reviewer can judge scrutiny needed even on candidates
                reconciliation didn't flag at all. */}
            <p style={s.confidence}>{Math.round(item.concept.confidence * 100)}% extraction confidence</p>
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
                This course&apos;s other existing units: {item.otherExistingUnitTitles.join(", ")}
              </p>
            )}
          </>
        )}

        {item.reconciliation && (
          <p style={{ ...s.reconciliation, ...(uncertain ? s.reconciliationUncertain : {}) }}>
            {uncertain ? "⚠ Uncertain match: " : "Reconciliation: "}
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
          id={formId}
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
 * Reviewer UI for User Story 3: shows proposed concepts/units,
 * reconciliation reasoning and flags when present, and lets a reviewer
 * confirm/edit/reject each one (contracts/ingestion-actions.md).
 *
 * A candidate with an "uncertain" reconciliation decision is visibly
 * distinguished from one with none at all -- FR-005 requires an
 * uncertain case never look the same as ordinary, unflagged confidence.
 *
 * The only surface is a popup scoped to whichever single extraction run
 * just completed (or, on page load/re-navigation, whichever run still
 * has unreviewed candidates left over from last time) -- there is no
 * persistent always-visible list. 'proposed' is a valid, indefinitely
 * resting status (course_concepts/course_units' own check constraints),
 * so dismissing the popup is a deferral, not a forced decision: closing
 * it never mutates status, and nothing auto-reopens it for the same
 * leftover run afterward. The only way back to a dismissed run's
 * candidates is a fresh navigation/reload of this page, which
 * recomputes `activeModalRunId` from the real current data.
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
    if (item.kind === "unit") {
      // Confirming a unit can cascade-confirm every non-uncertain
      // concept under it server-side (actions.ts's confirmCandidate,
      // 2026-09-07: units are the review-gated side of extraction, a
      // routine concept auto-confirms the moment its unit does). A local
      // filter here would only remove this one unit and leave those
      // sibling concept cards showing stale 'proposed' state -- a full
      // refetch is the only way this component's `items` can reflect a
      // side effect it didn't itself request.
      setItems(await getReviewQueue(courseId));
    } else {
      setItems((current) => current.filter((i) => itemId(i) !== id));
    }
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

  // Popup scope: only candidates from the one run currently active. If
  // everything in that run just got confirmed/rejected (including via a
  // bulk-confirm click below), modalItems naturally empties out and the
  // render's own early return below (activeModalRunId === null ||
  // modalItems.length === 0) already hides the modal -- no effect needed
  // to additionally null out activeModalRunId, since nothing else reads
  // it in a way that distinguishes "null" from "a run with zero items
  // left." (Previously did this via a `useEffect` calling `setState`
  // unconditionally on every render where it applied -- removed as dead
  // weight once it became clear the early return already covered it.)
  const modalItems = activeModalRunId === null ? [] : items.filter((i) => i.extractionRunId === activeModalRunId);

  // Only units get a bulk-confirm button. Concepts no longer need one:
  // 2026-09-07 decision (architecture-log.md) made units the sole
  // review-gated side of extraction -- a routine (non-uncertain) concept
  // under an already-confirmed unit inserts straight to 'confirmed' at
  // extraction time, and one under a still-proposed unit auto-confirms
  // the moment this bulk action (or an individual card) confirms that
  // unit (confirmCandidate's own cascade). The only concepts left sitting
  // at 'proposed' by the time a reviewer sees this modal are ones an
  // uncertain reconciliation match is blocking on purpose -- those always
  // need their own individual Confirm/Edit/Reject, bulk or not.
  const bulkConfirmableUnits = modalItems.filter((i) => i.kind === "unit" && !isUncertain(i));
  const uncertainCount = modalItems.filter(isUncertain).length;

  /**
   * Bulk-confirms every non-uncertain unit in this run. Each confirm
   * cascades server-side (confirmCandidate) to every non-uncertain
   * concept under that unit, and each of those cascades again to every
   * edge it completes -- one unit click can legitimately resolve most of
   * a run without ever touching a concept card.
   *
   * Sequential, not Promise.all: correctness of the confirm cascades
   * previously depended (edge-auto-confirm's own history) on Next.js
   * dispatching Server Function calls one at a time ("an implementation
   * detail [that] may change"), and this keeps that same guarantee for
   * the new unit-to-concept cascade. sweepEligibleEdges below is the
   * deterministic backstop for edges specifically; units have no
   * equivalent two-sided race to backstop (a concept depends on exactly
   * one unit, never two), so confirmCandidate's own cascade is already
   * sufficient there.
   *
   * Failures are never swallowed: each one renders on its own card via
   * handleConfirm, and the count is summarised in the modal footer so a
   * reviewer who clicked the bulk button gets a signal even if the
   * failing card is scrolled out of view.
   */
  async function handleBulkConfirmUnits() {
    setBulkError(null);

    let failures = 0;
    let confirmedAnyUnit = false;
    for (const item of bulkConfirmableUnits) {
      const error = await handleConfirm(item);
      if (error) failures += 1;
      else confirmedAnyUnit = true;
    }

    // Deterministic backstop for the edge cascade (see actions.ts):
    // re-checks every proposed edge in the course once, after the whole
    // batch (and everything it cascade-confirmed) has landed, instead of
    // trusting the per-confirm cascade to have observed final statuses.
    if (confirmedAnyUnit) {
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
    } else if (uncertainCount > 0) {
      setBulkError(
        `${uncertainCount} uncertain match${uncertainCount === 1 ? "" : "es"} skipped -- review ${
          uncertainCount === 1 ? "it" : "them"
        } individually below.`,
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

  const modalUnitCount = modalItems.filter((i) => i.kind === "unit").length;
  // No button at all if every unit in this run is an uncertain match --
  // "Confirm 0 Units" is nothing a reviewer should be able to click.
  const showBulkConfirmButton = bulkConfirmableUnits.length > 0;

  // Nothing to show most of the time this component is mounted (it stays
  // mounted always so its Realtime subscription above keeps listening for
  // the next extraction run to complete) -- render nothing visible at all
  // unless there's an active run with candidates still pending review.
  if (activeModalRunId === null || modalItems.length === 0) {
    return null;
  }

  return (
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
          {showBulkConfirmButton && (
            // The displayed count is every unit in the popup, not just
            // the bulk-confirmable subset -- every one of them (including
            // an uncertain match) is already visible on its own card
            // right above this button, so the reviewer can see exactly
            // which one(s) the post-click "skipped" notice will refer to.
            // The actual confirm above is restricted to bulkConfirmableUnits.
            <button type="button" onClick={handleBulkConfirmUnits} style={s.primaryButton}>
              Confirm {modalUnitCount} Unit{modalUnitCount === 1 ? "" : "s"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
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
  confidence: { margin: 0, fontSize: 12.5, color: "var(--text-tertiary)", fontWeight: 500 },
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
