"use server";

import { createClient } from "@/lib/supabase/server.ts";
import type { ConceptPathConcept, ConceptMasteryState } from "@/features/courses/concept-path.ts";

/**
 * Every concept in a course with the signed-in learner's mastery state.
 *
 * This exists because nothing else answers this question.
 * `getDailyReviewSession` selects only concepts that are *due*, ranked
 * and time-budgeted; `getDueQueue` likewise only returns ranked due
 * items. The Concepts screen shows the whole course, due or not.
 *
 * Statuses 'confirmed' and 'proposed' are both included, matching what
 * getDailyReviewSession already treats as quiz-eligible -- a concept
 * still awaiting review is real and belongs on this screen. 'archived'
 * is excluded.
 *
 * A concept with no learner_concept_state row has genuinely never been
 * touched, which is exactly what 'unverified' means in that column's
 * own CHECK constraint -- so this is a real state, not a stand-in for
 * missing data.
 */
export async function listCourseConceptsWithMastery(courseId: string): Promise<ConceptPathConcept[]> {
  const supabase = await createClient();

  const [conceptsRes, stateRes] = await Promise.all([
    supabase
      .from("course_concepts")
      .select("id, canonical_name, unit_id")
      .eq("course_id", courseId)
      .in("status", ["confirmed", "proposed"])
      .order("created_at", { ascending: true }),
    supabase.from("learner_concept_state").select("concept_id, mastery_state").eq("course_id", courseId),
  ]);

  // Distinguish: a query error (network, RLS, connection) throws visibly.
  // A missing learner_concept_state row is a real "unverified" state, not a placeholder.
  if (conceptsRes.error) {
    throw new Error(`Failed to fetch course concepts: ${conceptsRes.error.message}`);
  }
  if (stateRes.error) {
    throw new Error(`Failed to fetch learner concept state: ${stateRes.error.message}`);
  }

  const concepts = conceptsRes.data ?? [];
  const masteryByConceptId = new Map<string, ConceptMasteryState>(
    (stateRes.data ?? []).map((row) => [row.concept_id as string, row.mastery_state as ConceptMasteryState]),
  );

  return concepts.map((row) => ({
    id: row.id as string,
    name: row.canonical_name as string,
    unitId: (row.unit_id as string | null) ?? null,
    masteryState: masteryByConceptId.get(row.id as string) ?? "unverified",
  }));
}
