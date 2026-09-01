import type { MasteryState, RelationshipType } from "@/types/graph/course-graph.ts";

/**
 * One component, responsive container -- side panel on desktop, bottom
 * sheet on mobile/tablet via the CSS media query below, per
 * research.md's "same component, different container" decision
 * (interaction-states.md specifies identical content in both places, so
 * duplicating the content-rendering logic across two components would
 * only create a place for them to drift apart).
 *
 * Handles two kinds of focus: a concept (US3) or a relationship (US4) --
 * one panel component, not two, for the same reason.
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

export type FocusedRelationship = {
  kind: "relationship";
  id: string;
  type: RelationshipType;
  fromConceptLabel: string;
  toConceptLabel: string;
  learnerState: "weak" | "strong";
  /**
   * Why this relationship is rated as it is (spec FR-011). Undefined
   * when no real evidence-backed reasoning has been recorded yet -- the
   * panel shows a generic fallback rather than inventing something
   * specific-sounding that isn't backed by anything real
   * (course-graph.ts's Relationship.explanation doc comment).
   */
  explanation?: string;
};

export type Focused = FocusedConcept | FocusedRelationship;

const PANEL_STYLE = `
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
`;

export function ConceptDetailPanel({ focused, onClose }: { focused: Focused; onClose: () => void }) {
  return (
    <>
      <style>{PANEL_STYLE}</style>
      <aside className="concept-detail-panel" role="complementary" aria-label="Detail panel">
        <button type="button" onClick={onClose} style={{ float: "right" }} aria-label="Close">
          ×
        </button>
        {focused.kind === "concept" ? (
          <ConceptDetail focused={focused} />
        ) : (
          <RelationshipDetail focused={focused} />
        )}
      </aside>
    </>
  );
}

function ConceptDetail({ focused }: { focused: FocusedConcept }) {
  return (
    <>
      <h2>{focused.canonicalLabel}</h2>
      {focused.aliases.length > 0 && (
        <p style={{ color: "#6b7280", fontSize: 13 }}>Also known as: {focused.aliases.join(", ")}</p>
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
    </>
  );
}

function RelationshipDetail({ focused }: { focused: FocusedRelationship }) {
  const isWeak = focused.learnerState === "weak";
  return (
    <>
      <h2>
        {focused.fromConceptLabel} → {focused.toConceptLabel}
      </h2>
      <p style={{ color: "#6b7280", fontSize: 13 }}>Relationship type: {focused.type}</p>
      <p>
        <strong>Status:</strong>{" "}
        <span style={{ color: isWeak ? "#d97706" : "#16a34a" }}>{focused.learnerState}</span>
      </p>
      {isWeak && (
        <>
          <h3>Why this is rated weak</h3>
          <p>
            {focused.explanation ??
              "Not enough independent evidence has been recorded connecting these two concepts yet -- this reflects a gap in demonstrated understanding of the connection, not necessarily either concept on its own."}
          </p>
        </>
      )}
    </>
  );
}
