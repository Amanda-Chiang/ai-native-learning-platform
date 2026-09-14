import type OpenAI from "openai";
import type { CandidateMcqQuestion } from "./mcq-generation-schema.ts";

const AMBIGUITY_MODEL = process.env.OPENAI_GRADING_MODEL ?? "gpt-4.1";

const MCQ_AMBIGUITY_SCHEMA = {
  name: "mcq_ambiguity_review_result",
  strict: true,
  schema: {
    type: "object",
    properties: { ambiguous: { type: "boolean" }, reasoning: { type: "string" } },
    required: ["ambiguous", "reasoning"],
    additionalProperties: false,
  },
} as const;

export type McqAmbiguityResult = { passed: boolean; detail: string };

/**
 * The one validation layer this lightweight path keeps from
 * assessment-generation-pipeline's 6-layer pipeline (design doc's
 * "Generation & validation") -- reimplemented locally against the MCQ
 * candidate shape rather than importing checkAmbiguity, to avoid a
 * cross-feature type coupling for one ~20-line function. A bad MCQ
 * distractor that's ALSO defensibly correct is the dominant real
 * failure mode for multiple choice specifically (more so than for
 * open-ended questions), which is why this one layer earns its cost
 * even in an otherwise-skipped pipeline.
 */
export async function checkMcqAmbiguity(
  openai: OpenAI,
  candidate: CandidateMcqQuestion,
): Promise<McqAmbiguityResult> {
  const response = await openai.responses.create({
    model: AMBIGUITY_MODEL,
    input: [
      {
        role: "user",
        content: `Review this multiple-choice question for ambiguity. Is there more than one option a reasonable student could defensibly pick as correct, or is the stated correct option actually wrong? Answer honestly -- do not assume the stated correct option is right just because it's marked as such.\n\nQuestion: ${candidate.questionText}\n\nOptions: ${JSON.stringify(candidate.options)}\n\nMarked correct option (0-indexed): ${candidate.correctOptionIndex}`,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: MCQ_AMBIGUITY_SCHEMA.name,
        strict: MCQ_AMBIGUITY_SCHEMA.strict,
        schema: MCQ_AMBIGUITY_SCHEMA.schema,
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
