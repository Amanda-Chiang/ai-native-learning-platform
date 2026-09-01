import { EVIDENCE_TYPES } from "../../types/domain/evidence-event.ts";

/**
 * JSON-schema tool definitions passed to the OpenAI Responses API's
 * `tools` array (research.md "Why not the separate @openai/agents
 * package" -- this feature drives its own tool-calling loop directly on
 * the same `openai` client course-graph-ingestion already uses).
 *
 * Exactly this feature's 5-tool surface (contracts/tutor-actions.md,
 * plan.md's Constraints) -- no assessment-generation/grading tool is
 * defined here (FR-014).
 */

export const SEARCH_COURSE_MATERIALS_TOOL = {
  type: "function" as const,
  name: "search_course_materials",
  description:
    "Search this course's confirmed concepts and relationships for material relevant to a query. Returns only real, source-anchored content -- an empty result means the course material genuinely doesn't cover the query.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "What to search for." },
      conceptIds: {
        type: "array",
        items: { type: "string" },
        description: "Optional: restrict the search to these concept ids.",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  strict: false,
};

export const GET_CONCEPT_STATE_TOOL = {
  type: "function" as const,
  name: "get_concept_state",
  description:
    "Read the student's real, recorded mastery state for one or more concepts. A concept with no recorded evidence returns the genuine 'unverified' baseline -- never assume a stronger state than what this tool returns.",
  parameters: {
    type: "object",
    properties: {
      conceptIds: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
      },
    },
    required: ["conceptIds"],
    additionalProperties: false,
  },
  strict: false,
};

export const GET_CONCEPT_NEIGHBORS_TOOL = {
  type: "function" as const,
  name: "get_concept_neighbors",
  description:
    "Read the confirmed relationships and neighboring concepts connected to one concept, including each neighbor's real recorded state.",
  parameters: {
    type: "object",
    properties: {
      conceptId: { type: "string" },
    },
    required: ["conceptId"],
    additionalProperties: false,
  },
  strict: false,
};

export const RECORD_EXPOSURE_TOOL = {
  type: "function" as const,
  name: "record_exposure",
  description:
    "Record one real thing the student just did as evidence -- an independent correct retrieval/application, an incorrect attempt, or passive exposure to a concept/relationship. This is the only way to affect the student's recorded mastery state; it never changes state directly. Use evidenceType 'exposure' for passive mention/exposure only, never for an independent demonstration.",
  parameters: {
    type: "object",
    properties: {
      conceptIds: { type: "array", items: { type: "string" } },
      edgeIds: { type: "array", items: { type: "string" } },
      evidenceType: { type: "string", enum: [...EVIDENCE_TYPES] },
      correctness: { type: ["boolean", "null"] },
      graderConfidence: { type: "number" },
      assistanceLevel: { type: "number" },
      difficulty: { type: "number" },
      transferDistance: { type: "number" },
      studentConfidence: { type: "number" },
    },
    required: [
      "conceptIds",
      "edgeIds",
      "evidenceType",
      "correctness",
      "graderConfidence",
      "assistanceLevel",
      "difficulty",
      "transferDistance",
    ],
    additionalProperties: false,
  },
  strict: false,
};

export const RECORD_MISCONCEPTION_CANDIDATE_TOOL = {
  type: "function" as const,
  name: "record_misconception_candidate",
  description:
    "Record a recognized, recurring wrong-belief pattern about a concept -- not for an isolated incorrect answer (use record_exposure for that). Always recorded as incorrect, independent evidence.",
  parameters: {
    type: "object",
    properties: {
      conceptIds: { type: "array", items: { type: "string" } },
      description: {
        type: "string",
        description: "Why this looks like a specific, recurring misconception, for the audit trail.",
      },
      graderConfidence: { type: "number" },
      assistanceLevel: { type: "number" },
      difficulty: { type: "number" },
      transferDistance: { type: "number" },
      studentConfidence: { type: "number" },
    },
    required: [
      "conceptIds",
      "description",
      "graderConfidence",
      "assistanceLevel",
      "difficulty",
      "transferDistance",
    ],
    additionalProperties: false,
  },
  strict: false,
};

export const TUTOR_TOOLS = [
  SEARCH_COURSE_MATERIALS_TOOL,
  GET_CONCEPT_STATE_TOOL,
  GET_CONCEPT_NEIGHBORS_TOOL,
  RECORD_EXPOSURE_TOOL,
  RECORD_MISCONCEPTION_CANDIDATE_TOOL,
];

export type TutorToolName = (typeof TUTOR_TOOLS)[number]["name"];
