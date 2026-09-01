import { task } from "@trigger.dev/sdk";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types.ts";
import { isValidStatusTransition } from "../src/features/artifacts/status.ts";
import { extractCourseGraphTask } from "./extract-course-graph.ts";

/**
 * Trigger.dev task contract: specs/002-account-course-artifact-foundation/contracts/server-actions.md
 *
 * Runs as a Supabase service-role client (bypasses RLS by design -- this
 * task acts on behalf of the system, not any single student's session).
 */
function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export type IngestArtifactPayload = {
  artifactId: string;
  processingRunId: string;
};

export const ingestArtifactTask = task({
  id: "ingest-artifact",
  run: async (payload: IngestArtifactPayload) => {
    const supabase = createAdminClient();

    // Idempotency guard (research.md): re-read the run's current status
    // before doing anything. A retried/resumed task that already reached
    // a terminal status exits without re-processing.
    const { data: run, error: runFetchError } = await supabase
      .from("artifact_processing_runs")
      .select("id, status, artifact_id")
      .eq("id", payload.processingRunId)
      .single();

    if (runFetchError || !run) {
      throw new Error(`Processing run ${payload.processingRunId} not found`);
    }

    if (run.status === "ready" || run.status === "failed") {
      return { skipped: true, reason: "already terminal" };
    }

    if (!isValidStatusTransition(run.status, "processing")) {
      throw new Error(`Cannot transition run ${run.id} from ${run.status} to processing`);
    }

    await supabase
      .from("artifact_processing_runs")
      .update({ status: "processing", started_at: new Date().toISOString() })
      .eq("id", run.id);
    await supabase
      .from("artifacts")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", payload.artifactId);

    const { data: artifact, error: artifactFetchError } = await supabase
      .from("artifacts")
      .select("course_id, storage_path, mime_type, size_bytes")
      .eq("id", payload.artifactId)
      .single();

    let finalStatus: "ready" | "failed" = "ready";
    let failureReason: string | null = null;

    if (artifactFetchError || !artifact) {
      finalStatus = "failed";
      failureReason = "Could not find the uploaded file's record.";
    } else {
      // Deterministic validation only (Constitution Principle IV): confirm
      // the file actually exists in Storage and is readable. Content
      // interpretation (concept extraction) is explicitly out of scope
      // for this feature (spec FR-010) -- Phase 2's job, not this one.
      const { data: fileList, error: storageError } = await supabase.storage
        .from("course-artifacts")
        .list(artifact.storage_path.split("/").slice(0, -1).join("/"));

      const fileName = artifact.storage_path.split("/").pop();
      const fileExists = fileList?.some((f) => f.name === fileName) ?? false;

      if (storageError || !fileExists) {
        finalStatus = "failed";
        failureReason = "The uploaded file could not be found in storage.";
      }
    }

    const nowIso = new Date().toISOString();

    await supabase
      .from("artifact_processing_runs")
      .update({ status: finalStatus, failure_reason: failureReason, completed_at: nowIso })
      .eq("id", run.id);
    await supabase
      .from("artifacts")
      .update({ status: finalStatus, updated_at: nowIso })
      .eq("id", payload.artifactId);

    // Course-graph-ingestion (Phase 2's other half) starts only once an
    // artifact is confirmed readable -- a separate task, not folded into
    // this one, so a retried ingest-artifact run can't re-trigger
    // extraction and this task's own tests/contract stay unaffected by
    // needing an OpenAI key (research.md "Chaining onto Phase 1's
    // ingest-artifact task").
    if (finalStatus === "ready" && artifact) {
      await extractCourseGraphTask.trigger({
        artifactId: payload.artifactId,
        courseId: artifact.course_id,
      });
    }

    return { status: finalStatus, failureReason };
  },
});
