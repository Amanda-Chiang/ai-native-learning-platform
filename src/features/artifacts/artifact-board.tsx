"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client.ts";
import { uploadArtifact, type Artifact } from "@/features/artifacts/actions.ts";
import type { ArtifactStatus } from "@/features/artifacts/status.ts";
import type { CourseUnit } from "@/types/domain/index.ts";
import type { ExtractionStatusView } from "@/features/course-graph-ingestion/extraction-status.ts";
import {
  getDisplayStatus,
  type DisplayStatusInputExtraction,
} from "@/features/artifacts/display-status.ts";
import { IconUpload, IconFile } from "@/components/icons.tsx";

/**
 * Live extraction_runs state for one artifact, keyed by artifact_id.
 *
 * `runId` tracks which extraction_runs row this entry's fields (in
 * particular unitsCreatedOrMatched) currently reflect. It exists so the
 * fire-and-forget count query below can tell, once it resolves, whether
 * a newer run's event has since landed for this same artifact_id -- if
 * so, its stale count must be discarded rather than applied.
 */
type ExtractionInfo = DisplayStatusInputExtraction & { runId: string };

/**
 * Client Component: upload form + a live-updating artifact list.
 *
 * Satisfies FR-011 ("updates without manual reload") via a Supabase
 * Realtime subscription on the artifacts table, filtered to this course
 * -- not polling, since Realtime is already part of the same Supabase
 * project this feature depends on.
 */
