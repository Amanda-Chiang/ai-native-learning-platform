import Link from "next/link";
import type { DueQueueItem, UrgencyBucket } from "@/features/review-scheduler/due-queue.ts";
import type { ConnectSessionResult } from "@/features/review-scheduler/connect-session.ts";
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

/**
 * Weekly Connect session (T014) -- moved here from the Study page
 * (StudySession.tsx used to render this directly under the daily
 * questions) per direct product feedback: it read as noise mixed in
 * with the actual answerable session. Positioned as its own absolutely-
 * placed panel (not a flex sibling of `inner`) specifically so it never
 * shifts `inner`'s own centered position -- it only ever occupies the
 * blank space the centered, fixed-max-width due-queue column already
 * leaves on a wide viewport, per direct request that no existing
 * element move.
 */
function ConnectGroup({ label, items }: { label: string; items: string[] }) {
  return (
    <div style={s.connectGroup}>
      <span style={s.connectLabel}>{label}</span>
      {items.length === 0 ? (
        <p style={s.connectEmpty}>None this week.</p>
      ) : (
        <ul style={s.connectList}>
          {items.map((item, i) => (
            <li key={i} style={s.connectItem}>
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Only shown once the viewport is wide enough that it truly lands in
 * blank space and can't overlap `inner`'s own centered column --
 * `inner` is 620px wide and centered inside `page`'s own content box
 * (page width minus its 80px horizontal padding minus the 220px left
 * app-nav sidebar); working that back out, this panel's 280px + its
 * own 40px right inset only ever clears `inner`'s right edge once the
 * browser viewport is >= ~1480px. Controlled by a real CSS media query
 * (not inline style, which can't express one) so a narrower window
 * hides it outright instead of overlapping and blocking clicks on
 * `inner`'s own content underneath -- found live via basic-flows.spec.ts's
 * default 1280px test viewport, which is exactly the overlap case.
 */
const CONNECT_PANEL_MEDIA_QUERY = `
  .due-queue-connect-panel { display: none; }
  @media (min-width: 1480px) {
    .due-queue-connect-panel { display: flex; }
  }
`;

function ConnectPanel({ connect, conceptNames }: { connect: ConnectSessionResult; conceptNames: Record<string, string> }) {
  // "Unknown concept" rather than the raw id when a name genuinely
  // doesn't resolve (no-silent-placeholders) -- same fallback
  // TodayDashboard's own conceptNames lookup already established.
  const name = (conceptId: string) => conceptNames[conceptId] ?? "Unknown concept";

  return (
    <aside className="due-queue-connect-panel" style={s.connectPanel}>
      <style>{CONNECT_PANEL_MEDIA_QUERY}</style>
      <div style={s.connectPanelHeader}>
        <span style={s.connectPanelTitle}>Connect</span>
      </div>
      <ConnectGroup label="New this week" items={connect.newConcepts.map((c) => name(c.conceptId))} />
      <ConnectGroup
        label="Still-weak connections to new material"
        items={connect.weakConnections.map((c) => `${name(c.sourceConceptId)} → ${name(c.targetConceptId)}`)}
      />
      <ConnectGroup
        label="Concepts worth connecting to the rest of the course"
        items={connect.lowConnectivityConcepts.map((c) => name(c.conceptId))}
      />
      <ConnectGroup
        label="Commonly confused pairs"
        items={connect.confusedPairs.map((c) => `${name(c.conceptAId)} vs ${name(c.conceptBId)}`)}
      />
    </aside>
  );
}

export function DueQueue({
  courseId,
  items,
  connect,
  conceptNames,
}: {
  courseId: string;
  items: DueQueueItem[];
  connect: ConnectSessionResult;
  conceptNames: Record<string, string>;
}) {
  const dueNow = items.filter((i) => i.urgencyBucket === "overdue" || i.urgencyBucket === "today");
  const upcoming = items.filter((i) => i.urgencyBucket === "soon" || i.urgencyBucket === "upcoming");

  if (items.length === 0) {
    return (
      <div style={s.page}>
        <div style={s.inner}>
          <h1 style={s.title}>Review queue</h1>
          <p style={s.empty}>No concepts to review yet -- once your course material is extracted, they&apos;ll show up here.</p>
        </div>
        <ConnectPanel connect={connect} conceptNames={conceptNames} />
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
      <ConnectPanel connect={connect} conceptNames={conceptNames} />
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  // position: relative -- ConnectPanel anchors to this box's own edges
  // (position: absolute), independent of `inner`'s centered flex flow,
  // so adding it can never shift `inner`.
  page: { height: "100%", overflowY: "auto", background: "var(--bg)", padding: "36px 40px", display: "flex", justifyContent: "center", position: "relative" },
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
  // Absolutely positioned against `page` (not a flex sibling of
  // `inner`) so it only ever fills the blank space beside the centered
  // due-queue column on a wide viewport -- it can't push or shift
  // `inner` regardless of its own content length. `--right-w` (280px)
  // reuses the same fixed sidebar width TodayDashboard's own "Upcoming"
  // sidebar already established, for visual consistency.
  // No `display` here on purpose -- CONNECT_PANEL_MEDIA_QUERY's class
  // rule controls display (none below 1480px, flex at/above it), and an
  // inline `display` would always win over that media query.
  connectPanel: {
    position: "absolute",
    top: 36,
    right: 40,
    width: "var(--right-w)",
    maxHeight: "calc(100% - 72px)",
    overflowY: "auto",
    flexDirection: "column",
    gap: 16,
  },
  connectPanelHeader: { padding: 0 },
  connectPanelTitle: {
    fontSize: 10.5,
    fontWeight: 500,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--text-tertiary)",
  },
  connectGroup: { display: "flex", flexDirection: "column", gap: 6 },
  connectLabel: { fontSize: 10.5, fontWeight: 500, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-tertiary)" },
  connectEmpty: { margin: 0, fontSize: 12.5, color: "var(--text-tertiary)" },
  connectList: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 },
  connectItem: { fontSize: 13, color: "var(--text-secondary)" },
};
