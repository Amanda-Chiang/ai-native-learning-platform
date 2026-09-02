export type CheckerDomain =
  | "bfs-dfs"
  | "heap"
  | "tree-traversal"
  | "tree-insertion"
  | "topological-sort"
  | "shortest-path";

/**
 * The exact answer-field name(s) each domain's real checkerInput
 * carries (deterministic-grading's own type definitions) -- every one
 * already named with a "claimed" prefix. Documents the real shape each
 * domain expects; extractProblemSetup itself strips by prefix, not by
 * this explicit list, so it works unchanged if a new domain is added
 * later as long as that domain follows the same naming convention.
 */
export const CLAIM_FIELD_NAMES: Record<CheckerDomain, string[]> = {
  "bfs-dfs": ["claimedOrder"],
  heap: ["claimedExtractedSequence", "claimedFinalState"],
  "tree-traversal": ["claimedResult"],
  "tree-insertion": ["claimedResultTree"],
  "topological-sort": ["claimedOrder"],
  "shortest-path": ["claimedPath", "claimedTotalDistance"],
};

/**
 * Strips every key prefixed "claimed" from a real checkerInput,
 * leaving only the problem setup safe to render to the student
 * (research.md "Only the answer-claim fields are extracted") --
 * rendering the whole checkerInput as-is would leak the candidate's
 * own answer, baked in since assessment-generation-pipeline's
 * generation-time validation. Pure, domain-agnostic: works the same
 * way regardless of which checker domain it's given.
 */
export function extractProblemSetup(checkerInput: Record<string, unknown>): Record<string, unknown> {
  const problemSetup: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(checkerInput)) {
    if (key.startsWith("claimed")) continue;
    problemSetup[key] = value;
  }
  return problemSetup;
}
