import { task } from "@trigger.dev/sdk";
import { createClient } from "@supabase/supabase-js";
import type OpenAI from "openai";
import type { Database } from "../src/lib/supabase/database.types.ts";
import { getOpenAiClient, isOpenAiConfigured } from "../src/lib/openai/client.ts";
import type { Assessment } from "../src/types/domain/assessment.ts";
import {
  CANDIDATE_GENERATION_PROMPT,
  CANDIDATE_GENERATION_RESPONSE_SCHEMA,
  parseCandidateResult,
  type CandidateQuestion,
} from "../src/features/assessment-generation-pipeline/candidate-generation-schema.ts";
import { checkSourceAlignment } from "../src/features/assessment-generation-pipeline/source-alignment-check.ts";
import { runIndependentSolve } from "../src/features/assessment-generation-pipeline/independent-solve.ts";
import { checkAnswerAgreement } from "../src/features/assessment-generation-pipeline/answer-agreement-check.ts";
import { checkAmbiguity } from "../src/features/assessment-generation-pipeline/ambiguity-check.ts";
import { checkSimilarity } from "../src/features/assessment-generation-pipeline/similarity-check.ts";
import {
  runValidationLayers,
  MAX_GENERATION_ATTEMPTS,
  type LayerRunners,
} from "../src/features/assessment-generation-pipeline/validation-pipeline.ts";

/**
 * Trigger.dev task contract: specs/008-assessment-generation-pipeline/contracts/generation-actions.md
 *
 * Runs as a Supabase service-role client, same reasoning as
 * trigger/extract-course-graph.ts: acts on behalf of the system, not
 * any single student's session -- both assessment_generation_runs and
 * question_bank have no insert policy for authenticated users.
 */
function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export type GenerateAssessmentPayload = {
  requestId: string;
  blueprint: Assessment;
  courseId: string;
};

const GENERATION_MODEL = process.env.OPENAI_GENERATION_MODEL ?? "gpt-4.1";

// Distinct, visible failure reasons (no-silent-placeholders) -- never a
// silent no-op indistinguishable from "generated a candidate that then
// failed validation".
export const MISSING_OPENAI_KEY_REASON = "OpenAI is not configured for this environment.";
export const NO_SOURCE_MATERIAL_REASON =
  "The blueprint's target concepts/edges have no confirmed source material to ground a question in.";

type TargetMaterial = {
  concepts: { id: string; canonicalName: string; description: string; sourceAnchors: unknown }[];
  edges: { id: string; explanation: string; sourceAnchors: unknown }[];
};

async function fetchTargetMaterial(
  supabase: ReturnType<typeof createAdminClient>,
  blueprint: Assessment,
): Promise<TargetMaterial> {
  const [conceptsRes, edgesRes] = await Promise.all([
    blueprint.targetConceptIds.length > 0
      ? supabase
          .from("course_concepts")
          .select("id, canonical_name, description, source_anchors")
          .in("id", blueprint.targetConceptIds)
          .eq("status", "confirmed")
      : Promise.resolve({ data: [] as { id: string; canonical_name: string; description: string; source_anchors: unknown }[] }),
    blueprint.targetEdgeIds.length > 0
      ? supabase
          .from("concept_edges")
          .select("id, explanation, source_anchors")
          .in("id", blueprint.targetEdgeIds)
          .eq("status", "confirmed")
      : Promise.resolve({ data: [] as { id: string; explanation: string; source_anchors: unknown }[] }),
  ]);

  return {
    concepts: (conceptsRes.data ?? []).map((row) => ({
      id: row.id,
      canonicalName: row.canonical_name,
      description: row.description,
      sourceAnchors: row.source_anchors,
    })),
    edges: (edgesRes.data ?? []).map((row) => ({
      id: row.id,
      explanation: row.explanation,
      sourceAnchors: row.source_anchors,
    })),
  };
}

