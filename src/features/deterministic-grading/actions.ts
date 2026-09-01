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
import { gradeCode } from "@/features/deterministic-grading/code-sandbox-grader.ts";
import { gradeTextResponse as runRubricGrader } from "@/features/deterministic-grading/rubric-grader.ts";
import type { GradingRubric } from "@/features/deterministic-grading/grading-evidence.ts";
import OpenAI from "openai";

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

export type GradeCodeResponseInput = {
  courseId: string;
  conceptIds: string[];
  edgeIds: string[];
  code: string;
  language: "javascript" | "python";
  tests: { name: string; assertion: string }[];
  evidenceType: ResponseMeta["evidenceType"];
  assistanceLevel: number;
  difficulty: number;
  transferDistance: number;
  studentConfidence?: number;
};

export async function gradeCodeResponse(
  input: GradeCodeResponseInput,
): Promise<{ result: Awaited<ReturnType<typeof gradeCode>>; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      result: { outcome: "did_not_complete", reason: "sandbox_error", detail: "not signed in" },
      error: "You must be signed in to submit a graded response.",
    };
  }

  const result = await gradeCode({ code: input.code, language: input.language, tests: input.tests });

  const { data: attempt, error: attemptError } = await supabase
    .from("assessment_attempts")
    .insert({
      user_id: user.id,
      course_id: input.courseId,
      response_modality: "code",
      question_snapshot: { language: input.language, tests: input.tests },
      response: { code: input.code },
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
    // did_not_complete -- the attempt is still recorded above, but a
    // timeout/sandbox error is never recorded as an ordinary pass or
    // fail (FR-008).
    const reason = "reason" in result ? result.reason : "did not complete";
    return { result, error: `No evidence committed: ${reason}` };
  }

  const { error } = await commitEvidence(evidenceInput);
  return { result, error };
}

export type GradeTextResponseInput = {
  courseId: string;
  conceptIds: string[];
  edgeIds: string[];
  response: string;
  rubric: GradingRubric;
  evidenceType: ResponseMeta["evidenceType"];
  assistanceLevel: number;
  difficulty: number;
  transferDistance: number;
  studentConfidence?: number;
};

export async function gradeTextResponse(
  input: GradeTextResponseInput,
): Promise<{ result: Awaited<ReturnType<typeof runRubricGrader>>; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      result: { outcome: "incorrect", satisfiedCriteria: [], matchedMisconception: null, confidence: 0, isLowConfidence: true },
      error: "You must be signed in to submit a graded response.",
    };
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const result = await runRubricGrader(openai, input.response, input.rubric);

  const { data: attempt, error: attemptError } = await supabase
    .from("assessment_attempts")
    .insert({
      user_id: user.id,
      course_id: input.courseId,
      response_modality: "text",
      question_snapshot: { rubric: input.rubric },
      response: { text: input.response },
      grading_result: result,
    })
    .select()
    .single();
  if (attemptError || !attempt) {
    return { result, error: attemptError?.message ?? "Could not record the attempt." };
  }

  // isLowConfidence:true still commits evidence (FR-010 requires it be
  // flagged, not withheld) -- graderConfidence carries the real
  // (possibly low) value, never inflated to look certain.
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
    return { result, error: "No evidence committed." };
  }

  const { error: commitError } = await commitEvidence(evidenceInput);
  return { result, error: commitError };
}
