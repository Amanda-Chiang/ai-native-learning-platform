"use server";

import { createClient } from "@/lib/supabase/server.ts";
import type { ExamConfigRow } from "@/lib/supabase/database.types.ts";
import { getConceptState, getEdgeState } from "@/features/learner-graph-evidence/actions.ts";
import { computeExamStages, currentStage, type ExamStageName } from "@/features/exam-planner/stage-boundaries.ts";
import {
  selectDiagnosticConcepts,
  selectFinalWeaknessConcepts,
  selectInterleavingEdges,
  selectTimedMixedConcepts,
  type ScopedConceptInput,
  type ScopedEdgeInput,
} from "@/features/exam-planner/scoped-selection.ts";
import { composeStagedPlan, type StagedExamPlan, type StageSelectionResult } from "@/features/exam-planner/plan-composition.ts";
import type { QuestionBankEntrySummary, SessionItem } from "@/features/review-scheduler/daily-session.ts";
import { computeReadinessSnapshot, type ReadinessSnapshot } from "@/features/exam-planner/readiness-snapshot.ts";

/**
 * Server action contracts: specs/010-exam-planner/contracts/exam-planner-actions.md
 */

/** Tunable, same convention as review-scheduler's session bounding. */
const CONCEPTS_PER_STAGE_LIMIT = 5;

function sourceAnchorConceptIds(sourceAnchors: unknown): string[] {
  if (!Array.isArray(sourceAnchors)) return [];
  return sourceAnchors
    .map((a) => (a as { conceptOrEdgeId?: unknown }).conceptOrEdgeId)
    .filter((id): id is string => typeof id === "string");
}

async function resolveScopedConceptIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  courseId: string,
  config: ExamConfigRow,
): Promise<string[]> {
  const conceptIds = new Set(config.scope_concept_ids);
  if (config.scope_unit_ids.length > 0) {
    const { data } = await supabase
      .from("course_concepts")
      .select("id")
      .eq("course_id", courseId)
      .eq("status", "confirmed")
      .in("unit_id", config.scope_unit_ids);
    for (const row of data ?? []) conceptIds.add(row.id);
  }
  return [...conceptIds];
}

export type ExamConfigView = {
  id: string;
  courseId: string;
  examDate: string;
  scopeConceptIds: string[];
  scopeUnitIds: string[];
};

function rowToView(row: ExamConfigRow): ExamConfigView {
  return {
    id: row.id,
    courseId: row.course_id,
    examDate: row.exam_date,
    scopeConceptIds: row.scope_concept_ids,
    scopeUnitIds: row.scope_unit_ids,
  };
}

async function resolveScopeExists(
  supabase: Awaited<ReturnType<typeof createClient>>,
  courseId: string,
  scopeConceptIds: string[],
  scopeUnitIds: string[],
): Promise<{ unresolved: string[] }> {
  const [conceptsRes, unitsRes] = await Promise.all([
    scopeConceptIds.length > 0
      ? supabase.from("course_concepts").select("id").eq("course_id", courseId).eq("status", "confirmed").in("id", scopeConceptIds)
      : Promise.resolve({ data: [] as { id: string }[] }),
    scopeUnitIds.length > 0
      ? supabase.from("course_units").select("id").eq("course_id", courseId).in("id", scopeUnitIds)
      : Promise.resolve({ data: [] as { id: string }[] }),
  ]);

  const confirmedConceptIds = new Set((conceptsRes.data ?? []).map((r) => r.id));
  const realUnitIds = new Set((unitsRes.data ?? []).map((r) => r.id));

  const unresolved = [
    ...scopeConceptIds.filter((id) => !confirmedConceptIds.has(id)),
    ...scopeUnitIds.filter((id) => !realUnitIds.has(id)),
  ];

  return { unresolved };
}

