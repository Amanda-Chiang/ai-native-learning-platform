import type { DueQueueItem } from "@/features/review-scheduler/due-queue.ts";
import { PendingActionButton } from "@/features/courses/components/PendingActionButton.tsx";

const QUICK_REVIEW_PENDING = "Quick review is not built yet";

/**
 * "Due today" / "Due tomorrow" cards. The labels are not computed here:
 * due-queue-bucketing.ts's `bucketFor` already returns exactly the
 * strings "Due today" and "Due tomorrow" for daysUntilDue 0 and 1, so
 * this reuses `dueLabel` verbatim rather than re-deriving a second,
 * divergent copy of the same rule.
 */
export function DueRail({ items }: { items: DueQueueItem[] }) {
  const due = items.filter((i) => i.urgencyBucket === "today" || i.urgencyBucket === "overdue");

  return (
    <aside style={s.rail} aria-label="Due for review">
      {due.length === 0 ? (
        <p style={s.empty}>Nothing due right now.</p>
      ) : (
        due.map((item) => (
          <div key={item.conceptId} style={s.card}>
            <div style={s.cardText}>
              <span style={s.cardLabel}>{item.label}</span>
              <span style={s.cardDue}>{item.dueLabel}</span>
            </div>
            <PendingActionButton reason={QUICK_REVIEW_PENDING} />
          </div>
        ))
      )}
    </aside>
  );
}

const s: Record<string, React.CSSProperties> = {
  rail: { width: 240, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 },
  empty: { margin: 0, fontSize: 13, color: "var(--text-tertiary)" },
  card: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "10px 12px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
  },
  cardText: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
  cardLabel: { fontSize: 13.5, fontWeight: 500, color: "var(--text-primary)" },
  cardDue: { fontSize: 12, color: "var(--text-secondary)" },
};
