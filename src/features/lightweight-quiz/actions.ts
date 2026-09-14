"use server";

import { createClient } from "@/lib/supabase/server.ts";
import { isExtractionRunFullyReviewed } from "@/features/lightweight-quiz/run-completion.ts";

/**
 * Calls straight into trigger/generate-lightweight-quiz.ts's real work
 * (executeMcqGeneration), not `.trigger()` -- unlike
 * assessment-generation-pipeline's own requestQuestionGeneration, which
 * still goes through the (currently inert, no live Trigger.dev project)
 * queue. That's a deliberate, flagged exception: this feature's entire
 * point is that generation actually happens automatically, and going
 * through the same inert queue would silently reproduce the exact gap
 * this feature exists to close. The service-role client itself still
 * only ever gets constructed inside that trigger/ file (never here) --
 * this file just calls its exported function, the same shape
 * confirmCandidate already uses to call into shared cascade logic.
 * Fire-and-forget: callers don't block their own response on a
 * multi-second-to-tens-of-seconds OpenAI sequence. Dynamically imported
 * so this module doesn't pull the Trigger.dev SDK's Node-only runtime
 * into any client bundle (same pattern
 * assessment-generation-pipeline/actions.ts already established).
 */
async function triggerGenerationIfEligible(courseId: string, extractionRunId: string): Promise<void> {
  const { executeMcqGeneration } = await import("../../../trigger/generate-lightweight-quiz.ts");
  try {
    await executeMcqGeneration({ courseId, extractionRunId });
  } catch (err) {
    console.error(
      `[lightweight-quiz] generation failed for run ${extractionRunId}:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Signal 1 of 2 (design doc "Trigger: either of two signals"): the
 * student dismisses the review popup for this run. Called from
 * ReviewQueue.tsx's closeModal -- fire-and-forget, the popup itself
 * already closes client-side regardless of this call's outcome.
 * Idempotent via executeMcqGeneration's own atomic claim on
 * extraction_runs.quiz_generated_at, so this is always safe to call
 * even if signal 2 already fired for the same run.
 */
export async function dismissReviewRun(courseId: string, extractionRunId: string): Promise<void> {
  void triggerGenerationIfEligible(courseId, extractionRunId);
}

/**
 * Signal 2 of 2: every concept/unit from an extraction run has left
 * 'proposed'. Called from course-graph-ingestion's confirmCandidate/
 * rejectCandidate (concept/unit branches only -- edges don't gate this)
 * after their own status mutation (and cascade) completes.
 */
export async function maybeGenerateLightweightQuizAfterReviewChange(
  supabase: Awaited<ReturnType<typeof createClient>>,
  kind: "concept" | "unit",
  id: string,
): Promise<void> {
  const table = kind === "concept" ? "course_concepts" : "course_units";
  const { data: row } = await supabase.from(table).select("course_id, extraction_run_id").eq("id", id).single();
  if (!row?.extraction_run_id) return;

  const [conceptsRes, unitsRes] = await Promise.all([
    supabase
      .from("course_concepts")
      .select("id", { count: "exact", head: true })
      .eq("extraction_run_id", row.extraction_run_id)
      .eq("status", "proposed"),
    supabase
      .from("course_units")
      .select("id", { count: "exact", head: true })
      .eq("extraction_run_id", row.extraction_run_id)
      .eq("status", "proposed"),
  ]);

  if (!isExtractionRunFullyReviewed(conceptsRes.count ?? 0, unitsRes.count ?? 0)) return;

  void triggerGenerationIfEligible(row.course_id, row.extraction_run_id);
}
