/**
 * Pure decision logic for the confirm-time half of edge auto-confirm
 * (2026-09-05 amendment to FR-006, specs/004-course-graph-ingestion/spec.md
 * -- edges have no manual review of their own; instead, the moment a
 * reviewer confirms a concept, every 'proposed' edge touching it is
 * re-checked and auto-confirms if its OTHER endpoint is already
 * 'confirmed' too). Factored out of actions.ts's autoConfirmEligibleEdges
 * into their own file, with no "@/"-aliased imports, specifically so they
 * stay loadable and testable without a live Supabase client or Next.js
 * request context (same reason review-queue-priority.ts in this directory
 * was split out) -- see
 * tests/unit/course-graph-ingestion/edge-auto-confirm.test.ts.
 */

/**
 * Given an edge's two endpoint concept ids and the id of the concept that
 * was just confirmed (guaranteed by the caller's query to be one of this
 * edge's two endpoints), resolves which id is the OTHER endpoint -- the
 * one whose status still needs to be checked before this edge can
 * auto-confirm.
 */
export function resolveOtherEndpoint(
  edge: { source_concept_id: string; target_concept_id: string },
  confirmedConceptId: string,
): string {
  return edge.source_concept_id === confirmedConceptId ? edge.target_concept_id : edge.source_concept_id;
}

/**
 * Decides whether the OTHER endpoint's status (already resolved by
 * resolveOtherEndpoint and looked up by the caller) is itself 'confirmed'
 * -- the second half of the "both endpoints confirmed" invariant shared
 * with extract-course-graph.ts's shouldEdgeAutoConfirm (the just-confirmed
 * endpoint is confirmed by construction here; only the other one is still
 * in question). `undefined` covers a status lookup that found no row
 * (e.g. the concept was deleted between the candidateEdges query and this
 * lookup), treated as "not confirmed" rather than throwing, for the same
 * defensive reason as shouldEdgeAutoConfirm.
 */
export function shouldAutoConfirmEdge(otherEndpointStatus: string | undefined): boolean {
  return otherEndpointStatus === "confirmed";
}
