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
export const EXTRACTION_PROMPT_BASE = `You are extracting a course concept graph from one course artifact. The course's subject is not fixed in advance -- it could be computer science, history, biology, or any other field. Infer the subject and its own vocabulary entirely from the attached content itself; never assume or default to any particular field.

Read the attached content and identify the distinct teachable concepts it introduces or discusses, and the relationships between them, and the coarse topic/unit groupings (e.g. "Graph Theory", "Dynamic Programming") they belong to.

Rules:
- Only extract concepts and relationships that are actually present in this artifact. If the artifact has no extractable course content, return empty units, concepts, and edges arrays -- do not invent placeholder content.
- Every concept and every edge MUST include at least one sourceAnchor (locator + a short excerpt or close paraphrase) grounding it in this specific artifact. Never omit this.
- Use the standard relationType taxonomy (prerequisite_for, part_of, mechanism_for, contrasts_with, used_in, generalizes_to, example_of) wherever one fits. Only use "other" when none of these genuinely fit, and in that case you MUST fill in relationTypeNote explaining why.
- Assign each concept a short, stable localId (e.g. "c1", "c2") and reference those localIds from edges -- do not invent ids that look like database ids.
- Assign each newly-proposed unit a short, stable localId (e.g. "u1", "u2") in the "units" array -- do not invent ids that look like database ids.
- Every concept's unitRef must be either {"kind":"existing","unitId":<a real id from the existing-units list below>} or {"kind":"new","localId":<one of this response's own units[].localId>}.
- confidence and importanceScore are your own honest 0-1 estimates, not fixed defaults.`;

/**
 * Builds the real prompt sent for one extraction call, given the
 * course's current units. `existingUnits` should include units with
 * status "proposed" or "confirmed" (not "archived") -- same filter
 * concepts already use for their own existing-list. When
 * `hardTargetUnit` is set (the artifact was explicitly tagged to a
 * unit at upload time), the model is told to attach every concept
 * there directly and is not offered the menu or a new-unit proposal
 * at all for this call -- a hard rule, not a hint (design.md).
 */
export function buildExtractionPrompt(
  existingUnits: { id: string; title: string }[],
  hardTargetUnit: { id: string; title: string } | null,
): string {
  if (hardTargetUnit) {
    return `${EXTRACTION_PROMPT_BASE}

This artifact has been explicitly tagged by its uploader as being for the unit "${hardTargetUnit.title}" (id: ${hardTargetUnit.id}). Every concept you extract MUST use unitRef {"kind":"existing","unitId":"${hardTargetUnit.id}"} -- do not propose any new unit, and do not attach any concept to a different unit, even if some content seems to belong elsewhere. The "units" array in your response must be empty.`;
  }

  const menu = existingUnits.length > 0
    ? existingUnits.map((u) => `- ${u.title} (id: ${u.id})`).join("\n")
    : "(none yet -- this course has no units so far)";

  return `${EXTRACTION_PROMPT_BASE}

This course's existing units:
${menu}

Prefer attaching a concept to one of these existing units (unitRef kind "existing") when the content clearly belongs there. Only propose a new unit (unitRef kind "new") when nothing existing fits.`;
}

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
