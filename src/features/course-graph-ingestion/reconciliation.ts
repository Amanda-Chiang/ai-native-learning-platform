import type OpenAI from "openai";

/**
 * Reconciliation: compares one candidate concept against the course's
 * current concept list and classifies it (research.md "Reconciliation:
 * LLM comparison against the existing concept list, not embeddings").
 *
 * A closed three-way outcome, not a numeric similarity threshold
 * (research.md "'Substantially overlaps', made concrete") -- there is no
 * calibration data yet to justify any specific number, and a
 * fabricated-looking threshold would itself be exactly the kind of
 * unearned placeholder value this project has decided against.
 */

export type ReconciliationCandidateConcept = {
  canonicalName: string;
  aliases: string[];
  description: string;
};

export type ExistingConceptSummary = {
  id: string;
  canonicalName: string;
  aliases: string[];
  description: string;
};

export type ReconciliationResult =
  | { decision: "merge"; matchedConceptId: string; reasoning: string }
  | { decision: "distinct"; reasoning: string }
  | { decision: "uncertain"; reasoning: string };

/**
 * The classification call itself, factored out as an injectable
 * function -- reconciliation's *orchestration* (the zero-existing-
 * concepts shortcut, wiring into the extraction pipeline) is
 * deterministic and unit-testable; the *classification itself* is an
 * LLM call and isn't something a unit test can meaningfully fake being
 * "correct" about (that's what scripts/score-extraction.ts's corpus
 * comparison is for, not a mocked unit test pretending to know the
 * right answer).
 */
export type ReconciliationClassifier = (
  candidate: ReconciliationCandidateConcept,
  existingConcepts: ExistingConceptSummary[],
) => Promise<ReconciliationResult>;

const RECONCILIATION_RESPONSE_SCHEMA = {
  name: "concept_reconciliation",
  strict: true,
  schema: {
    type: "object",
    properties: {
      decision: { type: "string", enum: ["merge", "distinct", "uncertain"] },
      matchedConceptId: { type: ["string", "null"] },
      reasoning: { type: "string" },
    },
    required: ["decision", "matchedConceptId", "reasoning"],
    additionalProperties: false,
  },
} as const;

function isValidClassificationShape(
  value: unknown,
): value is { decision: "merge" | "distinct" | "uncertain"; matchedConceptId: string | null; reasoning: string } {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.decision !== "merge" && v.decision !== "distinct" && v.decision !== "uncertain") return false;
  if (v.matchedConceptId !== null && typeof v.matchedConceptId !== "string") return false;
  if (typeof v.reasoning !== "string") return false;
  return true;
}

/**
 * Builds a ReconciliationClassifier backed by a real OpenAI call.
 * Separate from `reconcileConcept` below so a test can supply a fake
 * classifier instead of this one.
 */
export function createOpenAiReconciliationClassifier(
  openai: OpenAI,
  model: string,
): ReconciliationClassifier {
  return async (candidate, existingConcepts) => {
    const response = await openai.responses.create({
      model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "You are reconciling one newly extracted course concept against a course's existing concept list.",
                "Decide exactly one of: \"merge\" (this candidate is the same underlying idea as one existing concept, possibly under a different name/phrasing -- set matchedConceptId to that concept's id), \"distinct\" (this is genuinely a different, new concept), or \"uncertain\" (you are not confident either way -- never guess merge or distinct when you're not sure).",
                "",
                `Candidate: ${JSON.stringify(candidate)}`,
                "",
                `Existing concepts: ${JSON.stringify(existingConcepts)}`,
              ].join("\n"),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: RECONCILIATION_RESPONSE_SCHEMA.name,
          strict: RECONCILIATION_RESPONSE_SCHEMA.strict,
          schema: RECONCILIATION_RESPONSE_SCHEMA.schema,
        },
      },
    });

    const raw: unknown = JSON.parse(response.output_text);
    if (!isValidClassificationShape(raw)) {
      throw new Error("Reconciliation response failed schema validation.");
    }
    if (raw.decision === "merge") {
      if (!raw.matchedConceptId) {
        throw new Error("Reconciliation returned decision \"merge\" without a matchedConceptId.");
      }
      return { decision: "merge", matchedConceptId: raw.matchedConceptId, reasoning: raw.reasoning };
    }
    return { decision: raw.decision, reasoning: raw.reasoning };
  };
}

