import { type SourceAnchor } from "./source-anchor.ts";
import { type OntologyStatus } from "../../lib/supabase/database.types.ts";

/**
 * A single teachable idea within one course (PRD S10.2). Canonical course
 * ontology, not learner state -- see EvidenceEvent for the learner overlay.
 */
export type CourseConcept = {
  id: string;
  courseId: string;
  unitId: string;
  canonicalName: string;
  /** Other names/phrasings the same concept appears under across source artifacts. */
  aliases: string[];
  description: string;
  /** Course-emphasis signal, 0-1. */
  importanceScore: number;
  /** Non-empty for any concept attached to a real course (Constitution Principle V). */
  sourceAnchors: SourceAnchor[];
  status: "proposed" | "confirmed" | "archived";
  confidence: number;
};

/**
 * A course unit -- the top-level grouping concepts belong to (PRD S10.2).
 * Canonical course ontology, not learner state.
 */
export type CourseUnit = {
  id: string;
  courseId: string;
  title: string;
  status: OntologyStatus;
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

export function isCourseConcept(value: unknown): value is CourseConcept {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;

  if (typeof v.id !== "string") return false;
  if (typeof v.courseId !== "string") return false;
  if (typeof v.unitId !== "string") return false;
  if (typeof v.canonicalName !== "string") return false;
  if (typeof v.description !== "string") return false;
  if (typeof v.importanceScore !== "number") return false;
  if (typeof v.confidence !== "number") return false;
  if (v.status !== "proposed" && v.status !== "confirmed" && v.status !== "archived") return false;

  if (!Array.isArray(v.aliases) || !v.aliases.every((a) => typeof a === "string")) return false;
  if ((v.aliases as string[]).includes(v.canonicalName as string)) return false;

  if (!Array.isArray(v.sourceAnchors) || v.sourceAnchors.length < 1) return false;
  if (!v.sourceAnchors.every(isSourceAnchor)) return false;

  return true;
}
