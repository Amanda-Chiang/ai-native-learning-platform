// Relative import, not the "@/" tsconfig path alias used elsewhere in
// this codebase: STANDARD_RELATION_TYPES is a real runtime value (not
// type-only), so unlike a type-only import it can't be erased before
// Node tries to resolve it -- and the "@/" alias only resolves under
// Next.js's own bundler, not plain `node --test` (found while running
// this file's unit tests directly).
import { STANDARD_RELATION_TYPES, type RelationType } from "../../types/domain/concept-edge.ts";

/**
 * Structured Outputs schema for one extraction call against one artifact
 * (research.md "Extraction provider integration").
 *
 * Real database ids don't exist yet at extraction time -- concepts and
 * edges are still candidates. Edges reference their endpoints via a
 * `localId` the model assigns to each concept within the same response,
 * not a real concept id (a model-hallucinated UUID would be exactly the
 * kind of plausible-looking-but-fake value the no-silent-placeholders
 * rule forbids). The caller resolves `localId` -> real id after insert.
 *
 * `artifactId` is deliberately NOT part of what the model produces --
 * the model is only ever shown one artifact per call, so the caller
 * already knows it; asking the model to echo it back would let it
 * hallucinate an id it has no way to actually know is correct. The
 * caller attaches the real artifactId to every sourceAnchor itself.
 */

export type CandidateSourceAnchor = {
  locator: string;
  excerpt: string;
};

export type CandidateConcept = {
  localId: string;
  canonicalName: string;
  aliases: string[];
  description: string;
  importanceScore: number;
  sourceAnchors: CandidateSourceAnchor[];
  confidence: number;
};

export type CandidateEdge = {
  sourceLocalId: string;
  targetLocalId: string;
  relationType: RelationType;
  /** Required when relationType === "other", null otherwise (Structured
   * Outputs strict mode requires every property present -- absence is
   * modeled as an explicit null, never an empty string standing in for
   * "not applicable"). */
  relationTypeNote: string | null;
  explanation: string;
  sourceAnchors: CandidateSourceAnchor[];
  confidence: number;
};

export type ExtractionResult = {
  concepts: CandidateConcept[];
  edges: CandidateEdge[];
};

const ALL_RELATION_TYPES: readonly string[] = [...STANDARD_RELATION_TYPES, "other"];

const sourceAnchorSchema = {
  type: "object",
  properties: {
    locator: { type: "string", description: "Human-readable pointer into the artifact, e.g. \"slide 14\", \"problem 3\"." },
    excerpt: { type: "string", description: "Short quoted or paraphrased grounding text." },
  },
  required: ["locator", "excerpt"],
  additionalProperties: false,
};

/**
 * The exact JSON schema passed as response_format's json_schema for the
 * extraction call. Every candidate concept/edge MUST have at least one
 * source anchor (minItems: 1) -- Structured Outputs enforces this at
 * generation time, not just at insert time, so the model can't produce
 * an unanchored claim that a later validation step has to catch.
 */
export const EXTRACTION_RESPONSE_SCHEMA = {
  name: "course_graph_extraction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      concepts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            localId: { type: "string" },
            canonicalName: { type: "string" },
            aliases: { type: "array", items: { type: "string" } },
            description: { type: "string" },
            importanceScore: { type: "number" },
            sourceAnchors: { type: "array", items: sourceAnchorSchema, minItems: 1 },
            confidence: { type: "number" },
          },
          required: [
            "localId",
            "canonicalName",
            "aliases",
            "description",
            "importanceScore",
            "sourceAnchors",
            "confidence",
          ],
          additionalProperties: false,
        },
      },
      edges: {
        type: "array",
        items: {
          type: "object",
          properties: {
            sourceLocalId: { type: "string" },
            targetLocalId: { type: "string" },
            relationType: { type: "string", enum: ALL_RELATION_TYPES },
            relationTypeNote: { type: ["string", "null"] },
            explanation: { type: "string" },
            sourceAnchors: { type: "array", items: sourceAnchorSchema, minItems: 1 },
            confidence: { type: "number" },
          },
          required: [
            "sourceLocalId",
            "targetLocalId",
            "relationType",
            "relationTypeNote",
            "explanation",
            "sourceAnchors",
            "confidence",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["concepts", "edges"],
    additionalProperties: false,
  },
} as const;

function isCandidateSourceAnchor(value: unknown): value is CandidateSourceAnchor {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.locator === "string" && typeof v.excerpt === "string";
}

function isCandidateConcept(value: unknown): value is CandidateConcept {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.localId !== "string") return false;
  if (typeof v.canonicalName !== "string") return false;
  if (!Array.isArray(v.aliases) || !v.aliases.every((a) => typeof a === "string")) return false;
  if (typeof v.description !== "string") return false;
  if (typeof v.importanceScore !== "number") return false;
  if (typeof v.confidence !== "number") return false;
  if (!Array.isArray(v.sourceAnchors) || v.sourceAnchors.length < 1) return false;
  if (!v.sourceAnchors.every(isCandidateSourceAnchor)) return false;
  return true;
}

function isCandidateEdge(value: unknown): value is CandidateEdge {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.sourceLocalId !== "string") return false;
  if (typeof v.targetLocalId !== "string") return false;
  if (typeof v.relationType !== "string" || !ALL_RELATION_TYPES.includes(v.relationType)) return false;
  if (v.relationTypeNote !== null && typeof v.relationTypeNote !== "string") return false;
  if (v.relationType === "other" && !v.relationTypeNote) return false;
  if (v.relationType !== "other" && v.relationTypeNote !== null) return false;
  if (typeof v.explanation !== "string") return false;
  if (typeof v.confidence !== "number") return false;
  if (!Array.isArray(v.sourceAnchors) || v.sourceAnchors.length < 1) return false;
  if (!v.sourceAnchors.every(isCandidateSourceAnchor)) return false;
  return true;
}

/**
 * Validates a raw parsed-JSON response against the schema's real
 * invariants (Structured Outputs guarantees the *shape* server-side, but
 * this codebase never trusts an external response without also checking
 * it itself -- and this is the one place relationTypeNote's
 * required/forbidden pairing and the non-empty-sourceAnchors rule are
 * actually enforced against untrusted input, not just declared in the
 * schema). Throws with a specific message on anything invalid -- never
 * returns a coerced-empty result for a malformed response, which would
 * be indistinguishable from "this artifact genuinely had no content"
 * (spec.md Edge Cases).
 */
export function parseExtractionResult(raw: unknown): ExtractionResult {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Extraction response is not an object.");
  }
  const v = raw as Record<string, unknown>;

  if (!Array.isArray(v.concepts) || !v.concepts.every(isCandidateConcept)) {
    throw new Error("Extraction response's \"concepts\" array is missing or invalid.");
  }
  if (!Array.isArray(v.edges) || !v.edges.every(isCandidateEdge)) {
    throw new Error("Extraction response's \"edges\" array is missing or invalid.");
  }

  const localIds = new Set(v.concepts.map((c) => c.localId));
  for (const edge of v.edges) {
    if (!localIds.has(edge.sourceLocalId)) {
      throw new Error(`Edge references unknown sourceLocalId "${edge.sourceLocalId}".`);
    }
    if (!localIds.has(edge.targetLocalId)) {
      throw new Error(`Edge references unknown targetLocalId "${edge.targetLocalId}".`);
    }
  }

  return { concepts: v.concepts, edges: v.edges };
}