function extractSourceExcerpts(material: TargetMaterial): string[] {
  const excerptsFrom = (anchors: unknown): string[] =>
    Array.isArray(anchors) ? anchors.map((a) => (a as { excerpt?: string }).excerpt).filter((e): e is string => typeof e === "string") : [];
  return [...material.concepts.flatMap((c) => excerptsFrom(c.sourceAnchors)), ...material.edges.flatMap((e) => excerptsFrom(e.sourceAnchors))];
}

function buildGenerationPrompt(blueprint: Assessment, material: TargetMaterial): string {
  return `${CANDIDATE_GENERATION_PROMPT}

Assessment type: ${blueprint.assessmentType}
Response modality: ${blueprint.responseModality}
Difficulty (0-1): ${blueprint.difficulty}
Expected solution properties: ${blueprint.expectedSolutionProperties.join(", ") || "(none specified)"}
Forbidden concepts (do not require these): ${blueprint.forbiddenConcepts.join(", ") || "(none)"}

Target concepts (cite these by id in sourceAnchors.conceptOrEdgeId):
${material.concepts.map((c) => `- [${c.id}] ${c.canonicalName}: ${c.description} (source: ${JSON.stringify(c.sourceAnchors)})`).join("\n") || "(none)"}

Target edges (cite these by id in sourceAnchors.conceptOrEdgeId):
${material.edges.map((e) => `- [${e.id}] ${e.explanation} (source: ${JSON.stringify(e.sourceAnchors)})`).join("\n") || "(none)"}`;
}

/**
 * Generates one CandidateQuestion grounded in the blueprint's real
 * confirmed target material. Throws (never returns a fabricated
 * candidate) when the model call or parsing fails -- the caller
 * decides how to record that as a failed attempt.
 */
export async function generateCandidate(
  openai: OpenAI,
  blueprint: Assessment,
  material: TargetMaterial,
): Promise<CandidateQuestion> {
  const response = await openai.responses.create({
    model: GENERATION_MODEL,
    input: [{ role: "user", content: buildGenerationPrompt(blueprint, material) }],
    text: {
      format: {
        type: "json_schema",
        name: CANDIDATE_GENERATION_RESPONSE_SCHEMA.name,
        strict: CANDIDATE_GENERATION_RESPONSE_SCHEMA.strict,
        schema: CANDIDATE_GENERATION_RESPONSE_SCHEMA.schema,
      },
    },
  });

  return parseCandidateResult(JSON.parse(response.output_text));
}

/**
 * Builds the real LayerRunners for one candidate -- the production
 * counterpart to validation-pipeline.test.ts's injected fakes. `schema`
 * always passes: parseCandidateResult (called by generateCandidate,
 * above) already threw before this candidate could exist, so reaching
 * here means it already parsed successfully -- this layer's entry in
 * the report documents that a schema check happened, not a fabricated
 * pass for a check that never ran.
 */
function buildRealRunners(
  openai: OpenAI,
  candidate: CandidateQuestion,
  blueprint: Assessment,
  courseSourceExcerpts: string[],
): LayerRunners {
  return {
    schema: () => ({ passed: true, detail: "Candidate parsed against the Structured Outputs schema successfully." }),
    sourceAlignment: () => checkSourceAlignment(candidate, blueprint),
    independentSolve: () => runIndependentSolve(candidate, openai),
    answerAgreement: (independentSolveResult) => checkAnswerAgreement(openai, candidate.rubric, independentSolveResult),
    ambiguity: () => checkAmbiguity(openai, candidate),
    similarity: () => checkSimilarity(openai, candidate, courseSourceExcerpts),
  };
}

async function markUnfulfilled(requestId: string, reason: string) {
  // No assessment_generation_runs row is written for a request that
  // never even attempted generation (FR-012's rejection already
  // happened one layer up, in actions.ts, before this task was ever
  // triggered) -- this path is specifically "triggered, but couldn't
  // proceed", still recorded as an outcome the caller sees via
  // getGenerationRun returning zero attempts + this reason, not a
  // silently-empty run.
  return { status: "failed" as const, reason, requestId };
}

