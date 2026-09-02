import type OpenAI from "openai";
import type { CheckerDomain } from "./problem-setup.ts";
import { EXTRACTION_SCHEMAS, EXTRACTION_PROMPT_BY_DOMAIN } from "./extraction-schemas.ts";

export type ExtractionResult = {
  claimFields: Record<string, unknown>;
  /** The vision model's own stated confidence, 0-1 -- a real reported
   * value (spec.md Assumptions), never invented by this feature. */
  confidence: number;
};

const VISION_MODEL = process.env.OPENAI_VISION_MODEL ?? "gpt-4.1";

/** Tunable, same convention as deterministic-grading's own rubric-
 * grading confidence threshold. */
export const LOW_CONFIDENCE_THRESHOLD = 0.7;

export function needsConfirmation(confidence: number): boolean {
  return confidence < LOW_CONFIDENCE_THRESHOLD;
}

/**
 * Calls the vision-capable model with the drawing image + the
 * domain's own claim-fields-only schema (extraction-schemas.ts) --
 * never asked to judge correctness, only to read what was drawn. The
 * model is separately asked for its own honest confidence in this
 * specific reading, wrapped around the claim-field schema itself so
 * Structured Outputs' strict mode still applies to the whole response.
 */
export async function extractDrawing(
  openai: OpenAI,
  domain: CheckerDomain,
  imageUrl: string,
): Promise<ExtractionResult> {
  const claimSchema = EXTRACTION_SCHEMAS[domain];

  const wrappedSchema = {
    name: `${claimSchema.name}_with_confidence`,
    strict: true as const,
    schema: {
      type: "object",
      ...(("$defs" in claimSchema.schema) ? { $defs: (claimSchema.schema as { $defs: unknown }).$defs } : {}),
      properties: {
        claimFields: claimSchema.schema,
        confidence: { type: "number", description: "Your own honest confidence (0-1) that you read this drawing correctly -- lower it for genuinely ambiguous strokes, don't inflate it to look certain." },
      },
      required: ["claimFields", "confidence"],
      additionalProperties: false,
    },
  };

  const response = await openai.responses.create({
    model: VISION_MODEL,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: EXTRACTION_PROMPT_BY_DOMAIN[domain] },
          { type: "input_image", image_url: imageUrl, detail: "auto" },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: wrappedSchema.name,
        strict: wrappedSchema.strict,
        schema: wrappedSchema.schema,
      },
    },
  });

  const parsed = JSON.parse(response.output_text) as { claimFields: Record<string, unknown>; confidence: number };
  return { claimFields: parsed.claimFields, confidence: parsed.confidence };
}
