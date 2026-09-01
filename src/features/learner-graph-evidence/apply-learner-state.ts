import type { CourseGraph, MasteryState, LearnerRelationshipState } from "@/types/graph/course-graph.ts";

/**
 * Pure overlay: real per-student state on top of course-graph-ingestion's
 * baseline CourseGraph (research.md "Overlaying real state onto
 * course-graph-ingestion's baseline, without touching it"). Never
 * mutates the input graph; a concept/edge absent from the state maps
 * keeps the input's original baseline values unchanged.
 */

export type ConceptStateOverlay = {
  masteryState: MasteryState;
  hasUnresolvedMisconception?: boolean;
};

export type EdgeStateOverlay = {
  learnerState: LearnerRelationshipState;
  explanation?: string;
};

export function applyLearnerState(
  graph: CourseGraph,
  conceptStates: Map<string, ConceptStateOverlay>,
  edgeStates: Map<string, EdgeStateOverlay>,
): CourseGraph {
  return {
    units: graph.units,
    concepts: graph.concepts.map((concept) => {
      const overlay = conceptStates.get(concept.id);
      if (!overlay) return concept;
      return {
        ...concept,
        masteryState: overlay.masteryState,
        ...(overlay.hasUnresolvedMisconception !== undefined
          ? { hasUnresolvedMisconception: overlay.hasUnresolvedMisconception }
          : {}),
      };
    }),
    relationships: graph.relationships.map((relationship) => {
      const overlay = edgeStates.get(relationship.id);
      if (!overlay) return relationship;
      return {
        ...relationship,
        learnerState: overlay.learnerState,
        ...(overlay.explanation !== undefined ? { explanation: overlay.explanation } : {}),
      };
    }),
  };
}
