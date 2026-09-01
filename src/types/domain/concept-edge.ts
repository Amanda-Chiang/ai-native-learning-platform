import { type SourceAnchor } from "./source-anchor.ts";

export const STANDARD_RELATION_TYPES = [
  "prerequisite_for",
  "part_of",
  "mechanism_for",
  "contrasts_with",
  "used_in",
  "generalizes_to",
  "example_of",
] as const;

export type RelationType = (typeof STANDARD_RELATION_TYPES)[number] | "other";

/**
 * A directed, typed relationship between two CourseConcepts (PRD S10.2).
 * Multiple edges may exist between the same ordered pair -- this is a
 * multigraph (Constitution Principle I).
 */
export type ConceptEdge = {
  id: string;
  sourceConceptId: string;
  targetConceptId: string;
  relationType: RelationType;
  /**
   * Required when relationType === "other", forbidden otherwise. Records
   * why no standard type fit (spec Edge Cases, FR-002).
   */
  relationTypeNote?: string;
  explanation: string;
  sourceAnchors: SourceAnchor[];
  status: "proposed" | "confirmed" | "archived";
  confidence: number;
};

function isSourceAnchor(value: unknown): value is SourceAnchor {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.artifactId === "string" &&
    typeof v.locator === "string" &&
    typeof v.excerpt === "string"
  );
}

const ALL_RELATION_TYPES: readonly string[] = [...STANDARD_RELATION_TYPES, "other"];

export function isConceptEdge(value: unknown): value is ConceptEdge {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;

  if (typeof v.id !== "string") return false;
  if (typeof v.sourceConceptId !== "string") return false;
  if (typeof v.targetConceptId !== "string") return false;
  if (typeof v.explanation !== "string") return false;
  if (typeof v.confidence !== "number") return false;
  if (v.status !== "proposed" && v.status !== "confirmed" && v.status !== "archived") return false;

  if (typeof v.relationType !== "string" || !ALL_RELATION_TYPES.includes(v.relationType)) return false;

  const hasNote = typeof v.relationTypeNote === "string" && v.relationTypeNote.length > 0;
  if (v.relationType === "other" && !hasNote) return false;
  if (v.relationType !== "other" && v.relationTypeNote !== undefined) return false;

  if (!Array.isArray(v.sourceAnchors) || v.sourceAnchors.length < 1) return false;
  if (!v.sourceAnchors.every(isSourceAnchor)) return false;

  return true;
}
