import type { EvidenceType } from "@/types/domain/evidence-event.ts";

/**
 * The state-computation algorithm's tunable numbers, in one place
 * (data-model.md "The algorithm's config"). PRD S10.4: these are product
 * parameters, not psychological truths -- expected to be recalibrated
 * once real usage data exists, not hardcoded inside computeLearnerState.
 */
export type EvidenceWeights = {
  strengthByType: Record<EvidenceType, number>;
  recencyHalfLifeDays: number;
  independentAssistanceLevelMax: number;
  independenceFactorWhenAssisted: number;
  tierCutoffs: { exposed: number; weak: number; solid: number };
  /**
   * Number of confident incorrect independent events on the same target
   * required to raise hasUnresolvedMisconception. Starting parameter
   * (spec.md Assumptions: "two or more"), not a calibrated constant.
   */
  misconceptionThreshold: number;
  /** studentConfidence at or above this counts as "confident" for misconception detection. */
  confidentStudentConfidenceMin: number;
};

export const DEFAULT_EVIDENCE_WEIGHTS: EvidenceWeights = {
  strengthByType: {
    // Deliberately below tierCutoffs.exposed -- the structural
    // enforcement of Constitution Principle III: no exposure-only event
    // sequence can mathematically produce a score reaching "weak"/"solid".
    exposure: 0.1,
    retrieval: 0.6,
    explanation: 0.5,
    application: 0.75,
    transfer: 0.9,
    relationship_explanation: 0.5,
    misconception: 0.2,
    annotation_confusion_signal: 0.1,
    instructor_feedback: 0.5,
  },
  recencyHalfLifeDays: 30,
  independentAssistanceLevelMax: 1,
  independenceFactorWhenAssisted: 0.5,
  // strengthByType.exposure sits strictly below tierCutoffs.exposed
  // (evidence-weights-invariant.test.ts guards this directly) --
  // exposure-only evidence therefore never crosses even into the
  // "exposed" tier itself, let alone "weak"/"solid": Constitution
  // Principle III applied at its strictest reading ("exposure is not
  // mastery" extends to not crediting the "exposed" tier's own score
  // band, since mere exposure is a weaker claim than "has been
  // measurably exposed to and retained"). The "exposed" tier is reached
  // by other, decayed/low-confidence real evidence instead (e.g. an old
  // or low-confidence retrieval attempt), never by exposure alone.
  tierCutoffs: { exposed: 0.15, weak: 0.4, solid: 0.7 },
  misconceptionThreshold: 2,
  confidentStudentConfidenceMin: 0.6,
};
