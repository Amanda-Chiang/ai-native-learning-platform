import type { ExtractionStatusView } from "@/features/course-graph-ingestion/extraction-status.ts";

const STATUS_COLOR: Record<ExtractionStatusView["status"], { bg: string; color: string }> = {
  completed: { bg: "var(--teal-muted)", color: "var(--teal)" },
  processing: { bg: "var(--denim-muted)", color: "var(--denim)" },
  queued: { bg: "var(--border)", color: "var(--text-tertiary)" },
  failed: { bg: "var(--clay-muted)", color: "var(--clay)" },
};

export function ExtractionStatusList({ statuses }: { statuses: ExtractionStatusView[] }) {
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
