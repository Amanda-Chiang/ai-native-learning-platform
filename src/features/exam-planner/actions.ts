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

export type ScopeableConcept = { id: string; name: string };

/**
 * Concepts a student can pick for exam scope (T012's config form). Only
 * 'confirmed' rows -- configureExam's own resolveScopeExists already
 * rejects a non-confirmed id server-side (a proposed concept is still
 * review-gated, not yet trustworthy course content per this project's
 * "exposure/review status isn't ontology truth" boundary), so a picker
 * offering 'proposed' concepts would just be a UI that lets a student
 * pick options guaranteed to fail on submit.
 */
export async function listScopeableConcepts(courseId: string): Promise<ScopeableConcept[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("course_concepts")
    .select("id, canonical_name")
    .eq("course_id", courseId)
    .eq("status", "confirmed")
    .order("canonical_name");

  return (data ?? []).map((row) => ({ id: row.id, name: row.canonical_name }));
}

/**
 * Every exam configured for a course, oldest date first -- powers the
 * Exam Plan page's dropdown and Today's per-course aggregation. RLS-
 * scoped (exam_configs_select_own), same convention as every other
 * list action in this codebase.
 */
export async function listExamConfigs(courseId: string): Promise<ExamConfigView[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("exam_configs").select("*").eq("course_id", courseId).order("exam_date");
  return (data ?? []).map(rowToView);
}

export type ExamConfigsResult =
  | { ok: true; configs: ExamConfigView[] }
  | { ok: false; reason: string };

/**
 * `listExamConfigs`, but able to say that it failed.
 *
 * `listExamConfigs` swallows a query error into `[]` -- fine for its
 * existing callers, wrong for the Home dashboard's exam section: an
 * empty array there renders "No exams scheduled." to a student who has
 * a real exam in three days, exactly the silent-placeholder failure
 * mode `listCoursesResult` and `getDueQueueResult` were already split
 * out to fix. `listExamConfigs` itself is untouched.
 */
export async function listExamConfigsResult(courseId: string): Promise<ExamConfigsResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("exam_configs").select("*").eq("course_id", courseId).order("exam_date");

  if (error) {
    return { ok: false, reason: error.message };
  }
  if (!data) {
    return { ok: false, reason: "The exam config list came back empty with no error." };
  }

  return { ok: true, configs: data.map(rowToView) };
}

/**
 * Updates one specific exam by id -- unlike configureExam (always
 * inserts), this targets an already-existing row. Fetches the row's
 * own course_id first rather than trusting a separately-passed one
 * (there isn't one here at all -- the id is the only input, so the
 * scope-validity check below is always run against the row's real
 * course). RLS (exam_configs_update_own, user_id = auth.uid()) is the
 * authorization boundary, same as every other student-owned-row action
 * in this codebase.
 */
export async function updateExamConfig(
  examConfigId: string,
  examDate: string,
  scopeConceptIds: string[],
  scopeUnitIds: string[],
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("exam_configs")
    .select("course_id")
    .eq("id", examConfigId)
    .maybeSingle();
  if (fetchError || !existing) {
    return { error: `No exam found with id "${examConfigId}".` };
  }

  const { unresolved } = await resolveScopeExists(supabase, existing.course_id, scopeConceptIds, scopeUnitIds);
  if (unresolved.length > 0) {
    return {
      error: `Exam scope references concepts/units that aren't real, confirmed rows in this course: ${unresolved.join(", ")}.`,
    };
  }

  const { error } = await supabase
    .from("exam_configs")
    .update({
      exam_date: examDate,
      scope_concept_ids: scopeConceptIds,
      scope_unit_ids: scopeUnitIds,
      updated_at: new Date().toISOString(),
    })
    .eq("id", examConfigId);

  return { error: error?.message ?? null };
}

/**
 * Deletes one exam by id. Fetches first and reports an honest "not
 * found" rather than silently succeeding on a delete that matched zero
 * rows (a wrong or already-deleted id) -- same "confirm the row is
 * really there before acting" discipline confirmCandidate/
 * rejectCandidate use elsewhere in this codebase. RLS
 * (exam_configs_delete_own) still bounds this to the caller's own rows
 * regardless.
 */
