"use server";

import { createClient } from "@/lib/supabase/server.ts";
import type { ExamConfigRow } from "@/lib/supabase/database.types.ts";

/**
 * Server action contracts: specs/010-exam-planner/contracts/exam-planner-actions.md
 */

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
