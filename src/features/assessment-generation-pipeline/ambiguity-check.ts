import type OpenAI from "openai";
import type { LayerResult } from "./source-alignment-check.ts";
import type { CandidateQuestion } from "./candidate-generation-schema.ts";

const AMBIGUITY_MODEL = process.env.OPENAI_GRADING_MODEL ?? "gpt-4.1";

const AMBIGUITY_SCHEMA = {
  name: "ambiguity_review_result",
  strict: true,
  schema: {
    type: "object",
    properties: { ambiguous: { type: "boolean" }, reasoning: { type: "string" } },
    required: ["ambiguous", "reasoning"],
    additionalProperties: false,
  },
} as const;

/**
 * A reviewer model call asking specifically whether the candidate has
 * more than one reasonable interpretation or answer (data-model.md) --
 * a model-judgment call with no exact checker, same reasoning
 * deterministic-grading's rubric grader already used for the one
 * domain with no exact checker. Not unit tested here; exhaustive
 * scenario coverage against real model behavior is User Story 3's job
 * (specs/008-assessment-generation-pipeline/tasks.md T020).
 */
export async function checkAmbiguity(openai: OpenAI, candidate: CandidateQuestion): Promise<LayerResult> {
  const response = await openai.responses.create({
    model: AMBIGUITY_MODEL,
    input: [
      {
        role: "user",
        content: `Review this question for ambiguity. Does it have more than one reasonable interpretation, or more than one reasonable correct answer given its stated rubric? Answer honestly -- do not assume the rubric is the only valid reading.\n\nQuestion: ${candidate.questionText}\n\nRubric: ${JSON.stringify(candidate.rubric)}`,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: AMBIGUITY_SCHEMA.name,
        strict: AMBIGUITY_SCHEMA.strict,
        schema: AMBIGUITY_SCHEMA.schema,
      },
    },
  });
  const parsed = JSON.parse(response.output_text) as { ambiguous: boolean; reasoning: string };
  return {
    passed: !parsed.ambiguous,
    detail: parsed.ambiguous
      ? `Flagged as ambiguous: ${parsed.reasoning}`
      : `No genuine ambiguity found: ${parsed.reasoning}`,
  };
}
