import type OpenAI from "openai";
import type { CandidateQuestion } from "./candidate-generation-schema.ts";
import type { LayerResult } from "./source-alignment-check.ts";
import { checkTraversal, type TraversalCheckInput } from "../deterministic-grading/checkers/bfs-dfs-checker.ts";
import { checkHeapOperations, type HeapCheckInput } from "../deterministic-grading/checkers/heap-checker.ts";
import {
  checkTreeTraversal,
  checkTreeInsertion,
  type TraversalCheckInput as TreeTraversalCheckInput,
  type InsertionCheckInput,
} from "../deterministic-grading/checkers/tree-checker.ts";
import { checkTopologicalSort, type TopoSortCheckInput } from "../deterministic-grading/checkers/topological-sort-checker.ts";
import { checkShortestPath, type ShortestPathCheckInput } from "../deterministic-grading/checkers/shortest-path-checker.ts";

export type IndependentSolveResult = LayerResult & { checkerResult?: unknown; independentAnswer?: unknown };

/**
 * Dispatches to the matching deterministic-grading checker (research.md
 * "Independent-solve dispatch: the candidate declares its own checker
 * domain") -- never reimplements one, satisfying FR-007. The checker
 * validates the exact claim the generator embedded in checkerInput
 * (which the generation prompt instructs to match the rubric's stated
 * answer) -- this checker call IS the independent verification that
 * claim is actually correct, not a re-derivation from scratch.
 */
function dispatchChecker(domain: NonNullable<CandidateQuestion["checkerDomain"]>, checkerInput: unknown): { outcome: string } {
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
    default: {
      const exhaustive: never = domain;
      throw new Error(`Unhandled checker domain: ${exhaustive}`);
    }
  }
}

const BLIND_SOLVE_MODEL = process.env.OPENAI_GRADING_MODEL ?? "gpt-4.1";

const BLIND_SOLVE_SCHEMA = {
  name: "blind_solve_answer",
  strict: true,
  schema: {
    type: "object",
    properties: { answer: { type: "string" } },
    required: ["answer"],
    additionalProperties: false,
  },
} as const;

/**
 * Shown only the question text, never the candidate's own rubric/answer
 * (research.md) -- used only when no exact checker applies.
 */
async function blindSolve(openai: OpenAI, questionText: string): Promise<string> {
  const response = await openai.responses.create({
    model: BLIND_SOLVE_MODEL,
    input: [
      {
        role: "user",
        content: `Solve this question yourself, independently. Answer only with your own solution, do not ask clarifying questions.\n\n${questionText}`,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: BLIND_SOLVE_SCHEMA.name,
        strict: BLIND_SOLVE_SCHEMA.strict,
        schema: BLIND_SOLVE_SCHEMA.schema,
      },
    },
  });
  const parsed = JSON.parse(response.output_text) as { answer: string };
  return parsed.answer;
}

export async function runIndependentSolve(
  candidate: CandidateQuestion,
  openai: OpenAI,
): Promise<IndependentSolveResult> {
  if (candidate.checkerDomain !== null) {
    // checkerInput came from the generation model, not a trusted
    // caller -- a generator can claim a checkerDomain and then produce
    // a checkerInput that doesn't actually match that domain's real
    // shape (found live: a "shortest-path" candidate whose checkerInput
    // was missing `graph`, crashing the checker on `graph.nodeIds`).
    // That's the candidate's own defect, not this pipeline's -- caught
    // here and reported as a real failed layer so the attempt is
    // regenerated, never an uncaught exception that kills the whole
    // Trigger.dev run.
    let checkerResult: { outcome: string };
    try {
      checkerResult = dispatchChecker(candidate.checkerDomain, candidate.checkerInput);
    } catch (err) {
      return {
        passed: false,
        detail: `checkerInput did not match checkerDomain "${candidate.checkerDomain}"'s real input shape: ${err instanceof Error ? err.message : String(err)}.`,
      };
    }
    const passed = checkerResult.outcome === "correct";
    return {
      passed,
      detail: passed
        ? "The exact checker confirms the candidate's stated answer is correct."
        : `The exact checker disagrees with the candidate's stated answer: ${JSON.stringify(checkerResult)}.`,
      checkerResult,
    };
  }

  const independentAnswer = await blindSolve(openai, candidate.questionText);
  return {
    passed: true,
    detail: "No exact checker applies -- an independent blind solve produced an answer for comparison.",
    independentAnswer,
  };
}
