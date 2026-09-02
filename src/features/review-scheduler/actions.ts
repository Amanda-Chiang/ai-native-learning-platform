"use server";

import { createClient } from "@/lib/supabase/server.ts";
import { getConceptState, getEdgeState } from "@/features/learner-graph-evidence/actions.ts";
import { rankConceptsByPriority, DEFAULT_REVIEW_PRIORITY_WEIGHTS } from "@/features/review-scheduler/review-priority.ts";
import { isDue } from "@/features/review-scheduler/next-review-date.ts";
import { composeDailySession, type DailySessionResult, type QuestionBankEntrySummary } from "@/features/review-scheduler/daily-session.ts";
import { composeConnectSession, type ConnectSessionResult } from "@/features/review-scheduler/connect-session.ts";
import { gradeTextResponse } from "@/features/deterministic-grading/actions.ts";
import type { GradingRubric } from "@/features/deterministic-grading/grading-evidence.ts";

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
    supabase.from("question_bank").select("id, question_text, response_modality, rubric, source_anchors").eq("course_id", courseId),
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
        rubric: entry.rubric,
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

/**
 * Coarse, honest rubric adapter (not a fabricated compatibility layer):
 * question_bank's rubric is free-form JSON the generation model wrote
 * (assessment-generation-pipeline), not deterministic-grading's
 * structured GradingRubric shape. Rather than guessing at specific
 * keys that may or may not be present, the whole rubric is carried
 * through verbatim as the one required idea -- the rubric grader is
 * itself an LLM reading GradingRubric's fields as prompt text, so a
 * faithful JSON rendering of "what this rubric actually says" is
 * real content, not a placeholder. A structured, field-aware adapter
 * is real follow-up work, not invented here.
 */
function bankRubricToGradingRubric(rubric: Record<string, unknown>): GradingRubric {
  return {
    requiredIdeas: [JSON.stringify(rubric)],
    acceptableAlternatives: [],
    knownMisconceptions: [],
    partialCreditCriteria: [],
  };
}

export type SubmitTextReviewAnswerInput = {
  courseId: string;
  conceptId: string;
  rubric: Record<string, unknown>;
  response: string;
};

/**
 * Text-modality-only for now (companion decision to T009's scope):
 * routes through deterministic-grading's existing gradeTextResponse
 * unchanged (FR-010) -- this feature introduces no second grading
 * path. Structured (graph/tree) modalities aren't answerable from this
 * action yet; the generic claimed-field form that will make them
 * answerable is real, separate follow-up work, not silently faked
 * here.
 */
export async function submitTextReviewAnswer(
  input: SubmitTextReviewAnswerInput,
): Promise<{ result: Awaited<ReturnType<typeof gradeTextResponse>>["result"]; error: string | null }> {
  return gradeTextResponse({
    courseId: input.courseId,
    conceptIds: [input.conceptId],
    edgeIds: [],
    response: input.response,
    rubric: bankRubricToGradingRubric(input.rubric),
    // "retrieval": an independent, unassisted attempt at a previously-
    // seen concept -- exactly what a spaced-review session item is
    // (Constitution Principle III: this is real independent retrieval,
    // not exposure).
    evidenceType: "retrieval",
    assistanceLevel: 0,
    // question_bank doesn't record a per-question difficulty
    // (assessment-generation-pipeline's data-model.md), so a fixed,
    // documented default is used until a real signal exists -- same
    // "tunable, not calibrated" convention as this feature's other
    // constants.
    difficulty: 0.5,
    transferDistance: 0,
  });
}