export async function configureExam(
  courseId: string,
  examDate: string,
  scopeConceptIds: string[],
  scopeUnitIds: string[],
): Promise<{ examConfigId: string | null; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { examConfigId: null, error: "You must be signed in to configure an exam." };
  }

  // Rejects before writing anything (FR-001) -- same "resolve to a
  // real row before writing anything" discipline
  // assessment-generation-pipeline's requestQuestionGeneration already
  // established.
  const { unresolved } = await resolveScopeExists(supabase, courseId, scopeConceptIds, scopeUnitIds);
  if (unresolved.length > 0) {
    return {
      examConfigId: null,
      error: `Exam scope references concepts/units that aren't real, confirmed rows in this course: ${unresolved.join(", ")}.`,
    };
  }

  // One exam config per student per course -- reconfiguring replaces
  // the prior config for that course rather than accumulating stale
  // duplicates; a different course's exam is a separate, independent
  // row.
  const { data: existing } = await supabase
    .from("exam_configs")
    .select("id")
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("exam_configs")
      .update({
        exam_date: examDate,
        scope_concept_ids: scopeConceptIds,
        scope_unit_ids: scopeUnitIds,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    return { examConfigId: existing.id, error: error?.message ?? null };
  }

  const { data: inserted, error } = await supabase
    .from("exam_configs")
    .insert({
      user_id: user.id,
      course_id: courseId,
      exam_date: examDate,
      scope_concept_ids: scopeConceptIds,
      scope_unit_ids: scopeUnitIds,
    })
    .select("id")
    .single();

  return { examConfigId: inserted?.id ?? null, error: error?.message ?? null };
}

export async function getExamConfig(courseId: string): Promise<{ config: ExamConfigView | null; error: string | null }> {
  const supabase = await createClient();

  // RLS-scoped, no userId parameter accepted, same convention as every
  // other server action in this codebase.
  const { data, error } = await supabase.from("exam_configs").select("*").eq("course_id", courseId).maybeSingle();

  return { config: data ? rowToView(data) : null, error: error?.message ?? null };
}

export type GetExamPlanResult = StagedExamPlan | { error: "no_exam_configured" | "exam_date_passed" };

/**
 * Always fresh (FR-009) -- reads exam_configs plus current
 * evidence/course/question_bank state on every call, never a cached or
 * stored plan.
 */
