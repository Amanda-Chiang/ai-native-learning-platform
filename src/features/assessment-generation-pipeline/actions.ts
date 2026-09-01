"use server";

import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server.ts";
import type { Assessment } from "@/types/domain/assessment.ts";
import type {
  AssessmentGenerationRunRow,
  QuestionBankRow,
  GenerationRunOutcome,
} from "@/lib/supabase/database.types.ts";
import { MAX_GENERATION_ATTEMPTS } from "@/features/assessment-generation-pipeline/validation-pipeline.ts";

/**
 * Server action contracts: specs/008-assessment-generation-pipeline/contracts/generation-actions.md
 */

async function resolveConfirmedIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  courseId: string,
  conceptIds: string[],
  edgeIds: string[],
): Promise<{ unresolved: string[] }> {
  const [conceptsRes, edgesRes] = await Promise.all([
    conceptIds.length > 0
      ? supabase.from("course_concepts").select("id").eq("course_id", courseId).eq("status", "confirmed").in("id", conceptIds)
      : Promise.resolve({ data: [] as { id: string }[] }),
    edgeIds.length > 0
      ? supabase.from("concept_edges").select("id").eq("course_id", courseId).eq("status", "confirmed").in("id", edgeIds)
      : Promise.resolve({ data: [] as { id: string }[] }),
  ]);

  const confirmedConceptIds = new Set((conceptsRes.data ?? []).map((r) => r.id));
  const confirmedEdgeIds = new Set((edgesRes.data ?? []).map((r) => r.id));

  const unresolved = [
    ...conceptIds.filter((id) => !confirmedConceptIds.has(id)),
    ...edgeIds.filter((id) => !confirmedEdgeIds.has(id)),
  ];

  return { unresolved };
}

export async function requestQuestionGeneration(
  courseId: string,
  blueprint: Assessment,
): Promise<{ requestId: string | null; error: string | null }> {
  const supabase = await createClient();

  // Rejects before triggering anything (FR-012) -- same "resolve to a
  // real row before writing anything" discipline
  // learner-graph-evidence's commitEvidence already established.
  // requiredPrerequisites is checked alongside targetConceptIds since
  // both name concept ids the blueprint depends on existing as real,
  // confirmed rows in this course.
  const { unresolved } = await resolveConfirmedIds(
    supabase,
    courseId,
    [...blueprint.targetConceptIds, ...blueprint.requiredPrerequisites],
    blueprint.targetEdgeIds,
  );
  if (unresolved.length > 0) {
    return {
      requestId: null,
      error: `Blueprint references concepts/edges that aren't real, confirmed rows in this course: ${unresolved.join(", ")}.`,
    };
  }

  const requestId = randomUUID();

  // Dynamically imported so this module doesn't pull the Trigger.dev
  // SDK's Node-only runtime into any client bundle, same pattern
  // features/artifacts/actions.ts already established. Actual
  // triggering only works once a live Trigger.dev project exists
  // (trigger.config.ts's own documented placeholder-project caveat);
  // the task itself is written and ready.
  const { generateAssessmentTask } = await import("../../../trigger/generate-assessment.ts");
  await generateAssessmentTask.trigger({ requestId, blueprint, courseId });

  return { requestId, error: null };
}

export type GenerationRunView = {
  attemptNumber: number;
  outcome: GenerationRunOutcome;
  validationReport: Record<string, unknown>;
};

function runRowToView(row: AssessmentGenerationRunRow): GenerationRunView {
  return {
    attemptNumber: row.attempt_number,
    outcome: row.outcome,
    validationReport: row.validation_report,
  };
}

export async function getGenerationRun(
  requestId: string,
): Promise<{ attempts: GenerationRunView[]; status: "pending" | "succeeded" | "failed"; error: string | null }> {
  const supabase = await createClient();

  // RLS-scoped, no ownerId parameter accepted (contracts/generation-actions.md).
  const { data, error } = await supabase
    .from("assessment_generation_runs")
    .select("*")
    .eq("request_id", requestId)
    .order("attempt_number", { ascending: true });

  if (error) {
    return { attempts: [], status: "pending", error: error.message };
  }

  const attempts = (data ?? []).map(runRowToView);
  const status: "pending" | "succeeded" | "failed" = attempts.some((a) => a.outcome === "passed")
    ? "succeeded"
    : attempts.length >= MAX_GENERATION_ATTEMPTS
      ? "failed"
      : "pending";

  return { attempts, status, error: null };
}

export type QuestionBankEntry = {
  id: string;
  questionText: string;
  rubric: Record<string, unknown>;
  hints: string[];
  commonMistakes: string[];
  sourceAnchors: Record<string, unknown>[];
  responseModality: QuestionBankRow["response_modality"];
  checkerDomain: QuestionBankRow["checker_domain"];
  checkerInput: QuestionBankRow["checker_input"];
  validationReport: Record<string, unknown>;
};

function bankRowToEntry(row: QuestionBankRow): QuestionBankEntry {
  return {
    id: row.id,
    questionText: row.question_text,
    rubric: row.rubric,
    hints: row.hints,
    commonMistakes: row.common_mistakes,
    sourceAnchors: row.source_anchors,
    responseModality: row.response_modality,
    checkerDomain: row.checker_domain,
    checkerInput: row.checker_input,
    validationReport: row.validation_report,
  };
}

export async function getQuestionBank(courseId: string): Promise<{ entries: QuestionBankEntry[]; error: string | null }> {
  const supabase = await createClient();

  // RLS-scoped to the calling course owner's own entries -- no
  // additional ownerId filter needed or accepted.
  const { data, error } = await supabase.from("question_bank").select("*").eq("course_id", courseId);

  return { entries: (data ?? []).map(bankRowToEntry), error: error?.message ?? null };
}
