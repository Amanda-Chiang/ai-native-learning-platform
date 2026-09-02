import type { LearnerConceptState } from "../learner-graph-evidence/actions.ts";

export type ReadinessSnapshot = {
  solid: string[];
  weak: string[];
  exposed: string[];
  unverified: string[];
  /** lastEvidenceAt === null -- distinct from "unverified" (FR-008/
   * SC-003: never conflated with an ordinary weak/unverified concept). */
  untouched: string[];
  /** Orthogonal to the tier buckets above -- a concept can appear here
   * AND in its tier bucket simultaneously (FR-008 requires the
   * misconception to be distinctly callable out, not exclusive of its
   * mastery tier). */
  unresolvedMisconceptions: string[];
};

/**
 * Pure bucketing of already-computed learner state (getConceptState,
 * unchanged) into a readiness breakdown -- no new mastery computation,
 * just a view over existing state.
 */
export function computeReadinessSnapshot(
  scopedConcepts: { conceptId: string; learnerState: LearnerConceptState }[],
): ReadinessSnapshot {
  const snapshot: ReadinessSnapshot = {
    solid: [],
    weak: [],
    exposed: [],
    unverified: [],
    untouched: [],
    unresolvedMisconceptions: [],
  };

  for (const { conceptId, learnerState } of scopedConcepts) {
    if (learnerState.lastEvidenceAt === null) {
      snapshot.untouched.push(conceptId);
    } else {
      snapshot[learnerState.masteryState].push(conceptId);
    }
    if (learnerState.hasUnresolvedMisconception) {
      snapshot.unresolvedMisconceptions.push(conceptId);
    }
  }

  return snapshot;
}
