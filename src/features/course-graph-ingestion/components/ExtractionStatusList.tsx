"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client.ts";
import type { ExtractionStatusView } from "@/features/course-graph-ingestion/extraction-status.ts";

const STATUS_COLOR: Record<ExtractionStatusView["status"], { bg: string; color: string }> = {
  completed: { bg: "var(--teal-muted)", color: "var(--teal)" },
  processing: { bg: "var(--denim-muted)", color: "var(--denim)" },
  queued: { bg: "var(--border)", color: "var(--text-tertiary)" },
  failed: { bg: "var(--clay-muted)", color: "var(--clay)" },
};

/**
 * Client Component: a live-updating extraction-status list, mirroring
 * `ArtifactBoard`'s Supabase Realtime pattern (FR-011, "updates without
 * manual reload"). Found live during Task 13's walkthrough: this
 * component originally received `statuses` as a static server-fetched
 * prop with no subscription at all, so a real upload's
 * queued -> processing -> failed transition in the database never
 * appeared on screen until the page was manually reloaded.
 *
 * Subscribes to `extraction_runs` filtered by `course_id`. Two cases
 * need a small follow-up query rather than relying on the Realtime
 * payload alone, since the payload only carries `extraction_runs`
 * columns:
 *
 * 1. A run for an artifact_id not yet in the list (a brand-new
 *    extraction run) has no filename in the payload -- `artifacts` is a
 *    different table. We look up `original_filename` for that one
 *    artifact_id, falling back to the raw id only if that lookup itself
 *    comes back empty (matching `getExtractionStatuses`'s own fallback),
 *    never fabricating a name.
 * 2. A run that just transitioned to `completed` needs
 *    `unitsCreatedOrMatched`, which isn't a column on `extraction_runs`
 *    at all -- it's derived by counting `reconciliation_decisions` rows
 *    for that run with `candidate_kind = 'unit'`, exactly as
 *    `getExtractionStatuses` already computes it server-side. Leaving it
 *    at a stale/zero value for a live-arrived completed row would
 *    silently under-report real data, so we re-run that same count
 *    scoped to the one run instead.
 */
export function ExtractionStatusList({
  courseId,
  initialStatuses,
}: {
  courseId: string;
  initialStatuses: ExtractionStatusView[];
}) {
  const [statuses, setStatuses] = useState(initialStatuses);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`extraction-runs-course-${courseId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "extraction_runs", filter: `course_id=eq.${courseId}` },
        async (payload) => {
          const row = payload.new as {
            id: string;
            artifact_id: string;
            status: ExtractionStatusView["status"];
            failure_reason: string | null;
            concepts_extracted: number;
          };

          let unitsCreatedOrMatched = 0;
          if (row.status === "completed") {
            const { count } = await supabase
              .from("reconciliation_decisions")
              .select("id", { count: "exact", head: true })
              .eq("candidate_kind", "unit")
              .eq("extraction_run_id", row.id);
            unitsCreatedOrMatched = count ?? 0;
          }

          setStatuses((current) => {
            const existingIndex = current.findIndex((s) => s.artifactId === row.artifact_id);
            if (existingIndex === -1) {
              // Brand-new run for an artifact we haven't shown yet -- add it
              // once its filename lookup resolves, rather than rendering a
              // row with no name.
              void (async () => {
                const { data: artifact } = await supabase
                  .from("artifacts")
                  .select("original_filename")
                  .eq("id", row.artifact_id)
                  .maybeSingle();
                const newEntry: ExtractionStatusView = {
                  artifactId: row.artifact_id,
                  artifactFilename: artifact?.original_filename ?? row.artifact_id,
                  status: row.status,
                  failureReason: row.failure_reason,
                  conceptsExtracted: row.concepts_extracted,
                  unitsCreatedOrMatched,
                };
                setStatuses((latest) => {
                  if (latest.some((s) => s.artifactId === row.artifact_id)) return latest;
                  return [newEntry, ...latest];
                });
              })();
              return current;
            }
            const next = [...current];
            next[existingIndex] = {
              ...next[existingIndex],
              status: row.status,
              failureReason: row.failure_reason,
              conceptsExtracted: row.concepts_extracted,
              unitsCreatedOrMatched:
                row.status === "completed" ? unitsCreatedOrMatched : next[existingIndex].unitsCreatedOrMatched,
            };
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [courseId]);

  if (statuses.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
        Extraction status
      </h2>
      {statuses.map((s) => (
        <div
          key={s.artifactId}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 14px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <span style={{ flex: 1, fontSize: 13.5, color: "var(--text-primary)" }}>{s.artifactFilename}</span>
          {s.status === "completed" && (
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              {s.conceptsExtracted} concepts &middot; {s.unitsCreatedOrMatched} units
            </span>
          )}
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 500,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              padding: "2px 8px",
              borderRadius: 20,
              background: STATUS_COLOR[s.status].bg,
              color: STATUS_COLOR[s.status].color,
            }}
          >
            {s.status}
          </span>
        </div>
      ))}
      {statuses.some((s) => s.status === "failed") && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {statuses
            .filter((s) => s.status === "failed")
            .map((s) => (
              <p key={s.artifactId} style={{ margin: 0, fontSize: 12, color: "var(--clay)" }}>
                {s.artifactFilename}: {s.failureReason}
              </p>
            ))}
        </div>
      )}
    </div>
  );
}
