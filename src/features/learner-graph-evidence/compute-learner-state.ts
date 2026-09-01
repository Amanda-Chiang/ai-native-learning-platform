import type { EvidenceEvent, EvidenceType } from "@/types/domain/evidence-event.ts";
import type { MasteryState, LearnerRelationshipState } from "@/types/graph/course-graph.ts";
import type { EvidenceWeights } from "@/features/learner-graph-evidence/evidence-weights.ts";

/**
 * Pure state-computation algorithm (data-model.md "computeLearnerState").
 * Recomputes the full state from an entire evidence history every call --
 * never patches a running score (research.md "recompute from the full
 * evidence log").
 */

export type ContributingFactor = {
  eventId: string;
  /**
   * Beyond data-model.md's original 5-field list: FR-009's provenance
   * display (ConceptDetailPanel's "last evidence type") needs to know
   * which evidence type actually produced the tier, and every other
   * component here is already per-event, so this is one more logged
   * component, not a new persistence concern.
   */
  evidenceType: EvidenceType;
  evidenceStrength: number;
  recencyDecay: number;
  independenceFactor: number;
  graderConfidence: number;
  difficultyFactor: number;
};

export type LearnerState<Tier> = {
  tier: Tier;
  score: number;
  hasUnresolvedMisconception: boolean;
  contributingFactors: ContributingFactor[];
  /** null only at the FR-010 baseline (no evidence yet). */
  lastEvidenceAt: string | null;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function recencyDecay(createdAt: string, now: Date, halfLifeDays: number): number {
  const ageDays = Math.max(0, (now.getTime() - new Date(createdAt).getTime()) / MS_PER_DAY);
  return Math.pow(0.5, ageDays / halfLifeDays);
}

function independenceFactor(event: EvidenceEvent, weights: EvidenceWeights): number {
  return event.assistanceLevel <= weights.independentAssistanceLevelMax
    ? 1
    : weights.independenceFactorWhenAssisted;
}

/**
 * Bounded to [0.5, 1] so it can only ever reduce a product below the
 * event type's own strength weight, never amplify it above -- this is
 * what makes exposure's strength weight (below tierCutoffs.exposed by
 * construction, evidence-weights.ts) an unconditional ceiling on the
 * score any exposure-only event can contribute, regardless of how
 * difficulty/recency/confidence vary (Constitution Principle III,
 * structurally, not just for the specific weight values shipped today).
 * Difficulty assumed normalized to [0, 1], same convention already used
 * by importanceScore/confidence elsewhere in this project's domain
 * types.
 */
function difficultyFactor(difficulty: number): number {
  const clamped = Math.min(1, Math.max(0, difficulty));
  return 0.5 + 0.5 * clamped;
}

function isIndependent(event: EvidenceEvent, weights: EvidenceWeights): boolean {
  return event.assistanceLevel <= weights.independentAssistanceLevelMax;
}

function isConfidentStudentResponse(event: EvidenceEvent, weights: EvidenceWeights): boolean {
  return (
    event.studentConfidence !== undefined &&
    event.studentConfidence >= weights.confidentStudentConfidenceMin
  );
}

function isConfidentGraderResponse(event: EvidenceEvent, weights: EvidenceWeights): boolean {
  return event.graderConfidence >= weights.confidentStudentConfidenceMin;
}

/**
 * FR-011/FR-012: two or more confident, incorrect, independent events on
 * this target with no later strong correct independent event after the
 * most recent one of those. "Confident" for an incorrect response is
 * measured by the student's own self-reported studentConfidence (a
 * confidently wrong answer is the actual misconception signal, not a
 * guess); a missing studentConfidence never counts toward the threshold
 * -- absence of a signal is not evidence of confidence
 * (no-silent-placeholders). The clearing event uses graderConfidence
 * (how sure the grading was) since that's what's guaranteed present on
 * every event.
 */
function computeHasUnresolvedMisconception(
  events: EvidenceEvent[],
  weights: EvidenceWeights,
): boolean {
  const chronological = [...events].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  let incorrectStreak = 0;
  for (const event of chronological) {
    if (!isIndependent(event, weights)) continue;
    if (event.correctness === false && isConfidentStudentResponse(event, weights)) {
      incorrectStreak += 1;
    } else if (event.correctness === true && isConfidentGraderResponse(event, weights)) {
      incorrectStreak = 0;
    }
  }

  return incorrectStreak >= weights.misconceptionThreshold;
}

function computeScoreAndFactors(
  events: EvidenceEvent[],
  now: Date,
  weights: EvidenceWeights,
): { score: number; contributingFactors: ContributingFactor[] } {
  let weightedSum = 0;
  let weightTotal = 0;
  const contributingFactors: ContributingFactor[] = [];

  // Chronological order so contributingFactors' last entry always
  // corresponds to the most recently created event (getConceptState/
  // getEdgeState's provenance display reads exactly that entry) --
  // score itself is order-independent (a plain weighted sum), so this
  // ordering is purely for that downstream reading, not the math.
  const chronological = [...events].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  for (const event of chronological) {
    const strength = event.correctness === false ? 0 : weights.strengthByType[event.evidenceType];
    const decay = recencyDecay(event.createdAt, now, weights.recencyHalfLifeDays);
    const independence = independenceFactor(event, weights);
    const difficulty = difficultyFactor(event.difficulty);

    contributingFactors.push({
      eventId: event.id,
      evidenceType: event.evidenceType,
      evidenceStrength: strength,
      recencyDecay: decay,
      independenceFactor: independence,
      graderConfidence: event.graderConfidence,
      difficultyFactor: difficulty,
    });

    const value = strength * decay * independence * event.graderConfidence * difficulty;
    // recencyDecay is also the weight of this event's contribution to
    // the average -- an old event fades out of the average, not just
    // out of its own value (research.md's recompute-from-log design
    // means there's no running total that could otherwise remember it
    // forever at its original weight).
    weightedSum += value * decay;
    weightTotal += decay;
  }

  const score = weightTotal === 0 ? 0 : weightedSum / weightTotal;
  return { score, contributingFactors };
}

function conceptTierFromScore(score: number, weights: EvidenceWeights): MasteryState {
  if (score >= weights.tierCutoffs.solid) return "solid";
  if (score >= weights.tierCutoffs.weak) return "weak";
  if (score >= weights.tierCutoffs.exposed) return "exposed";
  return "unverified";
}

function edgeTierFromScore(score: number, weights: EvidenceWeights): LearnerRelationshipState {
  // Only two edge states exist -- "weak" is the earned-low state, not
  // a default (materialize-course-graph.ts's own baseline convention),
  // so any non-baseline score maps into this two-way split, not a
  // four-way one.
  return score >= weights.tierCutoffs.solid ? "strong" : "weak";
}

function latestEvidenceAt(events: EvidenceEvent[]): string | null {
  if (events.length === 0) return null;
  return events.reduce(
    (latest, e) => (new Date(e.createdAt).getTime() > new Date(latest).getTime() ? e.createdAt : latest),
    events[0].createdAt,
  );
}

export function computeLearnerState(
  events: EvidenceEvent[],
  now: Date,
  weights: EvidenceWeights,
  kind: "concept",
): LearnerState<MasteryState>;
export function computeLearnerState(
  events: EvidenceEvent[],
  now: Date,
  weights: EvidenceWeights,
  kind: "edge",
): LearnerState<LearnerRelationshipState>;
export function computeLearnerState(
  events: EvidenceEvent[],
  now: Date,
  weights: EvidenceWeights,
  kind: "concept" | "edge",
): LearnerState<MasteryState> | LearnerState<LearnerRelationshipState> {
  if (events.length === 0) {
    // FR-010 baseline: the same function handles "no evidence yet" and
    // "has evidence," rather than a separate default coded elsewhere.
    return {
      tier: kind === "concept" ? "unverified" : "strong",
      score: 0,
      hasUnresolvedMisconception: false,
      contributingFactors: [],
      lastEvidenceAt: null,
    };
  }

  const { score, contributingFactors } = computeScoreAndFactors(events, now, weights);
  const tier = kind === "concept" ? conceptTierFromScore(score, weights) : edgeTierFromScore(score, weights);

  return {
    tier,
    score,
    hasUnresolvedMisconception: computeHasUnresolvedMisconception(events, weights),
    contributingFactors,
    lastEvidenceAt: latestEvidenceAt(events),
  } as LearnerState<MasteryState> | LearnerState<LearnerRelationshipState>;
}
