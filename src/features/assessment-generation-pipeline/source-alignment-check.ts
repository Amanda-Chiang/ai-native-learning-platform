import type { Assessment } from "../../types/domain/assessment.ts";
import type { CandidateQuestion } from "./candidate-generation-schema.ts";

export type LayerResult = { passed: boolean; detail: string };

/**
 * Pure check (data-model.md's "sourceAlignment" layer): every one of the
 * candidate's sourceAnchors must cite a conceptOrEdgeId that's actually
 * among the blueprint's real targets -- an anchor into material outside
 * the blueprint's scope means the question isn't really grounded in
 * what it claims to be about, even if the cited concept/edge is real.
 */
export function checkSourceAlignment(candidate: CandidateQuestion, blueprint: Assessment): LayerResult {
  const validTargets = new Set([...blueprint.targetConceptIds, ...blueprint.targetEdgeIds]);

  const misalignedAnchor = candidate.sourceAnchors.find((anchor) => !validTargets.has(anchor.conceptOrEdgeId));

  if (misalignedAnchor) {
    return {
      passed: false,
      detail: `Source anchor cites "${misalignedAnchor.conceptOrEdgeId}", which is not among the blueprint's target concepts/edges (${[...validTargets].join(", ") || "none"}).`,
    };
  }

  return { passed: true, detail: "Every source anchor cites one of the blueprint's real target concepts/edges." };
}
