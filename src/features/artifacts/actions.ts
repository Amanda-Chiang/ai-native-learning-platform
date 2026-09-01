"use server";

import { createClient } from "@/lib/supabase/server.ts";
import { validateUpload, type ArtifactStatus } from "./status.ts";

/**
 * Server action contracts: specs/002-account-course-artifact-foundation/contracts/server-actions.md
 */

export type Artifact = {
  id: string;
  originalFilename: string;
  status: ArtifactStatus;
  failureReason: string | null;
};

export type UploadedFile = {
  storagePath: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
};

export async function uploadArtifact(
  courseId: string,
  file: UploadedFile,
): Promise<{ artifact: { id: string; status: "queued" } } | { error: string }> {
  const validation = validateUpload(file.mimeType, file.sizeBytes);
  if (!validation.valid) {
    return { error: validation.reason };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to upload a file." };
  }

  const { data: artifact, error: artifactError } = await supabase
    .from("artifacts")
    .insert({
      course_id: courseId,
      owner_id: user.id,
      storage_path: file.storagePath,
      original_filename: file.originalFilename,
      mime_type: file.mimeType,
      size_bytes: file.sizeBytes,
      status: "queued",
    })
    .select("id")
    .single();

  if (artifactError || !artifact) {
    return { error: artifactError?.message ?? "Failed to record upload." };
  }

  const { data: run, error: runError } = await supabase
    .from("artifact_processing_runs")
    .insert({
      artifact_id: artifact.id,
      owner_id: user.id,
      status: "queued",
      failure_reason: null,
      started_at: null,
      completed_at: null,
    })
    .select("id")
    .single();

  if (runError || !run) {
    return { error: runError?.message ?? "Failed to schedule processing." };
  }

  // Trigger the background task per contracts/server-actions.md's
  // Trigger.dev task contract. Dynamically imported so this module
  // doesn't pull the Trigger.dev SDK's Node-only runtime into any
  // client bundle -- actual triggering only works once a live
  // Trigger.dev project exists (research.md); the task itself
  // (trigger/ingest-artifact.ts) is written and ready.
  const { ingestArtifactTask } = await import("../../../trigger/ingest-artifact.ts");
  await ingestArtifactTask.trigger({
    artifactId: artifact.id,
    processingRunId: run.id,
  });

  return { artifact: { id: artifact.id, status: "queued" } };
}

export async function listArtifacts(courseId: string): Promise<Artifact[]> {
  const supabase = await createClient();

  // No owner_id filter here by design, same reasoning as
  // features/courses/actions.ts's listCourses -- RLS is the only filter.
  const { data, error } = await supabase
    .from("artifacts")
    .select("id, original_filename, status")
    .eq("course_id", courseId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  // failureReason isn't stored on `artifacts` itself (data-model.md keeps
  // it on the run, not the artifact) -- surface the latest run's reason
  // for any artifact currently in "failed" status.
  const failed = data.filter((row) => row.status === "failed");
  const failureReasons = new Map<string, string | null>();

  if (failed.length > 0) {
    const { data: runs } = await supabase
      .from("artifact_processing_runs")
      .select("artifact_id, failure_reason, created_at")
      .in(
        "artifact_id",
        failed.map((row) => row.id),
      )
      .order("created_at", { ascending: false });

    for (const run of runs ?? []) {
      if (!failureReasons.has(run.artifact_id)) {
        failureReasons.set(run.artifact_id, run.failure_reason);
      }
    }
  }

  return data.map((row) => ({
    id: row.id,
    originalFilename: row.original_filename,
    status: row.status,
    failureReason: failureReasons.get(row.id) ?? null,
  }));
}
