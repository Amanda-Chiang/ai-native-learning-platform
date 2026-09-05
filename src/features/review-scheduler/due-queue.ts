"use server";

import { createClient } from "@/lib/supabase/server.ts";
import { getConceptState } from "@/features/learner-graph-evidence/actions.ts";
import { rankConceptsByPriority, DEFAULT_REVIEW_PRIORITY_WEIGHTS } from "@/features/review-scheduler/review-priority.ts";
import { computeNextReviewDate } from "@/features/review-scheduler/next-review-date.ts";
import { bucketFor, type UrgencyBucket } from "@/features/review-scheduler/due-queue-bucketing.ts";

export type { UrgencyBucket };

export type DueQueueItem = {
  conceptId: string;
  label: string;
  masteryValue: number;
  daysUntilDue: number;
  urgencyBucket: UrgencyBucket;
  dueLabel: string;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Ranked "what's due, and what's coming up" for a whole course --
 * unlike getDailyReviewSession (review-scheduler/actions.ts), this
 * isn't filtered to only-due-today or bounded to a time budget; it
 * ranks every confirmed concept so a student can see the full picture,
 * not just today's session. Reuses rankConceptsByPriority
 * (review-priority.ts) and computeNextReviewDate (next-review-date.ts)
 * unchanged -- no new ranking or scheduling logic.
 */
export async function getDueQueue(courseId: string): Promise<DueQueueItem[]> {
  const supabase = await createClient();
  const now = new Date();

  const [conceptsRes, edgesRes] = await Promise.all([
    supabase
      .from("course_concepts")
      .select("id, canonical_name, importance_score")
      .eq("course_id", courseId)
      .eq("status", "confirmed"),
    supabase
      .from("concept_edges")
      .select("source_concept_id, relation_type")
      .eq("course_id", courseId)
      .eq("status", "confirmed"),
  ]);

  const concepts = conceptsRes.data ?? [];
  const edges = edgesRes.data ?? [];

  const prerequisiteOutDegreeByConceptId = new Map<string, number>();
  for (const edge of edges) {
    if (edge.relation_type !== "prerequisite_for") continue;
    prerequisiteOutDegreeByConceptId.set(
      edge.source_concept_id,
      (prerequisiteOutDegreeByConceptId.get(edge.source_concept_id) ?? 0) + 1,
    );
  }

  const labelByConceptId = new Map(concepts.map((c) => [c.id, c.canonical_name]));

  const priorityInputs = await Promise.all(
    concepts.map(async (concept) => {
      const learnerState = await getConceptState(courseId, concept.id);
      return {
        conceptId: concept.id,
        importanceScore: concept.importance_score,
        prerequisiteOutDegree: prerequisiteOutDegreeByConceptId.get(concept.id) ?? 0,
        learnerState,
      };
    }),
  );

  const ranked = rankConceptsByPriority(priorityInputs, now, DEFAULT_REVIEW_PRIORITY_WEIGHTS);
  const learnerStateByConceptId = new Map(priorityInputs.map((i) => [i.conceptId, i.learnerState]));

  return ranked.map((priority) => {
    const learnerState = learnerStateByConceptId.get(priority.conceptId)!;
    const nextReviewDate = computeNextReviewDate(learnerState, now);
    const daysUntilDue = Math.ceil((nextReviewDate.getTime() - now.getTime()) / MS_PER_DAY);
    const { bucket, label } = bucketFor(daysUntilDue);

    return {
      conceptId: priority.conceptId,
      label: labelByConceptId.get(priority.conceptId) ?? priority.conceptId,
      masteryValue: learnerState.score,
      daysUntilDue,
      urgencyBucket: bucket,
      dueLabel: label,
    };
  });
}
