import type { MasteryState, RelationshipType } from "@/types/graph/course-graph.ts";

/**
 * One component, responsive container -- side panel on desktop, bottom
 * sheet on mobile/tablet via the CSS media query below, per
 * research.md's "same component, different container" decision
 * (interaction-states.md specifies identical content in both places, so
 * duplicating the content-rendering logic across two components would
 * only create a place for them to drift apart).
 *
 * Extended in US4 (T026) to also accept a focused relationship, not only
 * a focused concept -- kept as one panel component for the same reason.
 */

export type RelatedRelationship = {
  id: string;
  type: RelationshipType;
  direction: "outgoing" | "incoming";
  otherConceptId: string;
  otherConceptLabel: string;
  learnerState: "weak" | "strong";
};

export type FocusedConcept = {
  kind: "concept";
  id: string;
  canonicalLabel: string;
  aliases: string[];
  masteryState: MasteryState;
  relationships: RelatedRelationship[];
};

export function ConceptDetailPanel({
  focused,
  onClose,
}: {
  focused: FocusedConcept;
  onClose: () => void;
}) {
  return (
    <>
      <style>{`
        .concept-detail-panel {
          position: fixed;
          top: 0;
          right: 0;
          height: 100%;
          width: 320px;
          background: white;
          borderLeft: 1px solid #e5e7eb;
          box-shadow: -2px 0 8px rgba(0, 0, 0, 0.08);
          overflow-y: auto;
          padding: 16px;
          box-sizing: border-box;
        }
        @media (max-width: 768px) {
          .concept-detail-panel {
            top: auto;
            bottom: 0;
            left: 0;
            right: 0;
            height: auto;
            max-height: 50vh;
            width: 100%;
            box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.08);
          }
        }
      `}</style>
      <aside className="concept-detail-panel" role="complementary" aria-label="Concept detail">
        <button type="button" onClick={onClose} style={{ float: "right" }} aria-label="Close">
          ×
        </button>
        <h2>{focused.canonicalLabel}</h2>
        {focused.aliases.length > 0 && (
          <p style={{ color: "#6b7280", fontSize: 13 }}>
            Also known as: {focused.aliases.join(", ")}
          </p>
        )}
        <p>
          <strong>Mastery:</strong> {focused.masteryState}
        </p>
        <h3>Relationships</h3>
        {focused.relationships.length === 0 ? (
          <p>No relationships recorded yet.</p>
        ) : (
          <ul>
            {focused.relationships.map((rel) => (
              <li key={rel.id}>
                {rel.direction === "outgoing"
                  ? `${rel.type} → ${rel.otherConceptLabel}`
                  : `${rel.otherConceptLabel} → ${rel.type}`}{" "}
                <span style={{ fontSize: 11, color: rel.learnerState === "weak" ? "#d97706" : "#16a34a" }}>
                  ({rel.learnerState})
                </span>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </>
  );
}
