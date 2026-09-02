import {
  rankConceptsByPriority,
  DEFAULT_REVIEW_PRIORITY_WEIGHTS,
  type ConceptPriorityInput,
  type ConceptPriority,
} from "../review-scheduler/review-priority.ts";
import type { LearnerEdgeState } from "../learner-graph-evidence/actions.ts";
import type { WeakConnectionItem } from "../review-scheduler/connect-session.ts";

export type ScopedConceptInput = ConceptPriorityInput;

export type ScopedEdgeInput = {
  edgeId: string;
  sourceConceptId: string;
  targetConceptId: string;
  learnerState: LearnerEdgeState;
};

/**
 * Diagnostic and final-weakness are the *same* call --
 * review-scheduler's own rankConceptsByPriority, restricted to the
 * exam's scope (research.md "Three of four stages are
 * review-scheduler's existing selection, scope-restricted") -- kept as
 * two named exports for call-site clarity in plan-composition.ts, not
 * two algorithms. Calling it again later in the exam (final-weakness)
 * naturally surfaces different concepts than the first call
 * (diagnostic) because real practice has happened in between, without
 * this function needing to know which stage it's being called for.
 */
export function selectDiagnosticConcepts(
  scoped: ScopedConceptInput[],
  now: Date,
  limit: number,
): ConceptPriority[] {
  return rankConceptsByPriority(scoped, now, DEFAULT_REVIEW_PRIORITY_WEIGHTS).slice(0, limit);
}

export function selectFinalWeaknessConcepts(
  scoped: ScopedConceptInput[],
  now: Date,
  limit: number,
): ConceptPriority[] {
  return rankConceptsByPriority(scoped, now, DEFAULT_REVIEW_PRIORITY_WEIGHTS).slice(0, limit);
}

/**
 * The interleaving stage's real question is "do you know how these
 * IN-SCOPE concepts connect" -- reuses the same weak-edge predicate
 * composeConnectSession already established
 * (learnerState.learnerState === "weak"), but with "both endpoints in
 * scope" in place of composeConnectSession's "new material" framing,
 * which doesn't apply here (research.md).
 */
export function selectInterleavingEdges(scopedEdges: ScopedEdgeInput[]): WeakConnectionItem[] {
  return scopedEdges
    .filter((e) => e.learnerState.learnerState === "weak")
    .map((e) => ({ edgeId: e.edgeId, sourceConceptId: e.sourceConceptId, targetConceptId: e.targetConceptId }));
}

/**
 * A spread across the scope's mastery range, not only the
 * highest-priority concepts -- a realistic mixed practice set for the
 * exam-style stage, not a repeat of the diagnostic stage's narrow
 * weakest-first focus.
 */
export function selectTimedMixedConcepts(
  scoped: ScopedConceptInput[],
  now: Date,
  limit: number,
): ConceptPriority[] {
  const ranked = rankConceptsByPriority(scoped, now, DEFAULT_REVIEW_PRIORITY_WEIGHTS);
  if (ranked.length <= limit) return ranked;
  if (limit <= 1) return ranked.slice(0, limit);

  // Evenly spaced indices spanning the full ranked list -- including
  // both endpoints -- so the spread covers both weak and strong
  // concepts rather than clustering at one end.
  const step = (ranked.length - 1) / (limit - 1);
  const spread: ConceptPriority[] = [];
  for (let i = 0; i < limit; i++) {
    spread.push(ranked[Math.round(i * step)]);
  }
  return spread;
}
