import type OpenAI from "openai";
import { EXTRACTION_RESPONSE_SCHEMA } from "./extraction-schema.ts";

/**
 * Shared between trigger/extract-course-graph.ts (real uploaded PDFs/
 * images, via OpenAI file input) and scripts/score-extraction.ts (the
 * benchmark corpus's plain-markdown sources, via text input) -- both
 * need the exact same prompt and schema so the scoring harness measures
 * the real production extraction behavior, not a parallel
 * reimplementation that could quietly drift from it.
 */
export const EXTRACTION_PROMPT = `You are extracting a course concept graph from one course artifact. The course's subject is not fixed in advance -- it could be computer science, history, biology, or any other field. Infer the subject and its own vocabulary entirely from the attached content itself; never assume or default to any particular field.

Read the attached content and identify the distinct teachable concepts it introduces or discusses, and the relationships between them.

Rules:
- Only extract concepts and relationships that are actually present in this artifact. If the artifact has no extractable course content, return empty concepts and edges arrays -- do not invent placeholder content.
- Every concept and every edge MUST include at least one sourceAnchor (locator + a short excerpt or close paraphrase) grounding it in this specific artifact. Never omit this.
- Use the standard relationType taxonomy (prerequisite_for, part_of, mechanism_for, contrasts_with, used_in, generalizes_to, example_of) wherever one fits. Only use "other" when none of these genuinely fit, and in that case you MUST fill in relationTypeNote explaining why.
- Assign each concept a short, stable localId (e.g. "c1", "c2") and reference those localIds from edges -- do not invent ids that look like database ids.
- confidence and importanceScore are your own honest 0-1 estimates, not fixed defaults.`;

export async function callExtractionModel(
  openai: OpenAI,
  model: string,
  content: OpenAI.Responses.ResponseInputContent[],
): Promise<unknown> {
  const response = await openai.responses.create({
    model,
    input: [{ role: "user", content }],
    text: {
      format: {
        type: "json_schema",
        name: EXTRACTION_RESPONSE_SCHEMA.name,
        strict: EXTRACTION_RESPONSE_SCHEMA.strict,
        schema: EXTRACTION_RESPONSE_SCHEMA.schema,
      },
    },
  });

  return JSON.parse(response.output_text);
}
