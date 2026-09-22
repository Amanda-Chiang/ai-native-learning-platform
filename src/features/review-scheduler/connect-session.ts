import type { LearnerEdgeState } from "../learner-graph-evidence/actions.ts";

export type NewConceptItem = { conceptId: string; introducedAt: string };
export type WeakConnectionItem = { edgeId: string; sourceConceptId: string; targetConceptId: string };

export type ConnectSessionResult = {
  newConcepts: NewConceptItem[];
  weakConnections: WeakConnectionItem[];
};

export type ConnectSessionConceptInput = { conceptId: string; createdAt: string };
export type ConnectSessionEdgeInput = {
  edgeId: string;
  sourceConceptId: string;
  targetConceptId: string;
  learnerState: LearnerEdgeState;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NEW_CONCEPT_WINDOW_DAYS = 7;

function isNewConcept(createdAt: string, now: Date): boolean {
  const ageDays = (now.getTime() - new Date(createdAt).getTime()) / MS_PER_DAY;
  return ageDays <= NEW_CONCEPT_WINDOW_DAYS;
}

/**
 * Pure composition of the weekly Connect session's two categories
 * (data-model.md, trimmed 2026-09-21 -- see architecture-log.md's
 * 2026-09-21 entry for why lowConnectivityConcepts/confusedPairs were
 * removed rather than kept unused) -- no LLM call, no ranking, fully
 * independent of review-priority.ts/next-review-date.ts.
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

  return { newConcepts, weakConnections };
}