export function ArtifactBoard({
  courseId,
  initialArtifacts,
  units,
  initialExtractionStatuses,
}: {
  courseId: string;
  initialArtifacts: Artifact[];
  units: CourseUnit[];
  initialExtractionStatuses: ExtractionStatusView[];
}) {
  const [artifacts, setArtifacts] = useState(initialArtifacts);
  const [extractionByArtifactId, setExtractionByArtifactId] = useState<Map<string, ExtractionInfo>>(
    () =>
      new Map(
        initialExtractionStatuses.map((s) => [
          s.artifactId,
          {
            runId: s.runId,
            status: s.status,
            failureReason: s.failureReason,
            conceptsExtracted: s.conceptsExtracted,
            unitsCreatedOrMatched: s.unitsCreatedOrMatched,
          },
        ]),
      ),
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [targetUnitId, setTargetUnitId] = useState<string>("");
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`artifacts-course-${courseId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "artifacts", filter: `course_id=eq.${courseId}` },
        (payload) => {
          const row = payload.new as {
            id: string;
            original_filename: string;
            status: ArtifactStatus;
          };
          setArtifacts((current) => {
            const existingIndex = current.findIndex((a) => a.id === row.id);
            const updated: Artifact = {
              id: row.id,
              originalFilename: row.original_filename,
              status: row.status,
              failureReason: null,
            };
            if (existingIndex === -1) {
              return [updated, ...current];
            }
            const next = [...current];
            next[existingIndex] = { ...next[existingIndex], ...updated };
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [courseId]);

  // Live extraction_runs state, ported from ExtractionStatusList's fixed
  // race-safety pattern (a1e6268): every payload is committed to the map
  // SYNCHRONOUSLY off its own columns, with no awaited lookup gating that
  // commit -- avoiding the race that fix addressed, where gating a commit
  // on an async lookup let a slower in-flight query's eventual commit land
  // after a fresher, synchronously-committed event and silently overwrite
  // it with stale data. The one value the payload can't carry,
  // unitsCreatedOrMatched, is left at whatever the entry already had (or 0
  // if this artifact_id hasn't been seen yet -- an honest "not known yet"
  // default, not a fabricated count). When status is "completed", the
  // reconciliation_decisions count is fetched separately, fire-and-forget,
  // and patched onto the entry keyed by artifact_id once it resolves --
  // touching only unitsCreatedOrMatched, never status/failureReason/
  // conceptsExtracted, so it can never stomp a newer event that arrived
  // while the count query was in flight.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`extraction-runs-course-${courseId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "extraction_runs", filter: `course_id=eq.${courseId}` },
        (payload) => {
          const row = payload.new as {
            id: string;
            artifact_id: string;
            status: ExtractionStatusView["status"];
            failure_reason: string | null;
            concepts_extracted: number;
          };

          setExtractionByArtifactId((current) => {
            const next = new Map(current);
            const existing = next.get(row.artifact_id);
            next.set(row.artifact_id, {
              runId: row.id,
              status: row.status,
              failureReason: row.failure_reason,
              conceptsExtracted: row.concepts_extracted,
              unitsCreatedOrMatched: existing?.unitsCreatedOrMatched ?? 0,
            });
            return next;
          });

          if (row.status === "completed") {
            // Fire-and-forget count enrichment: not awaited before the
            // commit above, and its eventual patch below only ever touches
            // unitsCreatedOrMatched -- so even if a fresher event for this
            // same artifact_id has already changed status/failureReason/
            // conceptsExtracted by the time this resolves, this patch
            // can't clobber those fields. It's also guarded by runId: if a
            // second extraction_runs row for the same artifact_id (e.g. a
            // future retry) completes and its own count query resolves
            // first, this run's count is stale by the time it lands here
            // and must be discarded rather than overwrite the newer run's
            // real count.
            void (async () => {
              const { count } = await supabase
                .from("reconciliation_decisions")
                .select("id", { count: "exact", head: true })
                .eq("candidate_kind", "unit")
                .eq("extraction_run_id", row.id);
              const unitsCreatedOrMatched = count ?? 0;
              setExtractionByArtifactId((latest) => {
                const existing = latest.get(row.artifact_id);
                if (!existing || existing.runId !== row.id) return latest;
                const next = new Map(latest);
                next.set(row.artifact_id, { ...existing, unitsCreatedOrMatched });
                return next;
              });
            })();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [courseId]);

  async function handleUpload(formData: FormData) {
    setUploadError(null);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setUploadError("Choose a file to upload.");
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setUploadError("You must be signed in to upload a file.");
        return;
      }

      // Sanitize the filename segment for the storage key -- found live:
      // an unencoded "#" (e.g. "HW#1.pdf") gets treated as a URL fragment
      // delimiter by the storage upload request, silently truncating the
      // stored object's name to "HW" and leaving the DB's storage_path
      // pointing at a file that was never actually written. Storage keys
      // reject "#" outright even percent-encoded (Supabase decodes the
      // key before validating it), so replacing disallowed characters is
      // the only fix -- the original file.name is still stored verbatim
      // as original_filename for display.
      const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `${user.id}/${crypto.randomUUID()}/${safeFileName}`;
      const { error: storageError } = await supabase.storage
        .from("course-artifacts")
        .upload(storagePath, file);

      if (storageError) {
        setUploadError(storageError.message);
        return;
      }

      const result = await uploadArtifact(courseId, {
        storagePath,
        originalFilename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        targetUnitId: targetUnitId || undefined,
      });

      if ("error" in result) {
        setUploadError(result.error);
        return;
      }

      setArtifacts((current) => [
        { id: result.artifact.id, originalFilename: file.name, status: "queued", failureReason: null },
        ...current,
      ]);
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !fileInputRef.current || !formRef.current) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    fileInputRef.current.files = transfer.files;
    formRef.current.requestSubmit();
  }

  return (
    <section style={s.section}>
      <form ref={formRef} action={handleUpload}>
        <label
          style={{ ...s.dropzone, ...(dragging ? s.dropzoneActive : {}) }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            name="file"
            required
            accept=".pdf,.png,.jpg,.jpeg,.heic,.webp"
            style={{ display: "none" }}
            onChange={() => formRef.current?.requestSubmit()}
          />
          {units.length > 0 && (
            <select
              value={targetUnitId}
              onChange={(e) => setTargetUnitId(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              style={s.unitSelect}
            >
              <option value="">No specific unit</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.title}
                </option>
              ))}
            </select>
          )}
          <span style={s.uploadIcon}>
            <IconUpload />
          </span>
          <div style={s.uploadText}>
            <span style={s.uploadPrimary}>{uploading ? "Uploading…" : "Drop a file here or click to upload"}</span>
            <span style={s.uploadSecondary}>PDF, PNG, JPG, HEIC, WebP · max 25 MB</span>
          </div>
        </label>
      </form>
      {uploadError && (
        <p style={s.uploadError} role="alert">
          {uploadError}
        </p>
      )}

      {artifacts.length > 0 && (
        <div style={s.artifactList}>
          <div style={s.artifactHeader}>
            <span style={s.artifactCount}>
              {artifacts.length} {artifacts.length === 1 ? "file" : "files"}
            </span>
          </div>
          {artifacts.map((artifact) => {
            const display = getDisplayStatus(artifact, extractionByArtifactId.get(artifact.id));
            return (
              <div key={artifact.id} style={s.artifactRow}>
                <span style={s.artifactIcon}>
                  <IconFile />
                </span>
                <div style={s.artifactInfo}>
                  <span style={s.artifactName}>{artifact.originalFilename}</span>
                  {display.failureReason && <span style={s.failReason}>{display.failureReason}</span>}
                  {display.counts && (
                    <span style={s.extractionCounts}>
                      {display.counts.conceptsExtracted} concepts &middot; {display.counts.unitsCreatedOrMatched} units
                    </span>
                  )}
                </div>
                <span
                  style={{
                    ...s.statusBadge,
                    background: display.bg,
                    color: display.color,
                  }}
                >
                  {display.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

const s: Record<string, React.CSSProperties> = {
  section: { display: "flex", flexDirection: "column", gap: 16 },
  dropzone: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: "40px 24px",
    border: "1.5px dashed var(--border-strong)",
    borderRadius: "var(--radius-md)",
    background: "var(--surface)",
    cursor: "pointer",
    transition: "border-color 0.15s, background 0.15s",
  },
  dropzoneActive: {
    borderColor: "var(--clay)",
    background: "var(--clay-muted)",
  },
  uploadIcon: { display: "flex", alignItems: "center", color: "var(--text-tertiary)" },
  uploadText: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4 },
  uploadPrimary: { fontSize: 14, fontWeight: 500, color: "var(--text-secondary)", letterSpacing: "-0.01em" },
  uploadSecondary: { fontSize: 12, color: "var(--text-tertiary)", letterSpacing: "-0.005em" },
  uploadError: { margin: 0, fontSize: 12.5, color: "var(--clay)" },
  unitSelect: {
    marginTop: 8,
    padding: "6px 10px",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    fontSize: 12.5,
    fontFamily: "var(--font-sans)",
    background: "var(--surface)",
    color: "var(--text-primary)",
  },
  artifactList: {
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    overflow: "hidden",
    background: "var(--surface)",
  },
  artifactHeader: { padding: "10px 16px", borderBottom: "1px solid var(--border)", background: "var(--surface-hover)" },
  artifactCount: { fontSize: 11.5, color: "var(--text-tertiary)", fontWeight: 500, letterSpacing: "0.02em" },
  artifactRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 16px",
    borderBottom: "1px solid var(--border)",
  },
  artifactIcon: { color: "var(--text-tertiary)", display: "flex", flexShrink: 0 },
  artifactInfo: { flex: 1, display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
  artifactName: {
    fontSize: 13.5,
    color: "var(--text-primary)",
    letterSpacing: "-0.01em",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  failReason: { fontSize: 11.5, color: "var(--clay)", letterSpacing: "-0.005em" },
  extractionCounts: { fontSize: 11.5, color: "var(--text-tertiary)", letterSpacing: "-0.005em" },
  statusBadge: {
    fontSize: 10.5,
    fontWeight: 500,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    padding: "2px 8px",
    borderRadius: 20,
    flexShrink: 0,
  },
};
