// Relative import, not the "@/" tsconfig path alias used elsewhere --
// EvidenceType is a real domain type but must stay resolvable by plain
// `node --test` (same reasoning as
// course-graph-ingestion/extraction-schema.ts).
import type { EvidenceType } from "../../types/domain/evidence-event.ts";
// Type-only import of CommitEvidenceInput from the "use server" actions
// module -- `import type` is fully erased by Node's type-stripping, so
// it never triggers resolving that module (which itself imports
// "@/lib/supabase/server.ts", only resolvable under Next.js's bundler).
// This file stays a pure, plain-node-testable mapping function; the
// actual commitEvidence call happens in actions.ts, which imports this
// file's toCommitEvidenceInput and calls commitEvidence itself --
// still the one shared mapping every grading path goes through, just
// not also the one making the DB call (same split as
// commit-evidence-validation.ts vs actions.ts elsewhere in this project).
import type { CommitEvidenceInput } from "../learner-graph-evidence/actions.ts";
import type { TraversalCheckResult } from "./checkers/bfs-dfs-checker.ts";
import type { HeapCheckResult } from "./checkers/heap-checker.ts";
import type { TreeCheckResult } from "./checkers/tree-checker.ts";
import type { TopoSortCheckResult } from "./checkers/topological-sort-checker.ts";
import type { ShortestPathCheckResult } from "./checkers/shortest-path-checker.ts";

/**
 * The one structural funnel from any grading result to a real evidence
 * commit (research.md "One structural funnel from grading result to
 * evidence commit") -- no grading path in this feature calls
 * commitEvidence directly.
 *
 * CodeGradingResult/RubricGradingResult are defined here (not in
 * code-sandbox-grader.ts/rubric-grader.ts) since this is the one file
 * that needs to reason about every result shape's mapping together --
 * those modules import the type from here.
 */

export type CodeTestOutcome = { name: string; passed: boolean; output: string };

export type CodeGradingResult =
  | { outcome: "graded"; allPassed: boolean; tests: CodeTestOutcome[] }
  | { outcome: "did_not_complete"; reason: "timeout" | "sandbox_error"; detail: string };

export type GradingRubric = {
  requiredIdeas: string[];
  acceptableAlternatives: string[];
  knownMisconceptions: { description: string; indicativePhrasing: string[] }[];
  partialCreditCriteria: string[];
};

export type RubricGradingResult = {
  outcome: "correct" | "incorrect" | "partial";
  satisfiedCriteria: string[];
  matchedMisconception: string | null;
  confidence: number;
  isLowConfidence: boolean;
};

export type AnyGradingResult =
  | TraversalCheckResult
  | HeapCheckResult
  | TreeCheckResult<unknown>
  | TopoSortCheckResult
  | ShortestPathCheckResult
  | CodeGradingResult
  | RubricGradingResult;

export type StudentContext = {
  courseId: string;
  conceptIds: string[];
  edgeIds: string[];
  assessmentAttemptId: string;
};

export type ResponseMeta = {
  evidenceType: EvidenceType;
  assistanceLevel: number;
  difficulty: number;
  transferDistance: number;
  studentConfidence?: number;
};

/**
 * Derives correctness/graderConfidence from any grading result shape;
 * returns null for a result with nothing real to report as evidence
 * (invalid_input / did_not_complete) -- these never fabricate a
 * commit for a malformed question or an execution that never
 * actually happened (FR-002/FR-003/FR-008).
 */
export function toCommitEvidenceInput(
  studentContext: StudentContext,
  result: AnyGradingResult,
  responseMeta: ResponseMeta,
): CommitEvidenceInput | null {
  let correctness: boolean;
  let graderConfidence: number;

  if (result.outcome === "invalid_input" || result.outcome === "did_not_complete") {
    return null;
  }

  if (result.outcome === "graded") {
    // CodeGradingResult
    correctness = result.allPassed;
    graderConfidence = 1.0;
  } else if (result.outcome === "correct" || result.outcome === "incorrect" || result.outcome === "partial") {
    if ("confidence" in result) {
      // RubricGradingResult -- the only shape with a real, possibly-low
      // confidence; never inflated to look certain.
      correctness = result.outcome === "correct";
      graderConfidence = result.confidence;
    } else {
      // Every deterministic checker: an exact computation has no
      // uncertainty either way.
      correctness = result.outcome === "correct";
      graderConfidence = 1.0;
    }
  } else {
    // Exhaustiveness guard -- reaching here means a new result shape
    // was added without updating this mapping.
    throw new Error(`toCommitEvidenceInput: unhandled result outcome "${(result as { outcome: string }).outcome}".`);
  }

  return {
    courseId: studentContext.courseId,
    conceptIds: studentContext.conceptIds,
    edgeIds: studentContext.edgeIds,
    evidenceType: responseMeta.evidenceType,
    correctness,
    graderConfidence,
    assistanceLevel: responseMeta.assistanceLevel,
    difficulty: responseMeta.difficulty,
    transferDistance: responseMeta.transferDistance,
    studentConfidence: responseMeta.studentConfidence,
    assessmentAttemptId: studentContext.assessmentAttemptId,
  };
}
