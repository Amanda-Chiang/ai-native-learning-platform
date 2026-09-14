/**
 * Structured Outputs schema for the lightweight daily-quiz generation
 * call -- one call per eligible concept, deliberately its own type/schema
 * rather than assessment-generation-pipeline's CandidateQuestion
 * (docs/superpowers/specs/2026-09-12-lightweight-daily-quiz-design.md
 * "Generation & validation"). Multiple choice's shape (4 options + a
 * correct index, no rubric/checker duality) doesn't fit that type, and
 * this path is meant to stay cheap/fast, not share the heavy pipeline's
 * machinery.
 *
 * Relative import, not the "@/" alias -- same reasoning as
 * course-graph-ingestion/extraction-schema.ts: this file's parser must
 * stay resolvable by plain `node --test`, not only Next.js's bundler.
 */

export type CandidateMcqSourceAnchor = {
  locator: string;
  excerpt: string;
};

export type CandidateMcqQuestion = {
  questionText: string;
  options: string[];
  correctOptionIndex: number;
  sourceAnchors: CandidateMcqSourceAnchor[];
};

const sourceAnchorSchema = {
  type: "object",
  properties: {
    locator: { type: "string", description: "Human-readable pointer into the artifact, e.g. \"slide 4\"." },
    excerpt: { type: "string", description: "Short quoted or paraphrased grounding text." },
  },
  required: ["locator", "excerpt"],
  additionalProperties: false,
} as const;

const mcqQuestionSchema = {
  type: "object",
  properties: {
    questionText: { type: "string" },
    options: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
    correctOptionIndex: { type: "integer", minimum: 0, maximum: 3 },
    sourceAnchors: { type: "array", items: sourceAnchorSchema, minItems: 1 },
  },
  required: ["questionText", "options", "correctOptionIndex", "sourceAnchors"],
  additionalProperties: false,
} as const;

/**
 * One call generates 1-3 questions for a single concept -- the model
 * judges how many that concept's real material actually supports
 * (a narrow concept gets 1, one the source spends real space on can get
 * up to 3), instructed not to produce overlapping questions for the
 * same concept.
 */
export const MCQ_GENERATION_RESPONSE_SCHEMA = {
  name: "lightweight_mcq_generation",
  strict: true,
  schema: {
    type: "object",
    properties: {
      questions: { type: "array", items: mcqQuestionSchema, minItems: 1, maxItems: 3 },
    },
    required: ["questions"],
    additionalProperties: false,
  },
} as const;

export const MCQ_GENERATION_PROMPT = `Generate 1 to 3 lightweight multiple-choice questions for the given concept, grounded strictly in the provided source material. Judge how many questions this concept's material actually supports: a narrow, single-fact concept should get just 1; a concept the material spends real space developing can get up to 3 -- but never produce two questions that test the same fact from this same concept (no overlap).

Each question must have exactly 4 options, exactly one of them correct (correctOptionIndex, 0-indexed). Questions must be answerable from memory in a few seconds -- test recall or a single-step application of the concept, never require multi-step reasoning, drawing, or writing. Distractors must be plausible (not obviously wrong) but never state something also literally true elsewhere in the material -- avoid ambiguity. Every question needs at least one real sourceAnchor citing the provided material -- never invent facts not present in it, and never copy a source excerpt verbatim into questionText (paraphrase and apply the idea instead).`;

function isCandidateMcqSourceAnchor(value: unknown): value is CandidateMcqSourceAnchor {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return isNonEmptyString(v.locator) && isNonEmptyString(v.excerpt);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isCandidateMcqQuestion(value: unknown): value is CandidateMcqQuestion {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (!isNonEmptyString(v.questionText)) return false;
  if (!Array.isArray(v.options) || v.options.length !== 4) return false;
  if (!v.options.every(isNonEmptyString)) return false;
  // Every option must be a distinct string -- a duplicate option is
  // never a real 4-way choice, regardless of which index is "correct".
  if (new Set(v.options as string[]).size !== 4) return false;
  if (typeof v.correctOptionIndex !== "number" || !Number.isInteger(v.correctOptionIndex)) return false;
  if (v.correctOptionIndex < 0 || v.correctOptionIndex > 3) return false;
  if (!Array.isArray(v.sourceAnchors) || v.sourceAnchors.length < 1) return false;
  if (!v.sourceAnchors.every(isCandidateMcqSourceAnchor)) return false;
  return true;
}

/**
 * Validates a raw parsed-JSON generation response against the schema's
 * real invariants -- same "never trust an external response without
 * also checking it itself" discipline as every other parser in this
 * codebase (extraction-schema.ts, candidate-generation-schema.ts).
 * Throws with a specific message on anything invalid, never coerces a
 * malformed response into a plausible-looking empty/default result.
 */
export function parseMcqGenerationResult(raw: unknown): CandidateMcqQuestion[] {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("MCQ generation response is not an object.");
  }
  const v = raw as Record<string, unknown>;
  if (!Array.isArray(v.questions) || v.questions.length === 0) {
    throw new Error("MCQ generation response's \"questions\" array is missing or empty.");
  }
  if (!v.questions.every(isCandidateMcqQuestion)) {
    throw new Error("MCQ generation response's \"questions\" array contains an invalid question.");
  }
  return v.questions;
}