export async function getExamPlan(courseId: string): Promise<GetExamPlanResult> {
  const supabase = await createClient();
  const now = new Date();

  const { data: config } = await supabase.from("exam_configs").select("*").eq("course_id", courseId).maybeSingle();
  if (!config) {
    return { error: "no_exam_configured" };
  }

  const examDate = new Date(config.exam_date);
  if (examDate.getTime() <= now.getTime()) {
    return { error: "exam_date_passed" };
  }

  const stages = computeExamStages(examDate, now);
  const current = currentStage(stages, now);

  const scopedConceptIds = await resolveScopedConceptIds(supabase, courseId, config);

  const [conceptsRes, edgesRes, bankRes] = await Promise.all([
    scopedConceptIds.length > 0
      ? supabase.from("course_concepts").select("id, importance_score").eq("course_id", courseId).eq("status", "confirmed").in("id", scopedConceptIds)
      : Promise.resolve({ data: [] as { id: string; importance_score: number }[] }),
    supabase.from("concept_edges").select("id, source_concept_id, target_concept_id, relation_type").eq("course_id", courseId).eq("status", "confirmed"),
    supabase.from("question_bank").select("id, question_text, response_modality, rubric, source_anchors").eq("course_id", courseId),
  ]);

  const scopedConceptIdSet = new Set(scopedConceptIds);
  const concepts = conceptsRes.data ?? [];
  const scopedEdgeRows = (edgesRes.data ?? []).filter(
    (e) => scopedConceptIdSet.has(e.source_concept_id) && scopedConceptIdSet.has(e.target_concept_id),
  );
  const bankEntries = bankRes.data ?? [];

  const prerequisiteOutDegreeByConceptId = new Map<string, number>();
  for (const e of scopedEdgeRows) {
    if (e.relation_type !== "prerequisite_for") continue;
    prerequisiteOutDegreeByConceptId.set(e.source_concept_id, (prerequisiteOutDegreeByConceptId.get(e.source_concept_id) ?? 0) + 1);
  }

  const questionsByConcept = new Map<string, QuestionBankEntrySummary[]>();
  for (const entry of bankEntries) {
    for (const conceptId of sourceAnchorConceptIds(entry.source_anchors)) {
      if (!scopedConceptIdSet.has(conceptId)) continue;
      const list = questionsByConcept.get(conceptId) ?? [];
      list.push({ id: entry.id, conceptId, questionText: entry.question_text, responseModality: entry.response_modality, rubric: entry.rubric });
      questionsByConcept.set(conceptId, list);
    }
  }

  const scopedConceptInputs: ScopedConceptInput[] = await Promise.all(
    concepts.map(async (c) => ({
      conceptId: c.id,
      importanceScore: c.importance_score,
      prerequisiteOutDegree: prerequisiteOutDegreeByConceptId.get(c.id) ?? 0,
      learnerState: await getConceptState(courseId, c.id),
    })),
  );

  const scopedEdgeInputs: ScopedEdgeInput[] = await Promise.all(
    scopedEdgeRows.map(async (e) => ({
      edgeId: e.id,
      sourceConceptId: e.source_concept_id,
      targetConceptId: e.target_concept_id,
      learnerState: await getEdgeState(courseId, e.id),
    })),
  );

  function toSessionItems(priorities: { conceptId: string; reasons: string[] }[]): SessionItem[] {
    const items: SessionItem[] = [];
    for (const p of priorities) {
      const questions = questionsByConcept.get(p.conceptId);
      if (!questions || questions.length === 0) continue;
      const q = questions[0];
      items.push({ conceptId: p.conceptId, questionBankEntryId: q.id, questionText: q.questionText, responseModality: q.responseModality, rubric: q.rubric, reasons: p.reasons });
    }
    return items;
  }

  const anyQuestionAvailable = questionsByConcept.size > 0;

  const diagnosticItems = toSessionItems(selectDiagnosticConcepts(scopedConceptInputs, now, CONCEPTS_PER_STAGE_LIMIT));
  const interleavingItems = selectInterleavingEdges(scopedEdgeInputs);
  const timedMixedItems = toSessionItems(selectTimedMixedConcepts(scopedConceptInputs, now, CONCEPTS_PER_STAGE_LIMIT));
  const finalWeaknessItems = toSessionItems(selectFinalWeaknessConcepts(scopedConceptInputs, now, CONCEPTS_PER_STAGE_LIMIT));

  const perStageSelections: Record<ExamStageName, StageSelectionResult> = {
    diagnostic: { items: diagnosticItems, hasContent: anyQuestionAvailable },
    interleaving: { items: interleavingItems, hasContent: scopedEdgeRows.length > 0 },
    "timed-mixed": { items: timedMixedItems, hasContent: anyQuestionAvailable },
    "final-weakness": { items: finalWeaknessItems, hasContent: anyQuestionAvailable },
  };

  return composeStagedPlan(stages, current, perStageSelections);
}

export type GetExamReadinessResult = ReadinessSnapshot | { error: "no_exam_configured" };

/** Always fresh (FR-009), same as getExamPlan. */
export async function getExamReadiness(courseId: string): Promise<GetExamReadinessResult> {
  const supabase = await createClient();

  const { data: config } = await supabase.from("exam_configs").select("*").eq("course_id", courseId).maybeSingle();
  if (!config) {
    return { error: "no_exam_configured" };
  }

  const scopedConceptIds = await resolveScopedConceptIds(supabase, courseId, config);
  const scopedConcepts = await Promise.all(
    scopedConceptIds.map(async (conceptId) => ({ conceptId, learnerState: await getConceptState(courseId, conceptId) })),
  );

  return computeReadinessSnapshot(scopedConcepts);
}
