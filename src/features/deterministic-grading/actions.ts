"use server";

import { createClient } from "@/lib/supabase/server.ts";
import { commitEvidence } from "@/features/learner-graph-evidence/actions.ts";
import { checkTraversal, type TraversalCheckInput } from "@/features/deterministic-grading/checkers/bfs-dfs-checker.ts";
import { checkHeapOperations, type HeapCheckInput } from "@/features/deterministic-grading/checkers/heap-checker.ts";
import {
  checkTreeTraversal,
  checkTreeInsertion,
  type TraversalCheckInput as TreeTraversalCheckInput,
  type InsertionCheckInput,
} from "@/features/deterministic-grading/checkers/tree-checker.ts";
import {
  checkTopologicalSort,
  type TopoSortCheckInput,
} from "@/features/deterministic-grading/checkers/topological-sort-checker.ts";
import {
  checkShortestPath,
  type ShortestPathCheckInput,
} from "@/features/deterministic-grading/checkers/shortest-path-checker.ts";
import { toCommitEvidenceInput, type ResponseMeta } from "@/features/deterministic-grading/grading-evidence.ts";

/**
 * Server action contracts: specs/007-deterministic-grading/contracts/grading-actions.md
 */

type CheckerDomain = "bfs-dfs" | "heap" | "tree-traversal" | "tree-insertion" | "topological-sort" | "shortest-path";

export type GradeStructuredResponseInput = {
  courseId: string;
  conceptIds: string[];
  edgeIds: string[];
  domain: CheckerDomain;
  checkerInput:
    | TraversalCheckInput
    | HeapCheckInput
    | TreeTraversalCheckInput
    | InsertionCheckInput
    | TopoSortCheckInput
    | ShortestPathCheckInput;
  evidenceType: ResponseMeta["evidenceType"];
  assistanceLevel: number;
  difficulty: number;
  transferDistance: number;
  studentConfidence?: number;
};

function runChecker(domain: CheckerDomain, checkerInput: GradeStructuredResponseInput["checkerInput"]) {
  switch (domain) {
    case "bfs-dfs":
      return checkTraversal(checkerInput as TraversalCheckInput);
    case "heap":
      return checkHeapOperations(checkerInput as HeapCheckInput);
    case "tree-traversal":
      return checkTreeTraversal(checkerInput as TreeTraversalCheckInput);
    case "tree-insertion":
      return checkTreeInsertion(checkerInput as InsertionCheckInput);
    case "topological-sort":
      return checkTopologicalSort(checkerInput as TopoSortCheckInput);
    case "shortest-path":
      return checkShortestPath(checkerInput as ShortestPathCheckInput);
  }
}

export async function gradeStructuredResponse(
  input: GradeStructuredResponseInput,
): Promise<{ result: ReturnType<typeof runChecker>; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { result: { outcome: "invalid_input", reason: "not signed in" }, error: "You must be signed in to submit a graded response." };
  }

  const result = runChecker(input.domain, input.checkerInput);

  const { data: attempt, error: attemptError } = await supabase
    .from("assessment_attempts")
    .insert({
      user_id: user.id,
      course_id: input.courseId,
      response_modality: "structured",
      question_snapshot: { domain: input.domain, checkerInput: input.checkerInput },
      response: { checkerInput: input.checkerInput },
      grading_result: result,
    })
    .select()
    .single();
  if (attemptError || !attempt) {
    return { result, error: attemptError?.message ?? "Could not record the attempt." };
  }

  const evidenceInput = toCommitEvidenceInput(
    {
      courseId: input.courseId,
      conceptIds: input.conceptIds,
      edgeIds: input.edgeIds,
      assessmentAttemptId: attempt.id,
    },
    result,
    {
      evidenceType: input.evidenceType,
      assistanceLevel: input.assistanceLevel,
      difficulty: input.difficulty,
      transferDistance: input.transferDistance,
      studentConfidence: input.studentConfidence,
    },
  );

  if (!evidenceInput) {
    // invalid_input -- the attempt is still recorded above (a real
    // record of what was attempted), but there is nothing real to
    // commit as evidence (FR-002/FR-003).
    const reason = "reason" in result ? result.reason : "invalid input";
    return { result, error: `No evidence committed: ${reason}` };
  }

  const { error } = await commitEvidence(evidenceInput);
  return { result, error };
}
