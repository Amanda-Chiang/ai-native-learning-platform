import { task } from "@trigger.dev/sdk";
import { createClient } from "@supabase/supabase-js";
import type OpenAI from "openai";
import type { Database } from "../src/lib/supabase/database.types.ts";
import { getOpenAiClient, isOpenAiConfigured } from "../src/lib/openai/client.ts";
import {
  MCQ_GENERATION_PROMPT,
  MCQ_GENERATION_RESPONSE_SCHEMA,
  parseMcqGenerationResult,
  type CandidateMcqQuestion,
} from "../src/features/lightweight-quiz/mcq-generation-schema.ts";
import { checkMcqAmbiguity } from "../src/features/lightweight-quiz/mcq-ambiguity-check.ts";
import { selectEligibleConceptIds, MAX_QUESTIONS_PER_RUN } from "../src/features/lightweight-quiz/concept-selection.ts";

/**
 * See docs/superpowers/specs/2026-09-12-lightweight-daily-quiz-design.md.
 *
 * Runs as a Supabase service-role client, same reasoning and same
 * confinement as trigger/generate-assessment.ts and
 * trigger/extract-course-graph.ts: acts on behalf of the system (not any
 * one student's session), and question_bank/extraction_runs have no
 * insert/update policy for authenticated users. The two real triggers
 * (course-graph-ingestion's confirmCandidate/rejectCandidate, and the
 * review-popup dismiss action) run as the authenticated user and only
 * ever call this file's exported function -- they never construct or
 * touch a service-role client themselves.
 */
function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const GENERATION_MODEL = process.env.OPENAI_GENERATION_MODEL ?? "gpt-4.1";

export type GenerateLightweightQuizPayload = {
  courseId: string;
  extractionRunId: string;
};

type EligibleConcept = {
  id: string;
  canonicalName: string;
  description: string;
  importanceScore: number;
  sourceAnchors: unknown;
};

async function fetchRunConcepts(
  supabase: ReturnType<typeof createAdminClient>,
  extractionRunId: string,
): Promise<EligibleConcept[]> {
  const { data } = await supabase
    .from("course_concepts")
    .select("id, canonical_name, description, importance_score, source_anchors")
    .eq("extraction_run_id", extractionRunId);
  return (data ?? []).map((row) => ({
    id: row.id,
    canonicalName: row.canonical_name,
    description: row.description,
    importanceScore: row.importance_score,
    sourceAnchors: row.source_anchors,
  }));
}

function buildGenerationPrompt(concept: EligibleConcept): string {
  return `${MCQ_GENERATION_PROMPT}

Concept: ${concept.canonicalName}
Description: ${concept.description}
Source material for this concept: ${JSON.stringify(concept.sourceAnchors)}`;
}

async function generateForConcept(openai: OpenAI, concept: EligibleConcept): Promise<CandidateMcqQuestion[]> {
  const response = await openai.responses.create({
    model: GENERATION_MODEL,
    input: [{ role: "user", content: buildGenerationPrompt(concept) }],
    text: {
      format: {
        type: "json_schema",
        name: MCQ_GENERATION_RESPONSE_SCHEMA.name,
        strict: MCQ_GENERATION_RESPONSE_SCHEMA.strict,
        schema: MCQ_GENERATION_RESPONSE_SCHEMA.schema,
      },
    },
  });
  return parseMcqGenerationResult(JSON.parse(response.output_text));
}

/**
 * Real work, callable directly (same "no live Trigger.dev project yet"
 * workaround this codebase already uses for
 * assessment-generation-pipeline's executeGeneration -- trigger.config.ts's
 * own documented placeholder-project caveat). Idempotent: claims
 * extraction_runs.quiz_generated_at with a single conditional UPDATE
 * before doing any work, so the two real trigger call sites (dismiss,
 * all-concepts-reviewed) can race safely -- whichever calls this first
 * wins the claim, the other's call becomes a no-op.
 */
export async function executeMcqGeneration(payload: GenerateLightweightQuizPayload) {
  const supabase = createAdminClient();

  const { data: claimed } = await supabase
    .from("extraction_runs")
    .update({ quiz_generated_at: new Date().toISOString() })
    .eq("id", payload.extractionRunId)
    .is("quiz_generated_at", null)
    .select("id")
    .maybeSingle();

  if (!claimed) {
    return { status: "already_generated" as const, extractionRunId: payload.extractionRunId };
  }

  if (!isOpenAiConfigured()) {
    return { status: "skipped" as const, reason: "OpenAI is not configured for this environment." };
  }
  const openai = getOpenAiClient();

  const { data: course } = await supabase.from("courses").select("owner_id").eq("id", payload.courseId).single();
  if (!course) {
    throw new Error(`Course ${payload.courseId} not found -- cannot record lightweight-quiz questions.`);
  }

  const concepts = await fetchRunConcepts(supabase, payload.extractionRunId);
  const eligibleIds = new Set(selectEligibleConceptIds(concepts));
  const eligibleConcepts = concepts.filter((c) => eligibleIds.has(c.id));

  let inserted = 0;
  for (const concept of eligibleConcepts) {
    if (inserted >= MAX_QUESTIONS_PER_RUN) break;

    let candidates: CandidateMcqQuestion[];
    try {
      candidates = await generateForConcept(openai, concept);
    } catch (err) {
      // One concept's generation call failing must not abort the whole
      // run (same "don't let one item's failure silently kill the whole
      // batch" hardening-pass class of bug documented throughout this
      // codebase's architecture-log.md) -- log and move to the next
      // concept; this run just ends up with fewer questions, not zero.
      console.error(
        `[lightweight-quiz] generation failed for concept ${concept.id} (run ${payload.extractionRunId}):`,
        err instanceof Error ? err.message : String(err),
      );
      continue;
    }

    for (const candidate of candidates) {
      if (inserted >= MAX_QUESTIONS_PER_RUN) break;

      let ambiguity: Awaited<ReturnType<typeof checkMcqAmbiguity>>;
      try {
        ambiguity = await checkMcqAmbiguity(openai, candidate);
      } catch (err) {
        console.error(
          `[lightweight-quiz] ambiguity check failed for a candidate from concept ${concept.id}:`,
          err instanceof Error ? err.message : String(err),
        );
        continue;
      }
      if (!ambiguity.passed) continue;

      const { error: insertError } = await supabase.from("question_bank").insert({
        course_id: payload.courseId,
        owner_id: course.owner_id,
        generation_run_id: null,
        question_text: candidate.questionText,
        rubric: { options: candidate.options, correctOptionIndex: candidate.correctOptionIndex },
        hints: [],
        common_mistakes: [],
        source_anchors: candidate.sourceAnchors,
        response_modality: "multiple_choice",
        checker_domain: null,
        checker_input: null,
        validation_report: { ambiguity },
        target_concept_ids: [concept.id],
      });
      if (insertError) {
        console.error(
          `[lightweight-quiz] failed to insert a question for concept ${concept.id}: ${insertError.message}`,
        );
        continue;
      }
      inserted += 1;
    }
  }

  return { status: "completed" as const, extractionRunId: payload.extractionRunId, questionsGenerated: inserted };
}

export const generateLightweightQuizTask = task({
  id: "generate-lightweight-quiz",
  run: executeMcqGeneration,
});