/**
 * The task's real work, factored out of `run` so it can be invoked
 * directly (no live Trigger.dev project exists yet -- trigger.config.ts's
 * own documented placeholder-project caveat, same gap
 * course-graph-ingestion's extractCourseGraphTask already has) for live
 * verification against real Supabase/OpenAI per quickstart.md Group B,
 * without needing a real queue to exercise the real generate-validate-
 * persist mechanism end to end.
 */
export async function executeGeneration(payload: GenerateAssessmentPayload) {
  const supabase = createAdminClient();

  if (!isOpenAiConfigured()) {
    return markUnfulfilled(payload.requestId, MISSING_OPENAI_KEY_REASON);
  }
  const openai = getOpenAiClient();

  const material = await fetchTargetMaterial(supabase, payload.blueprint);
  if (material.concepts.length === 0 && material.edges.length === 0) {
    return markUnfulfilled(payload.requestId, NO_SOURCE_MATERIAL_REASON);
  }
  const courseSourceExcerpts = extractSourceExcerpts(material);

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("owner_id")
    .eq("id", payload.courseId)
    .single();
  if (courseError || !course) {
    throw new Error(`Course ${payload.courseId} not found -- cannot record generation runs.`);
  }

  for (let attemptNumber = 1; attemptNumber <= MAX_GENERATION_ATTEMPTS; attemptNumber += 1) {
    const candidate = await generateCandidate(openai, payload.blueprint, material);
    const runners = buildRealRunners(openai, candidate, payload.blueprint, courseSourceExcerpts);
    const validationReport = await runValidationLayers(runners);
    const outcome = Object.values(validationReport).every((layer) => layer.passed) ? "passed" : "failed";

    const { data: runRow, error: runInsertError } = await supabase
      .from("assessment_generation_runs")
      .insert({
        request_id: payload.requestId,
        course_id: payload.courseId,
        owner_id: course.owner_id,
        attempt_number: attemptNumber,
        blueprint: payload.blueprint as unknown as Record<string, unknown>,
        candidate: candidate as unknown as Record<string, unknown>,
        validation_report: validationReport as unknown as Record<string, unknown>,
        outcome,
      })
      .select("id")
      .single();

    if (runInsertError || !runRow) {
      throw new Error(`Failed to record generation attempt ${attemptNumber}: ${runInsertError?.message}`);
    }

    if (outcome === "passed") {
      const { error: bankInsertError } = await supabase.from("question_bank").insert({
        course_id: payload.courseId,
        owner_id: course.owner_id,
        generation_run_id: runRow.id,
        question_text: candidate.questionText,
        rubric: candidate.rubric,
        hints: candidate.hints,
        common_mistakes: candidate.commonMistakes,
        source_anchors: candidate.sourceAnchors,
        response_modality: candidate.responseModality,
        checker_domain: candidate.checkerDomain,
        checker_input: candidate.checkerInput as Record<string, unknown> | null,
        validation_report: validationReport as unknown as Record<string, unknown>,
      });
      if (bankInsertError) {
        throw new Error(`Failed to insert question_bank entry for run ${runRow.id}: ${bankInsertError.message}`);
      }
      return { status: "succeeded" as const, requestId: payload.requestId, attemptNumber };
    }
  }

  // Bound reached with no passing attempt -- request ends unfulfilled
  // (spec.md Edge Cases), never a silently-published best-of-a-bad-lot
  // candidate.
  return {
    status: "failed" as const,
    requestId: payload.requestId,
    reason: "MAX_GENERATION_ATTEMPTS reached with no passing attempt",
  };
}

export const generateAssessmentTask = task({
  id: "generate-assessment",
  // Up to MAX_GENERATION_ATTEMPTS attempts, each with several sequential
  // model calls across generation + six validation layers (research.md
  // "Trigger.dev, not a synchronous server action") -- generous headroom
  // over trigger.config.ts's tight 60s default for deterministic-only
  // tasks.
  maxDuration: 600,
  run: executeGeneration,
});
