import type { LearnerEdgeState } from "../learner-graph-evidence/actions.ts";
import type { RelationType } from "../../types/domain/concept-edge.ts";

export type NewConceptItem = { conceptId: string; introducedAt: string };
export type WeakConnectionItem = { edgeId: string; sourceConceptId: string; targetConceptId: string };
export type LowConnectivityItem = { conceptId: string; edgeCount: number; courseAverageEdgeCount: number };
export type ConfusedPairItem = { edgeId: string; conceptAId: string; conceptBId: string };

export type ConnectSessionResult = {
  newConcepts: NewConceptItem[];
  weakConnections: WeakConnectionItem[];
  lowConnectivityConcepts: LowConnectivityItem[];
  confusedPairs: ConfusedPairItem[];
};

export type ConnectSessionConceptInput = { conceptId: string; createdAt: string; edgeCount: number };
export type ConnectSessionEdgeInput = {
  edgeId: string;
  sourceConceptId: string;
  targetConceptId: string;
  relationType: RelationType;
  learnerState: LearnerEdgeState;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NEW_CONCEPT_WINDOW_DAYS = 7;
/** How far below the course average edgeCount must be to count as
 * "low connectivity" -- tunable, same convention as every other
 * threshold in this feature. */
const LOW_CONNECTIVITY_RATIO = 0.5;

function isNewConcept(createdAt: string, now: Date): boolean {
  const ageDays = (now.getTime() - new Date(createdAt).getTime()) / MS_PER_DAY;
  return ageDays <= NEW_CONCEPT_WINDOW_DAYS;
}

/**
 * Pure composition of the weekly Connect session's four categories
 * (data-model.md) -- no LLM call, no ranking, fully independent of
 * review-priority.ts/next-review-date.ts.
 */
export function composeConnectSession(
  concepts: ConnectSessionConceptInput[],
  edges: ConnectSessionEdgeInput[],
  now: Date,
): ConnectSessionResult {
  const newConceptIds = new Set(concepts.filter((c) => isNewConcept(c.createdAt, now)).map((c) => c.conceptId));

  const newConcepts: NewConceptItem[] = concepts
    .filter((c) => newConceptIds.has(c.conceptId))
    .map((c) => ({ conceptId: c.conceptId, introducedAt: c.createdAt }));

  const weakConnections: WeakConnectionItem[] = edges
    .filter((e) => {
      const oneIsNew = newConceptIds.has(e.sourceConceptId) !== newConceptIds.has(e.targetConceptId);
      const isWeak = e.learnerState.learnerState === "weak";
      return oneIsNew && isWeak;
    })
    .map((e) => ({ edgeId: e.edgeId, sourceConceptId: e.sourceConceptId, targetConceptId: e.targetConceptId }));

  const totalEdgeCount = concepts.reduce((sum, c) => sum + c.edgeCount, 0);
  const courseAverageEdgeCount = concepts.length > 0 ? totalEdgeCount / concepts.length : 0;

  const lowConnectivityConcepts: LowConnectivityItem[] = concepts
    .filter((c) => courseAverageEdgeCount > 0 && c.edgeCount < courseAverageEdgeCount * LOW_CONNECTIVITY_RATIO)
    .map((c) => ({ conceptId: c.conceptId, edgeCount: c.edgeCount, courseAverageEdgeCount }));

  const confusedPairs: ConfusedPairItem[] = edges
    .filter((e) => e.relationType === "contrasts_with")
    .map((e) => ({ edgeId: e.edgeId, conceptAId: e.sourceConceptId, conceptBId: e.targetConceptId }));

  return { newConcepts, weakConnections, lowConnectivityConcepts, confusedPairs };
}
