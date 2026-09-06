"use server";

import { createClient } from "@/lib/supabase/server.ts";

export type ExtractionStatusView = {
  artifactId: string;
  runId: string;
  status: "queued" | "processing" | "completed" | "failed";
  failureReason: string | null;
  conceptsExtracted: number;
  unitsCreatedOrMatched: number;
};

/**
 * The latest extraction_runs row per artifact. The filename is
 * deliberately NOT joined in here: ArtifactBoard, the only consumer,
 * renders it from its own live `artifacts` state, so joining it a second
 * time meant an extra query per course page load whose only other effect
 * was a `?? artifactId` raw-UUID stand-in for a filename that failed to
 * resolve. An artifact with no
 * extraction_runs row at all (upload still queued/processing at the
 * artifacts-table level, extraction hasn't started yet) is simply
 * absent from this list -- not fabricated as a fake "queued" status,
 * since there's no real row to report on yet.
 *
 * `unitsCreatedOrMatched` counts reconciliation_decisions rows for
 * this run with candidate_kind = 'unit': every candidate unit the
 * extraction proposed either got merged into an existing unit
 * (decision = 'merge') or was inserted as a new proposed unit
 * (decision = 'distinct' | 'uncertain', per
 * trigger/extract-course-graph.ts's resolveUnitReferences -- anything
 * that isn't a merge is an insert). Either outcome is a real unit now
 * associated with the course, so both count toward this total; there's
 * no separate "units created" vs "units matched" counter stored
 * anywhere, and this project's no-silent-placeholder rule means we
 * derive it from the real reconciliation_decisions rows rather than
 * inventing a number.
 */
export async function getExtractionStatuses(courseId: string): Promise<ExtractionStatusView[]> {
  const supabase = await createClient();

  const { data: runs, error } = await supabase
    .from("extraction_runs")
    .select("id, artifact_id, status, failure_reason, concepts_extracted, created_at")
    .eq("course_id", courseId)
    .order("created_at", { ascending: false });

  if (error || !runs || runs.length === 0) return [];

  const latestByArtifact = new Map<string, (typeof runs)[number]>();
  for (const run of runs) {
    if (!latestByArtifact.has(run.artifact_id)) {
      latestByArtifact.set(run.artifact_id, run);
    }
  }

  const runIds = [...latestByArtifact.values()].map((run) => run.id);

  const { data: unitDecisions } = await supabase
    .from("reconciliation_decisions")
    .select("extraction_run_id")
    .eq("candidate_kind", "unit")
    .in("extraction_run_id", runIds);

  const unitCountByRunId = new Map<string, number>();
  for (const decision of unitDecisions ?? []) {
    unitCountByRunId.set(decision.extraction_run_id, (unitCountByRunId.get(decision.extraction_run_id) ?? 0) + 1);
  }

  return [...latestByArtifact.entries()].map(([artifactId, run]) => ({
    artifactId,
    runId: run.id,
    status: run.status,
    failureReason: run.failure_reason,
    conceptsExtracted: run.concepts_extracted,
    unitsCreatedOrMatched: unitCountByRunId.get(run.id) ?? 0,
  }));
}
