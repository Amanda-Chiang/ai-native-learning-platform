import type OpenAI from "openai";
import type { GradingRubric, RubricGradingResult } from "./grading-evidence.ts";

/**
 * The one domain with no exact checker (research.md "Confidence
 * threshold for rubric grading"). A tunable starting parameter, not a
 * calibrated constant -- same convention as evidence-weights.ts's
 * strengthByType and assistance-ladder.ts's attemptsPerStep.
 */
export const DEFAULT_RUBRIC_GRADING_CONFIDENCE_THRESHOLD = 0.6;

export function computeIsLowConfidence(confidence: number): boolean {
  return confidence < DEFAULT_RUBRIC_GRADING_CONFIDENCE_THRESHOLD;
}

const RUBRIC_GRADING_MODEL = process.env.OPENAI_GRADING_MODEL ?? "gpt-4.1";

const RUBRIC_GRADING_SCHEMA = {
  name: "rubric_grading_result",
  strict: true,
  schema: {
    type: "object",
    properties: {
      outcome: { type: "string", enum: ["correct", "incorrect", "partial"] },
      satisfiedCriteria: { type: "array", items: { type: "string" } },
      matchedMisconception: { type: ["string", "null"] },
      confidence: { type: "number" },
    },
    required: ["outcome", "satisfiedCriteria", "matchedMisconception", "confidence"],
    additionalProperties: false,
  },
} as const;

function buildPrompt(response: string, rubric: GradingRubric): string {
  return `Grade this student response against the rubric below. Never grade against your own general judgment of correctness -- only against this rubric's specific criteria.

Required ideas (satisfying these is what makes a response "correct"):
${rubric.requiredIdeas.map((idea) => `- ${idea}`).join("\n")}

Acceptable alternative phrasings (still count as satisfying the required ideas):
${rubric.acceptableAlternatives.map((alt) => `- ${alt}`).join("\n")}

Known misconceptions (if the response matches one, identify it specifically):
${rubric.knownMisconceptions.map((m) => `- ${m.description} (phrasing like: ${m.indicativePhrasing.join(", ")})`).join("\n")}

Partial-credit criteria:
${rubric.partialCreditCriteria.map((c) => `- ${c}`).join("\n")}

Student response:
"""
${response}
"""

Return your own honest confidence (0-1) in this specific grading -- lower it for a genuinely ambiguous response relative to the rubric, don't inflate it to look certain.`;
}

export async function gradeTextResponse(
  openai: OpenAI,
  response: string,
  rubric: GradingRubric,
): Promise<RubricGradingResult> {
  const apiResponse = await openai.responses.create({
    model: RUBRIC_GRADING_MODEL,
    input: [{ role: "user", content: buildPrompt(response, rubric) }],
    text: {
      format: {
        type: "json_schema",
        name: RUBRIC_GRADING_SCHEMA.name,
        strict: RUBRIC_GRADING_SCHEMA.strict,
        schema: RUBRIC_GRADING_SCHEMA.schema,
      },
    },
  });

  const parsed = JSON.parse(apiResponse.output_text) as {
    outcome: "correct" | "incorrect" | "partial";
    satisfiedCriteria: string[];
    matchedMisconception: string | null;
    confidence: number;
  };

  return {
    outcome: parsed.outcome,
    satisfiedCriteria: parsed.satisfiedCriteria,
    matchedMisconception: parsed.matchedMisconception,
    confidence: parsed.confidence,
    isLowConfidence: computeIsLowConfidence(parsed.confidence),
  };
}
