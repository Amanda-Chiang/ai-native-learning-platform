import Link from "next/link";
import type { DueQueueItem, UrgencyBucket } from "@/features/review-scheduler/due-queue.ts";
import { IconArrow } from "@/components/icons.tsx";

function urgencyStyle(bucket: UrgencyBucket): React.CSSProperties {
  if (bucket === "overdue") return { color: "var(--clay)", background: "var(--clay-muted)", border: "1px solid var(--clay-border)" };
  if (bucket === "today") return { color: "var(--clay)", background: "var(--clay-muted)", border: "1px solid var(--clay-border)", opacity: 0.75 };
  if (bucket === "soon") return { color: "var(--teal)", background: "var(--teal-muted)", border: "1px solid var(--teal-border)" };
  return { color: "var(--denim)", background: "var(--denim-muted)", border: "1px solid var(--denim-border)" };
}

function MasteryBar({ value }: { value: number }) {
  const color = value >= 0.7 ? "var(--teal)" : value >= 0.5 ? "var(--denim)" : "var(--clay)";
  return (
    <div style={{ width: 60, height: 3, background: "var(--border)", borderRadius: 2, overflow: "hidden", flexShrink: 0 }}>
      <div style={{ height: "100%", width: `${Math.round(value * 100)}%`, background: color, borderRadius: 2 }} />
    </div>
  );
}

function Row({ item }: { item: DueQueueItem }) {
  return (
    <div style={s.row}>
      <div style={{ ...s.urgencyTag, ...urgencyStyle(item.urgencyBucket) }}>{item.dueLabel}</div>
      <span style={s.conceptLabel}>{item.label}</span>
      <div style={s.rowRight}>
        <MasteryBar value={item.masteryValue} />
        <span style={s.masteryPct}>{Math.round(item.masteryValue * 100)}%</span>
      </div>
    </div>
  );
}

export function DueQueue({ courseId, items }: { courseId: string; items: DueQueueItem[] }) {
  const dueNow = items.filter((i) => i.urgencyBucket === "overdue" || i.urgencyBucket === "today");
  const upcoming = items.filter((i) => i.urgencyBucket === "soon" || i.urgencyBucket === "upcoming");

  if (items.length === 0) {
    return (
      <div style={s.page}>
        <div style={s.inner}>
          <h1 style={s.title}>Review queue</h1>
          <p style={s.empty}>No concepts to review yet -- once your course material is extracted, they&apos;ll show up here.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.inner}>
        <div style={s.pageHeader}>
          <div>
            <h1 style={s.title}>Review queue</h1>
            <p style={s.subtitle}>
              {dueNow.length} due now · {items.length} total ranked
            </p>
          </div>
          <Link href={`/courses/${courseId}/study`} style={s.startBtn}>
            Start review <IconArrow />
          </Link>
        </div>

        {dueNow.length > 0 && (
          <div style={s.group}>
            <span style={s.groupLabel}>Due now</span>
            {dueNow.map((item) => (
              <Row key={item.conceptId} item={item} />
            ))}
          </div>
        )}

        {upcoming.length > 0 && (
          <div style={s.group}>
            <span style={s.groupLabel}>Upcoming</span>
            {upcoming.map((item) => (
              <Row key={item.conceptId} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { height: "100%", overflowY: "auto", background: "var(--bg)", padding: "36px 40px", display: "flex", justifyContent: "center" },
  inner: { width: "100%", maxWidth: 620, display: "flex", flexDirection: "column", gap: 28 },
  empty: { fontSize: 13.5, color: "var(--text-tertiary)" },
  pageHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-end" },
  title: { margin: 0, fontSize: 20, fontWeight: 500, letterSpacing: "-0.025em", color: "var(--text-primary)" },
  subtitle: { margin: "4px 0 0", fontSize: 13, color: "var(--text-tertiary)", letterSpacing: "-0.005em" },
  startBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "9px 16px",
    background: "var(--clay)",
    color: "var(--clay-fg)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    fontSize: 13.5,
    fontWeight: 500,
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
    letterSpacing: "-0.01em",
  },
  group: { display: "flex", flexDirection: "column", gap: 1 },
  groupLabel: {
    fontSize: 10.5,
    fontWeight: 500,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--text-tertiary)",
    marginBottom: 8,
    display: "block",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "12px 16px",
    background: "var(--surface)",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border)",
    marginBottom: 4,
  },
  urgencyTag: { fontSize: 10.5, fontWeight: 500, letterSpacing: "0.03em", padding: "3px 9px", borderRadius: 20, flexShrink: 0, whiteSpace: "nowrap" },
  conceptLabel: { flex: 1, fontSize: 14, color: "var(--text-primary)", letterSpacing: "-0.01em", fontWeight: 450 },
  rowRight: { display: "flex", alignItems: "center", gap: 10, flexShrink: 0 },
  masteryPct: { fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-tertiary)", minWidth: 28, textAlign: "right" },
};
