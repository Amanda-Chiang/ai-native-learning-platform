// Relative imports, not the "@/" tsconfig path alias -- these are real
// runtime values (RESPONSE_MODALITIES) or types re-exported from files
// that must stay resolvable by plain `node --test` (same reasoning as
// course-graph-ingestion/extraction-schema.ts).
import { RESPONSE_MODALITIES, type ResponseModality } from "../../types/domain/assessment.ts";

/**
 * Structured Outputs schema for one generation call (data-model.md
 * "CandidateQuestion: what generation produces").
 *
 * `checkerDomain`/`checkerInput` are required to be both-null or
 * both-set (research.md "Independent-solve dispatch: the candidate
 * declares its own checker domain") -- the generating model is the
 * only place that reliably knows which of deterministic-grading's five
 * domains (if any) applies, since there's no clean mechanical mapping
 * from responseModality alone.
 */

export const CHECKER_DOMAINS = [
  "bfs-dfs",
  "heap",
  "tree-traversal",
  "tree-insertion",
  "topological-sort",
  "shortest-path",
] as const;

export type CheckerDomain = (typeof CHECKER_DOMAINS)[number];

export type CandidateSourceAnchor = {
  conceptOrEdgeId: string;
  locator: string;
  excerpt: string;
};

export type CandidateQuestion = {
  questionText: string;
  rubric: Record<string, unknown>;
  hints: string[];
  commonMistakes: string[];
  sourceAnchors: CandidateSourceAnchor[];
  responseModality: ResponseModality;
  checkerDomain: CheckerDomain | null;
  checkerInput: unknown | null;
};

const sourceAnchorSchema = {
  type: "object",
  properties: {
    conceptOrEdgeId: { type: "string" },
    locator: { type: "string" },
    excerpt: { type: "string" },
  },
  required: ["conceptOrEdgeId", "locator", "excerpt"],
  additionalProperties: false,
} as const;

/**
 * `checkerInput` is left as an untyped JSON object in the schema itself
 * (Structured Outputs' `additionalProperties: false` strict mode can't
 * express "shape depends on the sibling checkerDomain value" as a
 * conditional union) -- parseCandidateResult below is what actually
 * enforces the both-null/both-set pairing and is the one place this
 * matters, same division of labor as extraction-schema.ts's
 * relationTypeNote pairing (declared loosely in the schema, enforced
 * exactly in the parser).
 */
export const CANDIDATE_GENERATION_RESPONSE_SCHEMA = {
  name: "assessment_candidate_generation",
  strict: true,
  schema: {
    type: "object",
    properties: {
      questionText: { type: "string" },
      rubric: { type: "object", additionalProperties: true },
      hints: { type: "array", items: { type: "string" } },
      commonMistakes: { type: "array", items: { type: "string" } },
      sourceAnchors: { type: "array", items: sourceAnchorSchema, minItems: 1 },
      responseModality: { type: "string", enum: [...RESPONSE_MODALITIES] },
      checkerDomain: { type: ["string", "null"], enum: [...CHECKER_DOMAINS, null] },
      checkerInput: { type: ["object", "null"], additionalProperties: true },
    },
    required: [
      "questionText",
      "rubric",
      "hints",
      "commonMistakes",
      "sourceAnchors",
      "responseModality",
      "checkerDomain",
      "checkerInput",
    ],
    additionalProperties: false,
  },
} as const;

export const CANDIDATE_GENERATION_PROMPT = `Generate one assessment question grounded strictly in the provided course material. Every claim you make must be traceable to a real sourceAnchor citing one of the target concepts/edges you were given -- never invent facts not present in that material, and never copy any source excerpt verbatim into questionText (paraphrase and apply the idea instead).

If the question corresponds to one of these checker domains -- bfs-dfs, heap, tree-traversal, tree-insertion, topological-sort, shortest-path -- set checkerDomain to that value and checkerInput to the exact structured input deterministic-grading's checker for that domain expects, including the claimed/expected answer fields matching what your own rubric states as correct. If no exact checker applies to this question, set both checkerDomain and checkerInput to null.`;

function isCandidateSourceAnchor(value: unknown): value is CandidateSourceAnchor {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.conceptOrEdgeId === "string" &&
    typeof v.locator === "string" &&
    typeof v.excerpt === "string"
  );
}

/**
 * Validates a raw parsed-JSON generation response against the schema's
 * real invariants -- same "never trust an external response without
 * also checking it itself" discipline as
 * course-graph-ingestion/extraction-schema.ts's parseExtractionResult.
 * Throws with a specific message on anything invalid, never coerces a
 * malformed response into a plausible-looking empty/default candidate.
 */
export function parseCandidateResult(raw: unknown): CandidateQuestion {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Candidate generation response is not an object.");
  }
  const v = raw as Record<string, unknown>;

  if (typeof v.questionText !== "string" || v.questionText.length === 0) {
    throw new Error("Candidate response's \"questionText\" is missing or empty.");
  }
  if (typeof v.rubric !== "object" || v.rubric === null) {
    throw new Error("Candidate response's \"rubric\" is missing or invalid.");
  }
  if (!Array.isArray(v.hints) || !v.hints.every((h) => typeof h === "string")) {
    throw new Error("Candidate response's \"hints\" is missing or invalid.");
  }
  if (!Array.isArray(v.commonMistakes) || !v.commonMistakes.every((m) => typeof m === "string")) {
    throw new Error("Candidate response's \"commonMistakes\" is missing or invalid.");
  }
  if (!Array.isArray(v.sourceAnchors) || v.sourceAnchors.length < 1 || !v.sourceAnchors.every(isCandidateSourceAnchor)) {
    throw new Error("Candidate response's \"sourceAnchors\" is missing, empty, or invalid.");
  }
  if (typeof v.responseModality !== "string" || !(RESPONSE_MODALITIES as readonly string[]).includes(v.responseModality)) {
    throw new Error(`Candidate response's "responseModality" is missing or invalid: ${String(v.responseModality)}.`);
  }

  const checkerDomainIsNull = v.checkerDomain === null;
  const checkerInputIsNull = v.checkerInput === null;
  if (checkerDomainIsNull !== checkerInputIsNull) {
    throw new Error(
      "Candidate response's \"checkerDomain\" and \"checkerInput\" must both be null or both be set -- got one without the other.",
    );
  }
  if (!checkerDomainIsNull && !(CHECKER_DOMAINS as readonly string[]).includes(v.checkerDomain as string)) {
    throw new Error(`Candidate response's "checkerDomain" is not a recognized domain: ${String(v.checkerDomain)}.`);
  }
  if (!checkerInputIsNull && (typeof v.checkerInput !== "object")) {
    throw new Error("Candidate response's \"checkerInput\" must be an object when checkerDomain is set.");
  }

  return {
    questionText: v.questionText,
    rubric: v.rubric as Record<string, unknown>,
    hints: v.hints,
    commonMistakes: v.commonMistakes,
    sourceAnchors: v.sourceAnchors,
    responseModality: v.responseModality as ResponseModality,
    checkerDomain: (v.checkerDomain as CheckerDomain | null) ?? null,
    checkerInput: v.checkerInput ?? null,
  };
}
