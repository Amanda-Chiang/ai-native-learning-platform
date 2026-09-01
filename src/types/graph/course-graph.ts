/**
 * Renderer-neutral course-graph DTO (Constitution Principle I).
 *
 * No field anywhere below may contain a coordinate, React Flow node/edge
 * id, ELK layout output, CSS class, or any other renderer-specific
 * property. Positions live only in the adapter layer
 * (src/features/concept-atlas/adapters/) and the graph_layouts table --
 * never here.
 */

export type MasteryState = "unverified" | "exposed" | "weak" | "solid";

export type RelationshipType =
  | "prerequisite-of"
  | "builds-on"
  | "applies-to"
  | "analogous-to"
  | "contrasts-with";

export type LearnerRelationshipState = "weak" | "strong";

export type Unit = {
  id: string;
  title: string;
  conceptIds: string[];
};

export type Concept = {
  id: string;
  canonicalLabel: string;
  /** Display/search only -- an alias never becomes a separate concept. */
  aliases: string[];
  masteryState: MasteryState;
};

export type Relationship = {
  id: string;
  type: RelationshipType;
  fromConceptId: string;
  toConceptId: string;
  /** Whether fromConceptId and toConceptId belong to different units. */
  crossUnit: boolean;
  /**
   * Relationship-level state, independent of either endpoint concept's
   * own masteryState.
   */
  learnerState: LearnerRelationshipState;
};

/**
 * (fromConceptId, toConceptId, type) is NOT required to be unique --
 * duplicate/alias edges from different extraction passes are a real,
 * intentional case this type must represent as-is (spec FR-014).
 * Deduplication is an ingestion-time concern, not this type's job.
 */
export type CourseGraph = {
  units: Unit[];
  concepts: Concept[];
  relationships: Relationship[];
};
