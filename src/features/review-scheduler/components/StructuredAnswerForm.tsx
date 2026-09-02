"use client";

import { useState } from "react";
import type { CheckerDomain } from "@/features/visual-assessment/problem-setup.ts";

/**
 * A blank claim-fields template per domain, so the student sees the
 * real fields they need to fill in rather than staring at an empty
 * object -- same bounded set of 5 checker domains deterministic-grading
 * already covers, not a per-subject template. Same "edit the real JSON
 * directly" pattern visual-assessment-graph-tree's own
 * ConfirmExtraction.tsx already established for a structured claim,
 * reused here for typed (not drawn) structured answers.
 */
const CLAIM_TEMPLATE_BY_DOMAIN: Record<CheckerDomain, Record<string, unknown>> = {
  "bfs-dfs": { claimedOrder: [] },
  heap: { claimedExtractedSequence: [], claimedFinalState: [] },
  "tree-traversal": { claimedResult: [] },
  "tree-insertion": { claimedResultTree: null },
  "topological-sort": { claimedOrder: [] },
  "shortest-path": { claimedPath: [], claimedTotalDistance: 0 },
};

export function StructuredAnswerForm({
  checkerDomain,
  onSubmit,
  pending,
}: {
  checkerDomain: CheckerDomain;
  onSubmit: (claimFields: Record<string, unknown>) => void;
  pending: boolean;
}) {
  const [text, setText] = useState(JSON.stringify(CLAIM_TEMPLATE_BY_DOMAIN[checkerDomain], null, 2));
  const [parseError, setParseError] = useState<string | null>(null);

  function handleSubmit() {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      setParseError(null);
      onSubmit(parsed);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: "#6b7280" }}>Fill in your answer below and submit.</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        style={{ width: "100%", fontFamily: "monospace" }}
      />
      {parseError && <p style={{ color: "#dc2626" }}>Not valid: {parseError}</p>}
      <button type="button" onClick={handleSubmit} disabled={pending}>
        Submit
      </button>
    </div>
  );
}
