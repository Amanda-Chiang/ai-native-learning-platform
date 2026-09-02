"use client";

import { useState } from "react";

/**
 * Low-confidence confirmation UI (User Story 2, FR-005/FR-006). Shows
 * the real extracted claim fields in plain JSON and lets the student
 * either confirm as-is or edit the actual values before grading --
 * a generic, domain-agnostic correction surface (editing the real
 * extracted structure directly) rather than five bespoke per-domain
 * widgets, since the claim fields are already small, simple
 * arrays/objects regardless of which checker domain produced them.
 */
export function ConfirmExtraction({
  claimFields,
  confidence,
  onConfirm,
  pending,
}: {
  claimFields: Record<string, unknown>;
  confidence: number;
  onConfirm: (confirmedClaimFields: Record<string, unknown>) => void;
  pending: boolean;
}) {
  const [text, setText] = useState(JSON.stringify(claimFields, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);

  function handleConfirm() {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      setParseError(null);
      onConfirm(parsed);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div style={{ border: "2px solid #b45309", padding: 12 }}>
      <p>I may have read your drawing incorrectly (confidence: {Math.round(confidence * 100)}%). Here&apos;s what I saw -- confirm it&apos;s accurate, or correct it below:</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        style={{ width: "100%", fontFamily: "monospace" }}
      />
      {parseError && <p style={{ color: "#dc2626" }}>Not valid: {parseError}</p>}
      <button type="button" onClick={handleConfirm} disabled={pending}>
        Confirm and grade
      </button>
    </div>
  );
}