export async function deleteExamConfig(examConfigId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("exam_configs")
    .select("id")
    .eq("id", examConfigId)
    .maybeSingle();
  if (fetchError || !existing) {
    return { error: `No exam found with id "${examConfigId}".` };
  }

  const { error } = await supabase.from("exam_configs").delete().eq("id", examConfigId);
  return { error: error?.message ?? null };
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

  // Always a new row -- a course can have any number of exams
  // (2026-09-26 design). Editing an already-configured exam goes
  // through updateExamConfig instead, which targets one specific row.
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

export type GetExamPlanResult = StagedExamPlan | { error: "no_exam_configured" | "exam_date_passed" };

/**
 * Always fresh (FR-009) -- reads exam_configs plus current
 * evidence/course/question_bank state on every call, never a cached or
 * stored plan.
 */
export async function getExamPlan(examConfigId: string): Promise<GetExamPlanResult> {
  const supabase = await createClient();
  const now = new Date();

  const { data: config } = await supabase.from("exam_configs").select("*").eq("id", examConfigId).maybeSingle();
  if (!config) {
    return { error: "no_exam_configured" };
  }
  const courseId = config.course_id;

  const examDate = new Date(config.exam_date);
  if (examDate.getTime() <= now.getTime()) {
    return { error: "exam_date_passed" };
  }

  const stages = computeExamStages(examDate, now);
  const current = currentStage(stages, now);

  const scopedConceptIds = await resolveScopedConceptIds(supabase, courseId, config);

  const [conceptsRes, edgesRes, bankRes] = await Promise.all([
    scopedConceptIds.length > 0
      ? supabase.from("course_concepts").select("id, canonical_name, importance_score").eq("course_id", courseId).eq("status", "confirmed").in("id", scopedConceptIds)
      : Promise.resolve({ data: [] as { id: string; canonical_name: string; importance_score: number }[] }),
    supabase.from("concept_edges").select("id, source_concept_id, target_concept_id, relation_type").eq("course_id", courseId).eq("status", "confirmed"),
    supabase.from("question_bank").select("id, question_text, response_modality, rubric, checker_domain, checker_input, source_anchors").eq("course_id", courseId),
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
      list.push({
        id: entry.id,
        conceptId,
        questionText: entry.question_text,
        responseModality: entry.response_modality,
        rubric: entry.rubric,
        checkerDomain: entry.checker_domain as QuestionBankEntrySummary["checkerDomain"],
        checkerInput: entry.checker_input as Record<string, unknown> | null,
      });
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

  // Same SessionItem display fields review-scheduler's daily session
  // carries (conceptName/masteryState) -- built from the concepts read
  // above plus the learnerState already fetched into
  // scopedConceptInputs, not a second query.
  const conceptMetaById = new Map(
    scopedConceptInputs.map((input) => {
      const concept = concepts.find((c) => c.id === input.conceptId);
      if (!concept) {
        throw new Error(`No concept row for scoped concept ${input.conceptId}`);
      }
      return [input.conceptId, { name: concept.canonical_name, masteryState: input.learnerState.masteryState }];
    }),
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
      const conceptMeta = conceptMetaById.get(p.conceptId);
      // Every selectable priority came from scopedConceptInputs, which
      // conceptMetaById is built from, so a miss is a wiring bug -- see
      // daily-session.ts's identical check.
      if (!conceptMeta) {
        throw new Error(`No concept metadata for scoped concept ${p.conceptId}`);
      }
      items.push({
        conceptId: p.conceptId,
        conceptName: conceptMeta.name,
        masteryState: conceptMeta.masteryState,
        questionBankEntryId: q.id,
        questionText: q.questionText,
        responseModality: q.responseModality,
        rubric: q.rubric,
        checkerDomain: q.checkerDomain,
        checkerInput: q.checkerInput,
        reasons: p.reasons,
      });
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
export async function getExamReadiness(examConfigId: string): Promise<GetExamReadinessResult> {
  const supabase = await createClient();

  const { data: config } = await supabase.from("exam_configs").select("*").eq("id", examConfigId).maybeSingle();
  if (!config) {
    return { error: "no_exam_configured" };
  }
  const courseId = config.course_id;

  const scopedConceptIds = await resolveScopedConceptIds(supabase, courseId, config);
  const scopedConcepts = await Promise.all(
    scopedConceptIds.map(async (conceptId) => ({ conceptId, learnerState: await getConceptState(courseId, conceptId) })),
  );

  return computeReadinessSnapshot(scopedConcepts);
}
