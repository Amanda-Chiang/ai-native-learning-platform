import type { LayerResult } from "./source-alignment-check.ts";

/** Tunable starting parameter, not a calibrated constant (research.md
 * "Bounded regeneration: one config constant, not scattered magic
 * numbers") -- same convention as evidence-weights.ts's strengthByType,
 * assistance-ladder.ts's attemptsPerStep, and deterministic-grading's
 * DEFAULT_RUBRIC_GRADING_CONFIDENCE_THRESHOLD. */
export const MAX_GENERATION_ATTEMPTS = 3;

export type ValidationReport = {
  schema: LayerResult;
  sourceAlignment: LayerResult;
  independentSolve: LayerResult & { checkerResult?: unknown };
  answerAgreement: LayerResult;
  ambiguity: LayerResult;
  similarity: LayerResult;
};

const NOT_REACHED: LayerResult = { passed: false, detail: "not reached" };

/**
 * One runner per layer, injected rather than called directly -- this is
 * what lets tests exercise the six-layer short-circuit/ordering logic
 * with canned results (tests/unit/assessment-generation-pipeline/validation-pipeline.test.ts)
 * without making any real model/DB call, while production code
 * (trigger/generate-assessment.ts) supplies runners bound to the real
 * OpenAI/Supabase clients.
 */
export type LayerRunners = {
  schema: () => LayerResult | Promise<LayerResult>;
  sourceAlignment: () => LayerResult | Promise<LayerResult>;
  independentSolve: () => (LayerResult & { checkerResult?: unknown }) | Promise<LayerResult & { checkerResult?: unknown }>;
  answerAgreement: (independentSolveResult: LayerResult & { checkerResult?: unknown }) => LayerResult | Promise<LayerResult>;
  ambiguity: () => LayerResult | Promise<LayerResult>;
  similarity: () => LayerResult | Promise<LayerResult>;
};

/**
 * Runs all six validation layers in order (data-model.md), short-
 * circuiting further layers the moment one fails -- no point running an
 * ambiguity check on a candidate whose answer key is already known
 * wrong. Every layer that never ran is recorded as `{ passed: false,
 * detail: "not reached" }`, never a fabricated pass (no-silent-
 * placeholders).
 */
export async function runValidationLayers(runners: LayerRunners): Promise<ValidationReport> {
  const schema = await runners.schema();
  if (!schema.passed) {
    return {
      schema,
      sourceAlignment: NOT_REACHED,
      independentSolve: NOT_REACHED,
      answerAgreement: NOT_REACHED,
      ambiguity: NOT_REACHED,
      similarity: NOT_REACHED,
    };
  }

  const sourceAlignment = await runners.sourceAlignment();
  if (!sourceAlignment.passed) {
    return {
      schema,
      sourceAlignment,
      independentSolve: NOT_REACHED,
      answerAgreement: NOT_REACHED,
      ambiguity: NOT_REACHED,
      similarity: NOT_REACHED,
    };
  }

  const independentSolve = await runners.independentSolve();
  if (!independentSolve.passed) {
    return {
      schema,
      sourceAlignment,
      independentSolve,
      answerAgreement: NOT_REACHED,
      ambiguity: NOT_REACHED,
      similarity: NOT_REACHED,
    };
  }

  const answerAgreement = await runners.answerAgreement(independentSolve);
  if (!answerAgreement.passed) {
    return {
      schema,
      sourceAlignment,
      independentSolve,
      answerAgreement,
      ambiguity: NOT_REACHED,
      similarity: NOT_REACHED,
    };
  }

  const ambiguity = await runners.ambiguity();
  if (!ambiguity.passed) {
    return { schema, sourceAlignment, independentSolve, answerAgreement, ambiguity, similarity: NOT_REACHED };
  }

  const similarity = await runners.similarity();
  return { schema, sourceAlignment, independentSolve, answerAgreement, ambiguity, similarity };
}
