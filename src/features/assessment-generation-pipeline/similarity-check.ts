import type OpenAI from "openai";
import type { LayerResult } from "./source-alignment-check.ts";
import type { CandidateQuestion } from "./candidate-generation-schema.ts";

const SIMILARITY_MODEL = process.env.OPENAI_GRADING_MODEL ?? "gpt-4.1";

const SIMILARITY_SCHEMA = {
  name: "similarity_review_result",
  strict: true,
  schema: {
    type: "object",
    properties: { isNearCopy: { type: "boolean" }, reasoning: { type: "string" } },
    required: ["isNearCopy", "reasoning"],
    additionalProperties: false,
  },
} as const;

/**
 * A reviewer model call comparing the candidate against the course's
 * own confirmed source-anchor excerpts (research.md "Similarity check:
 * no new retrieval/embeddings infrastructure") -- reuses the already-
 * extracted material course-graph-ingestion produced, no new
 * embeddings pipeline. Not unit tested here; exhaustive scenario
 * coverage is User Story 4's job (tasks.md T021).
 */
export async function checkSimilarity(
  openai: OpenAI,
  candidate: CandidateQuestion,
  courseSourceExcerpts: string[],
): Promise<LayerResult> {
  const response = await openai.responses.create({
    model: SIMILARITY_MODEL,
    input: [
      {
        role: "user",
        content: `Compare this candidate question against the course's own real source material excerpts below. Is the candidate a near-copy or close paraphrase of any single excerpt (not just covering the same concept, but restating it closely)?\n\nCandidate question: ${candidate.questionText}\n\nCourse source excerpts:\n${courseSourceExcerpts.map((e) => `- ${e}`).join("\n") || "(none available)"}`,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: SIMILARITY_SCHEMA.name,
        strict: SIMILARITY_SCHEMA.strict,
        schema: SIMILARITY_SCHEMA.schema,
      },
    },
  });
  const parsed = JSON.parse(response.output_text) as { isNearCopy: boolean; reasoning: string };
  return {
    passed: !parsed.isNearCopy,
    detail: parsed.isNearCopy
      ? `Flagged as a near-copy of course source material: ${parsed.reasoning}`
      : `Not a near-copy of any course source excerpt: ${parsed.reasoning}`,
  };
}
