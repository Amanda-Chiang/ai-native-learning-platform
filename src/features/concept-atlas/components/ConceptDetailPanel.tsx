"use client";

import { useState } from "react";
import type { MasteryState, RelationshipType } from "@/types/graph/course-graph.ts";
import type { EvidenceType } from "@/types/domain/evidence-event.ts";

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

/**
 * FR-009/FR-014's provenance: what evidence a tier is actually traceable
 * to. `null` explicitly means "no evidence recorded yet" -- never a
 * fabricated-sounding placeholder string standing in for absence of
 * data (learner-graph-evidence's own no-silent-placeholders convention).
 */
export type EvidenceProvenance = { lastEvidenceType: EvidenceType; lastEvidenceAt: string } | null;

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
  evidenceProvenance?: EvidenceProvenance;
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
  evidenceProvenance?: EvidenceProvenance;
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

export function ConceptDetailPanel({
  focused,
  onClose,
  onFlag,
}: {
  focused: Focused;
  onClose: () => void;
  /**
   * Submits a student flag for the currently-focused concept/relationship
   * (course-graph-ingestion's User Story 4). Optional and undefined by
   * default -- this renderer feature stays unaware of
   * course-graph-ingestion's server actions (Constitution Principle I's
   * renderer-neutral boundary); the page/course level wires this to
   * submitFlag.
   */
  onFlag?: (reason: string) => Promise<{ error: string | null }>;
}) {
  return (
    <>
      <style>{PANEL_STYLE}</style>
      <aside className="concept-detail-panel" role="complementary" aria-label="Detail panel">
        <button type="button" onClick={onClose} style={{ float: "right" }} aria-label="Close">
          ×
        </button>
        {focused.kind === "concept" ? (
          <ConceptDetail focused={focused} onFlag={onFlag} />
        ) : (
          <RelationshipDetail focused={focused} onFlag={onFlag} />
        )}
      </aside>
    </>
  );
}

function FlagControl({ onFlag }: { onFlag: (reason: string) => Promise<{ error: string | null }> }) {
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const reason = (new FormData(form).get("reason") as string | null)?.trim() ?? "";
        if (reason.length === 0) return;
        const result = await onFlag(reason);
        if (result.error) {
          setError(result.error);
          setSubmitted(false);
          return;
        }
        setError(null);
        setSubmitted(true);
        form.reset();
      }}
      style={{ marginTop: 12, borderTop: "1px solid #e5e7eb", paddingTop: 8 }}
    >
      <label style={{ fontSize: 12, color: "#6b7280" }}>
        Something wrong here?
        <input
          name="reason"
          placeholder="e.g. this looks like a duplicate"
          style={{ display: "block", width: "100%", marginTop: 4, fontSize: 12 }}
        />
      </label>
      <button type="submit" style={{ fontSize: 12, marginTop: 4 }}>
        Flag
      </button>
      {error && <p style={{ color: "#dc2626", fontSize: 11 }}>{error}</p>}
      {submitted && <p style={{ color: "#16a34a", fontSize: 11 }}>Flag submitted.</p>}
    </form>
  );
}

function EvidenceProvenanceNote({ evidenceProvenance }: { evidenceProvenance?: EvidenceProvenance }) {
  if (evidenceProvenance === undefined) return null;
  if (evidenceProvenance === null) {
    return (
      <p style={{ color: "#6b7280", fontSize: 12 }}>No evidence recorded yet.</p>
    );
  }
  return (
    <p style={{ color: "#6b7280", fontSize: 12 }}>
      Last evidence: {evidenceProvenance.lastEvidenceType} on{" "}
      {new Date(evidenceProvenance.lastEvidenceAt).toLocaleDateString()}
    </p>
  );
}

function ConceptDetail({
  focused,
  onFlag,
}: {
  focused: FocusedConcept;
  onFlag?: (reason: string) => Promise<{ error: string | null }>;
}) {
  return (
    <>
      <h2>{focused.canonicalLabel}</h2>
      {focused.aliases.length > 0 && (
        <p style={{ color: "#6b7280", fontSize: 13 }}>Also known as: {focused.aliases.join(", ")}</p>
      )}
      <p>
        <strong>Mastery:</strong> {focused.masteryState}
      </p>
      <EvidenceProvenanceNote evidenceProvenance={focused.evidenceProvenance} />
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
      {onFlag && <FlagControl onFlag={onFlag} />}
    </>
  );
}

function RelationshipDetail({
  focused,
  onFlag,
}: {
  focused: FocusedRelationship;
  onFlag?: (reason: string) => Promise<{ error: string | null }>;
}) {
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
      <EvidenceProvenanceNote evidenceProvenance={focused.evidenceProvenance} />
      {isWeak && (
        <>
          <h3>Why this is rated weak</h3>
          <p>
            {focused.explanation ??
              "Not enough independent evidence has been recorded connecting these two concepts yet -- this reflects a gap in demonstrated understanding of the connection, not necessarily either concept on its own."}
          </p>
        </>
      )}
      {onFlag && <FlagControl onFlag={onFlag} />}
    </>
  );
}
