export const ASSESSMENT_TYPES = [
  "retrieval",
  "mechanism",
  "application",
  "connection",
  "transfer",
] as const;

export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

export const RESPONSE_MODALITIES = ["text", "code", "graph", "tree", "diagram"] as const;

export type ResponseModality = (typeof RESPONSE_MODALITIES)[number];

/**
 * A specification for a practice/exam item -- what it targets, at what
 * difficulty, in what modality -- distinct from the generated question
 * itself (PRD S15.2).
 */
export type Assessment = {
  id: string;
  targetConceptIds: string[];
  targetEdgeIds: string[];
  assessmentType: AssessmentType;
  difficulty: number;
  /** Source anchors this blueprint should stylistically match. */
  courseStyleRefs: string[];
  requiredPrerequisites: string[];
  /** Concept IDs explicitly out of scope, bounding the item. */
  forbiddenConcepts: string[];
  responseModality: ResponseModality;
  expectedSolutionProperties: string[];
  maxTimeMinutes: number;
};

export function isAssessment(value: unknown): value is Assessment {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;

  if (typeof v.id !== "string") return false;
  if (typeof v.difficulty !== "number") return false;
  if (typeof v.maxTimeMinutes !== "number") return false;

  if (!(ASSESSMENT_TYPES as readonly string[]).includes(v.assessmentType as string)) return false;
  if (!(RESPONSE_MODALITIES as readonly string[]).includes(v.responseModality as string)) return false;

  const stringArrayFields = [
    "targetConceptIds",
    "targetEdgeIds",
    "courseStyleRefs",
    "requiredPrerequisites",
    "forbiddenConcepts",
    "expectedSolutionProperties",
  ] as const;
  for (const field of stringArrayFields) {
    const arr = v[field];
    if (!Array.isArray(arr) || !arr.every((item) => typeof item === "string")) return false;
  }

  if ((v.targetConceptIds as string[]).length === 0 && (v.targetEdgeIds as string[]).length === 0) {
    return false;
  }

  return true;
}
