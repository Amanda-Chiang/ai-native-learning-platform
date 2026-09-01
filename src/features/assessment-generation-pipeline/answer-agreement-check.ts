import type OpenAI from "openai";
import type { LayerResult } from "./source-alignment-check.ts";
import type { IndependentSolveResult } from "./independent-solve.ts";

/**
 * For a checker-domain candidate, the independent-solve layer's checker
 * call already validated the exact claim embedded in checkerInput --
 * that claim came from the same generation call that produced the
 * rubric, so a passing checker result IS agreement between the
 * candidate's stated answer and the independently-computed ground
 * truth (research.md). Pure, exhaustively testable -- no model call.
 */
export function checkAnswerAgreementFromChecker(checkerResult: { outcome: string }): LayerResult {
  if (checkerResult.outcome === "correct") {
    return {
      passed: true,
      detail: `Candidate's stated answer agrees with the independent checker (checker outcome: "correct").`,
    };
  }
  return {
    passed: false,
    detail: `Candidate's stated answer disagrees with the independent checker. Checker result: ${JSON.stringify(checkerResult)}.`,
  };
}

const ANSWER_AGREEMENT_MODEL = process.env.OPENAI_GRADING_MODEL ?? "gpt-4.1";

const ANSWER_AGREEMENT_SCHEMA = {
  name: "answer_agreement_result",
  strict: true,
  schema: {
    type: "object",
    properties: { agrees: { type: "boolean" }, reasoning: { type: "string" } },
    required: ["agrees", "reasoning"],
    additionalProperties: false,
  },
} as const;

/**
 * Used only when no exact checker applies (candidate.checkerDomain is
 * null) -- compares the blind solver's independent answer against the
 * candidate's own rubric. A model-judgment call, not unit tested; live
 * verification per quickstart.md, same as deterministic-grading's own
 * rubric grader.
 */
export async function checkAnswerAgreementViaModel(
  openai: OpenAI,
  rubric: Record<string, unknown>,
  independentAnswer: unknown,
): Promise<LayerResult> {
  const response = await openai.responses.create({
    model: ANSWER_AGREEMENT_MODEL,
    input: [
      {
        role: "user",
        content: `Does this independently-derived answer agree with the rubric's stated correct answer? Judge substantive agreement, not exact wording.\n\nRubric: ${JSON.stringify(rubric)}\n\nIndependent answer: ${JSON.stringify(independentAnswer)}`,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: ANSWER_AGREEMENT_SCHEMA.name,
        strict: ANSWER_AGREEMENT_SCHEMA.strict,
        schema: ANSWER_AGREEMENT_SCHEMA.schema,
      },
    },
  });
  const parsed = JSON.parse(response.output_text) as { agrees: boolean; reasoning: string };
  return {
    passed: parsed.agrees,
    detail: parsed.agrees
      ? `Independent answer agrees with the rubric: ${parsed.reasoning}`
      : `Independent answer disagrees with the rubric: ${parsed.reasoning}. Rubric: ${JSON.stringify(rubric)}. Independent answer: ${JSON.stringify(independentAnswer)}.`,
  };
}

/**
 * Dispatches to the pure or model-calling comparison depending on which
 * shape runIndependentSolve produced.
 */
export async function checkAnswerAgreement(
  openai: OpenAI,
  rubric: Record<string, unknown>,
  independentSolveResult: IndependentSolveResult,
): Promise<LayerResult> {
  if (independentSolveResult.checkerResult) {
    return checkAnswerAgreementFromChecker(independentSolveResult.checkerResult as { outcome: string });
  }
  return checkAnswerAgreementViaModel(openai, rubric, independentSolveResult.independentAnswer);
}
