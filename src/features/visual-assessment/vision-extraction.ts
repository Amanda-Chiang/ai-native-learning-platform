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
 * A deterministic backstop, not a replacement for the model's own
 * confidence -- found live (T017/quickstart.md B5): a blank image
 * produced an empty claimedOrder with confidence 1.0, which
 * needsConfirmation alone would have silently accepted as a
 * legitimate, confident answer. This checks real structural
 * plausibility against the real problem setup (e.g. an order that
 * doesn't visit every real node), independent of whatever confidence
 * value the model happened to report, satisfying FR-007 ("no coherent
 * structure could be extracted") without trusting the model to always
 * self-report that case honestly.
 */
export function isImplausibleExtraction(
  domain: CheckerDomain,
  claimFields: Record<string, unknown>,
  problemSetup: Record<string, unknown>,
): boolean {
  switch (domain) {
    case "bfs-dfs":
    case "topological-sort": {
      const order = claimFields.claimedOrder;
      const nodeIds = (problemSetup.graph as { nodeIds?: string[] } | undefined)?.nodeIds ?? [];
      return !Array.isArray(order) || order.length !== nodeIds.length;
    }
    case "shortest-path": {
      const path = claimFields.claimedPath;
      return !Array.isArray(path) || path.length === 0;
    }
    case "tree-traversal": {
      const result = claimFields.claimedResult;
      const tree = problemSetup.tree;
      return tree !== null && (!Array.isArray(result) || result.length === 0);
    }
    case "heap": {
      const sequence = claimFields.claimedExtractedSequence;
      const finalState = claimFields.claimedFinalState;
      return !Array.isArray(sequence) || !Array.isArray(finalState);
    }
    case "tree-insertion": {
      // null is a legitimate "empty tree" result -- only a genuinely
      // missing/malformed value is implausible.
      return claimFields.claimedResultTree === undefined;
    }
  }
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
