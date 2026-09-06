/**
 * Pure derivation of the ONE combined badge shown per artifact, from the
 * two independent pieces of state behind it (the artifact's own upload
 * status + the latest extraction_runs status for it).
 *
 * Lives in its own module, with no "@/"-aliased or React imports, so it
 * is testable without a browser or a Supabase client (same reason
 * review-queue-priority.ts and edge-auto-confirm.ts were split out of
 * their consumers). artifact-board.tsx renders what this returns.
 *
 * The inputs are described structurally rather than imported from
 * artifacts/actions.ts ("use server") and course-graph-ingestion/
 * extraction-status.ts ("use server"), which can't be loaded outside a
 * Next.js request context.
 */

export type DisplayStatusInputArtifact = {
  status: "queued" | "processing" | "ready" | "failed";
  failureReason: string | null;
};

export type DisplayStatusInputExtraction = {
  status: "queued" | "processing" | "completed" | "failed";
  failureReason: string | null;
  conceptsExtracted: number;
  unitsCreatedOrMatched: number;
};

export type DisplayStatus = {
  label: string;
  bg: string;
  color: string;
  failureReason: string | null;
  counts: { conceptsExtracted: number; unitsCreatedOrMatched: number } | null;
};

// Upload-stage labels/colors -- only for the two non-terminal artifact
// statuses. "ready" and "failed" at the artifact level are folded into
// the combined derivation below, since both need to be disambiguated
// against the separate extraction-stage state rather than shown alone.
const UPLOAD_STAGE_LABEL: Record<"queued" | "processing", string> = {
  queued: "Queued",
  processing: "Processing…",
};

const UPLOAD_STAGE_COLOR: Record<"queued" | "processing", { bg: string; color: string }> = {
  processing: { bg: "var(--denim-muted)", color: "var(--denim)" },
  queued: { bg: "var(--border)", color: "var(--text-tertiary)" },
};

/**
 * - artifact "failed" -> "Upload failed" (the file itself never became
 *   usable -- distinct from extraction failing on a fine file).
 * - artifact "queued"/"processing" -> that upload stage.
 * - artifact "ready", no extraction run row at all -> "Not yet queued".
 *   This is deliberately NOT folded into "Extracting…": getExtractionStatuses
 *   omits artifacts with no run rather than fabricating a "queued" one, and
 *   an artifact that reaches "ready" while extraction is never enqueued
 *   would otherwise read as "Extracting…" forever -- exactly the "a failure
 *   is indistinguishable from still processing" state design goal 5 exists
 *   to eliminate. Normal for a second or two after upload; a signal that
 *   something is wrong if it persists.
 * - artifact "ready", run "queued"/"processing" -> "Extracting…" (a derived
 *   label, not a stored enum value).
 * - run "completed" -> "Ready", with real concepts/units counts.
 * - run "failed" -> "Extraction failed", worded distinctly from "Upload
 *   failed" so a rate-limit-style failure never reads as "this file is
 *   broken".
 */
export function getDisplayStatus(
  artifact: DisplayStatusInputArtifact,
  extraction: DisplayStatusInputExtraction | undefined,
): DisplayStatus {
  if (artifact.status === "failed") {
    return {
      label: "Upload failed",
      bg: "var(--clay-muted)",
      color: "var(--clay)",
      failureReason: artifact.failureReason,
      counts: null,
    };
  }

  if (artifact.status !== "ready") {
    return {
      label: UPLOAD_STAGE_LABEL[artifact.status],
      ...UPLOAD_STAGE_COLOR[artifact.status],
      failureReason: null,
      counts: null,
    };
  }

  if (!extraction) {
    return {
      label: "Not yet queued",
      bg: "var(--border)",
      color: "var(--text-tertiary)",
      failureReason: null,
      counts: null,
    };
  }

  if (extraction.status === "queued" || extraction.status === "processing") {
    return {
      label: "Extracting…",
      bg: "var(--denim-muted)",
      color: "var(--denim)",
      failureReason: null,
      counts: null,
    };
  }

  if (extraction.status === "completed") {
    return {
      label: "Ready",
      bg: "var(--teal-muted)",
      color: "var(--teal)",
      failureReason: null,
      counts: {
        conceptsExtracted: extraction.conceptsExtracted,
        unitsCreatedOrMatched: extraction.unitsCreatedOrMatched,
      },
    };
  }

  return {
    label: "Extraction failed",
    bg: "var(--clay-muted)",
    color: "var(--clay)",
    failureReason: extraction.failureReason,
    counts: null,
  };
}
