"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client.ts";
import { uploadArtifact, type Artifact } from "@/features/artifacts/actions.ts";
import type { ArtifactStatus } from "@/features/artifacts/status.ts";

const STATUS_LABEL: Record<ArtifactStatus, string> = {
  queued: "Queued",
  processing: "Processing…",
  ready: "Ready",
  failed: "Failed",
};

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
}: {
  courseId: string;
  initialArtifacts: Artifact[];
}) {
  const [artifacts, setArtifacts] = useState(initialArtifacts);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

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

      const storagePath = `${user.id}/${crypto.randomUUID()}/${file.name}`;
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

  return (
    <section>
      <form action={handleUpload}>
        <label>
          Upload course material
          <input type="file" name="file" required accept=".pdf,.png,.jpg,.jpeg,.heic,.webp" />
        </label>
        <button type="submit" disabled={uploading}>
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </form>
      {uploadError && <p role="alert">{uploadError}</p>}

      {artifacts.length === 0 ? (
        <p>No files uploaded yet.</p>
      ) : (
        <ul>
          {artifacts.map((artifact) => (
            <li key={artifact.id}>
              <span>{artifact.originalFilename}</span>{" "}
              <span>{STATUS_LABEL[artifact.status]}</span>
              {artifact.status === "failed" && artifact.failureReason && (
                <p role="alert">{artifact.failureReason}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
