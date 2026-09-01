export const EVIDENCE_TYPES = [
  "exposure",
  "retrieval",
  "explanation",
  "application",
  "transfer",
  "relationship_explanation",
  "misconception",
  "annotation_confusion_signal",
  "instructor_feedback",
] as const;

export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

/**
 * An immutable record of something a specific student did that bears on
 * their understanding of one or more concepts and/or edges (PRD S10.3;
 * Constitution Principle II). There is deliberately no update/delete
 * operation anywhere in this module -- evidence is append-only by
 * construction, not by convention.
 */
export type EvidenceEvent = {
  id: string;
  userId: string;
  courseId: string;
  /** Zero or more -- an event can target concepts, edges, or both. */
  conceptIds: string[];
  edgeIds: string[];
  evidenceType: EvidenceType;
  /** null when not applicable, e.g. exposure events have no correctness. */
  correctness: boolean | null;
  graderConfidence: number;
  /** Position on the PRD S14.3 assistance ladder used, if any (0-6). */
  assistanceLevel: number;
  difficulty: number;
  transferDistance: number;
  studentConfidence?: number;
  sourceArtifactId?: string;
  assessmentAttemptId?: string;
  conversationTurnId?: string;
  createdAt: string;
};

export function isEvidenceEvent(value: unknown): value is EvidenceEvent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;

  if (typeof v.id !== "string") return false;
  if (typeof v.userId !== "string") return false;
  if (typeof v.courseId !== "string") return false;
  if (typeof v.graderConfidence !== "number") return false;
  if (typeof v.assistanceLevel !== "number") return false;
  if (typeof v.difficulty !== "number") return false;
  if (typeof v.transferDistance !== "number") return false;
  if (typeof v.createdAt !== "string") return false;

  if (!(EVIDENCE_TYPES as readonly string[]).includes(v.evidenceType as string)) return false;
  if (v.correctness !== null && typeof v.correctness !== "boolean") return false;

  if (!Array.isArray(v.conceptIds) || !v.conceptIds.every((c) => typeof c === "string")) return false;
  if (!Array.isArray(v.edgeIds) || !v.edgeIds.every((e) => typeof e === "string")) return false;
  if ((v.conceptIds as string[]).length === 0 && (v.edgeIds as string[]).length === 0) return false;

  const hasOrigin =
    typeof v.sourceArtifactId === "string" ||
    typeof v.assessmentAttemptId === "string" ||
    typeof v.conversationTurnId === "string";
  if (!hasOrigin) return false;

  return true;
}
