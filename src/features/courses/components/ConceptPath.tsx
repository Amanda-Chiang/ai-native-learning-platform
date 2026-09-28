import type { ConceptPathSection, ConceptMasteryState } from "@/features/courses/concept-path.ts";
import { PendingActionButton } from "@/features/courses/components/PendingActionButton.tsx";

const DEEP_REVIEW_PENDING = "Deep review is not built yet";

/** Mastery is shown as a word, not only a color -- color alone would
 *  carry the whole meaning for a state this important. */
const MASTERY_LABEL: Record<ConceptMasteryState, string> = {
  unverified: "Not started",
  exposed: "Seen",
  weak: "Weak",
  solid: "Solid",
};

const MASTERY_COLOR: Record<ConceptMasteryState, string> = {
  unverified: "var(--text-tertiary)",
  exposed: "var(--accent-secondary)",
  weak: "var(--status-warning)",
  solid: "var(--status-success)",
};

export function ConceptPath({ sections }: { sections: ConceptPathSection[] }) {
  if (sections.length === 0) {
    return (
      <p style={s.empty}>
        No concepts yet. Upload course material and Orca will extract them.
      </p>
    );
  }

  return (
    <div style={s.path}>
      {sections.map((section) => (
        <section key={section.unitId ?? "unassigned"} style={s.section}>
          <h2 style={s.unitTitle}>{section.title}</h2>
          <ul style={s.list}>
            {section.concepts.map((concept) => (
              <li key={concept.id} style={s.row}>
                <div style={s.rowText}>
                  <span style={s.conceptName}>{concept.name}</span>
                  <span style={{ ...s.mastery, color: MASTERY_COLOR[concept.masteryState] }}>
                    {MASTERY_LABEL[concept.masteryState]}
                  </span>
                </div>
                <PendingActionButton reason={DEEP_REVIEW_PENDING} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  path: { display: "flex", flexDirection: "column", gap: 28, flex: 1, minWidth: 0 },
  empty: { margin: 0, fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.55 },
  section: { display: "flex", flexDirection: "column", gap: 10 },
  unitTitle: {
    margin: 0,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-tertiary)",
  },
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "12px 14px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
  },
  rowText: { display: "flex", flexDirection: "column", gap: 3, minWidth: 0 },
  conceptName: { fontSize: 14, fontWeight: 500, color: "var(--text-primary)", letterSpacing: "-0.01em" },
  mastery: { fontSize: 12, fontWeight: 500 },
};
