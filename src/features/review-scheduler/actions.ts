"use server";

import { createClient } from "@/lib/supabase/server.ts";
import { getConceptState, getEdgeState } from "@/features/learner-graph-evidence/actions.ts";
import { rankConceptsByPriority, DEFAULT_REVIEW_PRIORITY_WEIGHTS } from "@/features/review-scheduler/review-priority.ts";
import { isDue } from "@/features/review-scheduler/next-review-date.ts";
import { composeDailySession, type DailySessionResult, type QuestionBankEntrySummary } from "@/features/review-scheduler/daily-session.ts";
import { composeConnectSession, type ConnectSessionResult } from "@/features/review-scheduler/connect-session.ts";

/**
 * Server action contracts: specs/009-review-scheduler/contracts/scheduler-actions.md
 */

/** Sensible default when the caller hasn't set one (spec.md Assumptions). */
const DEFAULT_TIME_BUDGET_MINUTES = 7;

function sourceAnchorConceptIds(sourceAnchors: unknown): string[] {
  if (!Array.isArray(sourceAnchors)) return [];
  return sourceAnchors
    .map((a) => (a as { conceptOrEdgeId?: unknown }).conceptOrEdgeId)
    .filter((id): id is string => typeof id === "string");
}

export async function getDailyReviewSession(
  courseId: string,
  options?: { timeBudgetMinutes?: number; excludeConceptIds?: string[] },
): Promise<DailySessionResult> {
  const supabase = await createClient();
  const now = new Date();

  const [conceptsRes, edgesRes, bankRes] = await Promise.all([
    supabase.from("course_concepts").select("id, importance_score").eq("course_id", courseId).eq("status", "confirmed"),
    supabase.from("concept_edges").select("source_concept_id, relation_type").eq("course_id", courseId).eq("status", "confirmed"),
    supabase.from("question_bank").select("id, question_text, response_modality, source_anchors").eq("course_id", courseId),
  ]);

  const concepts = conceptsRes.data ?? [];
  const edges = edgesRes.data ?? [];
  const bankEntries = bankRes.data ?? [];

  const prerequisiteOutDegreeByConceptId = new Map<string, number>();
  for (const edge of edges) {
    if (edge.relation_type !== "prerequisite_for") continue;
    prerequisiteOutDegreeByConceptId.set(
      edge.source_concept_id,
      (prerequisiteOutDegreeByConceptId.get(edge.source_concept_id) ?? 0) + 1,
    );
  }

  const questionsByConcept = new Map<string, QuestionBankEntrySummary[]>();
  for (const entry of bankEntries) {
    for (const conceptId of sourceAnchorConceptIds(entry.source_anchors)) {
      const list = questionsByConcept.get(conceptId) ?? [];
      list.push({
        id: entry.id,
        conceptId,
        questionText: entry.question_text,
        responseModality: entry.response_modality,
      });
      questionsByConcept.set(conceptId, list);
    }
  }

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

  const dueConceptInputs = priorityInputs.filter((input) => isDue(input.learnerState, now));
  const rankedDue = rankConceptsByPriority(dueConceptInputs, now, DEFAULT_REVIEW_PRIORITY_WEIGHTS);

  return composeDailySession(
    rankedDue,
    questionsByConcept,
    options?.timeBudgetMinutes ?? DEFAULT_TIME_BUDGET_MINUTES,
    options?.excludeConceptIds ?? [],
  );
}

export async function getConnectSession(courseId: string): Promise<ConnectSessionResult> {
  const supabase = await createClient();
  const now = new Date();

  const [conceptsRes, edgesRes] = await Promise.all([
    supabase.from("course_concepts").select("id, created_at").eq("course_id", courseId).eq("status", "confirmed"),
    supabase
      .from("concept_edges")
      .select("id, source_concept_id, target_concept_id, relation_type")
      .eq("course_id", courseId)
      .eq("status", "confirmed"),
  ]);

  const concepts = conceptsRes.data ?? [];
  const edges = edgesRes.data ?? [];

  const edgeCountByConceptId = new Map<string, number>();
  for (const edge of edges) {
    edgeCountByConceptId.set(edge.source_concept_id, (edgeCountByConceptId.get(edge.source_concept_id) ?? 0) + 1);
    edgeCountByConceptId.set(edge.target_concept_id, (edgeCountByConceptId.get(edge.target_concept_id) ?? 0) + 1);
  }

  const conceptInputs = concepts.map((c) => ({
    conceptId: c.id,
    createdAt: c.created_at,
    edgeCount: edgeCountByConceptId.get(c.id) ?? 0,
  }));

  const edgeInputs = await Promise.all(
    edges.map(async (edge) => ({
      edgeId: edge.id,
      sourceConceptId: edge.source_concept_id,
      targetConceptId: edge.target_concept_id,
      relationType: edge.relation_type,
      learnerState: await getEdgeState(courseId, edge.id),
    })),
  );

  return composeConnectSession(conceptInputs, edgeInputs, now);
}