/**
 * Orchestrates one candidate's reconciliation. A course with zero
 * existing concepts has nothing to reconcile against -- this is a real,
 * different case from "the model was confident they're distinct" (no
 * model call happens at all), so it's handled here explicitly rather
 * than by feeding an empty list to the classifier and hoping it
 * behaves sensibly on an edge case it wasn't really asked about.
 */
export async function reconcileConcept(
  classify: ReconciliationClassifier,
  candidate: ReconciliationCandidateConcept,
  existingConcepts: ExistingConceptSummary[],
): Promise<ReconciliationResult> {
  if (existingConcepts.length === 0) {
    return { decision: "distinct", reasoning: "No existing concepts in this course yet to compare against." };
  }
  return classify(candidate, existingConcepts);
}

// ============================================================
// Unit reconciliation -- structurally identical to concept
// reconciliation above, kept as a separate parallel pair rather than
// a shared generic (see plan Task 4's rationale: matchedConceptId's
// field name is concept-specific, and a forced generic over a
// 3-branch discriminated union reads worse than ~40 lines of
// duplication here).
// ============================================================

export type ExistingUnitSummary = {
  id: string;
  title: string;
};

export type ReconciliationCandidateUnit = {
  title: string;
};

export type UnitReconciliationResult =
  | { decision: "merge"; matchedUnitId: string; reasoning: string }
  | { decision: "distinct"; reasoning: string }
  | { decision: "uncertain"; reasoning: string };

export type UnitReconciliationClassifier = (
  candidate: ReconciliationCandidateUnit,
  existingUnits: ExistingUnitSummary[],
) => Promise<UnitReconciliationResult>;

const UNIT_RECONCILIATION_RESPONSE_SCHEMA = {
  name: "unit_reconciliation",
  strict: true,
  schema: {
    type: "object",
    properties: {
      decision: { type: "string", enum: ["merge", "distinct", "uncertain"] },
      matchedUnitId: { type: ["string", "null"] },
      reasoning: { type: "string" },
    },
    required: ["decision", "matchedUnitId", "reasoning"],
    additionalProperties: false,
  },
} as const;

function isValidUnitClassificationShape(
  value: unknown,
): value is { decision: "merge" | "distinct" | "uncertain"; matchedUnitId: string | null; reasoning: string } {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.decision !== "merge" && v.decision !== "distinct" && v.decision !== "uncertain") return false;
  if (v.matchedUnitId !== null && typeof v.matchedUnitId !== "string") return false;
  if (typeof v.reasoning !== "string") return false;
  return true;
}

export function createOpenAiUnitReconciliationClassifier(
  openai: OpenAI,
  model: string,
): UnitReconciliationClassifier {
  return async (candidate, existingUnits) => {
    const response = await openai.responses.create({
      model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "You are reconciling one newly extracted course unit (a coarse topic grouping, e.g. \"Graph Theory\") against a course's existing unit list.",
                "Decide exactly one of: \"merge\" (this candidate is the same underlying topic as one existing unit, possibly under a different name -- set matchedUnitId to that unit's id), \"distinct\" (this is genuinely a different, new topic grouping), or \"uncertain\" (you are not confident either way -- never guess merge or distinct when you're not sure).",
                "",
                `Candidate: ${JSON.stringify(candidate)}`,
                "",
                `Existing units: ${JSON.stringify(existingUnits)}`,
              ].join("\n"),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: UNIT_RECONCILIATION_RESPONSE_SCHEMA.name,
          strict: UNIT_RECONCILIATION_RESPONSE_SCHEMA.strict,
          schema: UNIT_RECONCILIATION_RESPONSE_SCHEMA.schema,
        },
      },
    });

    const raw: unknown = JSON.parse(response.output_text);
    if (!isValidUnitClassificationShape(raw)) {
      throw new Error("Unit reconciliation response failed schema validation.");
    }
    if (raw.decision === "merge") {
      if (!raw.matchedUnitId) {
        throw new Error("Unit reconciliation returned decision \"merge\" without a matchedUnitId.");
      }
      return { decision: "merge", matchedUnitId: raw.matchedUnitId, reasoning: raw.reasoning };
    }
    return { decision: raw.decision, reasoning: raw.reasoning };
  };
}

export async function reconcileUnit(
  classify: UnitReconciliationClassifier,
  candidate: ReconciliationCandidateUnit,
  existingUnits: ExistingUnitSummary[],
): Promise<UnitReconciliationResult> {
  if (existingUnits.length === 0) {
    return { decision: "distinct", reasoning: "No existing units in this course yet to compare against." };
  }
  return classify(candidate, existingUnits);
}
