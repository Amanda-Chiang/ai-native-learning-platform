"use server";

import { createClient } from "@/lib/supabase/server.ts";
import { getConceptState, getEdgeState } from "@/features/learner-graph-evidence/actions.ts";
import { rankConceptsByPriority, DEFAULT_REVIEW_PRIORITY_WEIGHTS } from "@/features/review-scheduler/review-priority.ts";
import { isDue } from "@/features/review-scheduler/next-review-date.ts";
import { composeDailySession, type DailySessionResult, type QuestionBankEntrySummary } from "@/features/review-scheduler/daily-session.ts";
import { composeConnectSession, type ConnectSessionResult } from "@/features/review-scheduler/connect-session.ts";
import { gradeTextResponse, gradeStructuredResponse, type GradeStructuredResponseInput } from "@/features/deterministic-grading/actions.ts";
import type { GradingRubric } from "@/features/deterministic-grading/grading-evidence.ts";
import { extractProblemSetup } from "@/features/visual-assessment/problem-setup.ts";
import { mergeStructure } from "@/features/visual-assessment/merge-structure.ts";
import { commitEvidence } from "@/features/learner-graph-evidence/actions.ts";
import { gradeMultipleChoiceAnswer } from "@/features/lightweight-quiz/grade-mcq-answer.ts";

/**
 * Server action contracts: specs/009-review-scheduler/contracts/scheduler-actions.md
 */

/** Sensible default when the caller hasn't set one (spec.md Assumptions). */
const DEFAULT_TIME_BUDGET_MINUTES = 7;

export async function getDailyReviewSession(
  courseId: string,
  options?: { timeBudgetMinutes?: number; excludeConceptIds?: string[] },
): Promise<DailySessionResult> {
  const supabase = await createClient();
  const now = new Date();

  const [conceptsRes, edgesRes, bankRes] = await Promise.all([
    // 'proposed' included (not just 'confirmed'): a lightweight-quiz
    // question can tag a still-proposed concept (design doc "Concept
    // selection & question count" -- no review-status gate to be
    // quiz-eligible). rankConceptsByPriority/isDue are pure functions
    // over learner state/importance/prerequisite-out-degree; nothing in
    // them assumes 'confirmed'. A still-proposed concept's
    // prerequisite-out-degree simply defaults to 0 below (no confirmed
    // edges reference it yet) -- a benign, not-wrong default.
    supabase.from("course_concepts").select("id, importance_score").eq("course_id", courseId).in("status", ["confirmed", "proposed"]),
    supabase.from("concept_edges").select("source_concept_id, relation_type").eq("course_id", courseId).eq("status", "confirmed"),
    supabase.from("question_bank").select("id, question_text, response_modality, rubric, checker_domain, checker_input, target_concept_ids").eq("course_id", courseId),
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
    for (const conceptId of entry.target_concept_ids) {
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
      .select("id, source_concept_id, target_concept_id")
      .eq("course_id", courseId)
      .eq("status", "confirmed"),
  ]);

  const concepts = conceptsRes.data ?? [];
  const edges = edgesRes.data ?? [];

  const conceptInputs = concepts.map((c) => ({ conceptId: c.id, createdAt: c.created_at }));

  const edgeInputs = await Promise.all(
    edges.map(async (edge) => ({
      edgeId: edge.id,
      sourceConceptId: edge.source_concept_id,
      targetConceptId: edge.target_concept_id,
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

export type SubmitStructuredReviewAnswerInput = {
  courseId: string;
  conceptId: string;
  checkerDomain: GradeStructuredResponseInput["domain"];
  checkerInput: Record<string, unknown>;
  claimFields: Record<string, unknown>;
};

/**
 * The structured-modality counterpart to submitTextReviewAnswer,
 * closing the "not yet answerable here" gap review-scheduler's own
 * research.md originally deferred. Reuses
 * visual-assessment-graph-tree's existing claimed-field mechanism
 * (extractProblemSetup/mergeStructure) -- the same "strip the
 * candidate's own answer, let the student supply it, merge back before
 * grading" pattern, just filled in via a text form here instead of a
 * drawing -- then calls deterministic-grading's existing
 * gradeStructuredResponse unchanged (FR-004/FR-010 in that feature's
 * own terms): no new grading path, no new checker.
 */
export async function submitStructuredReviewAnswer(
  input: SubmitStructuredReviewAnswerInput,
): Promise<{ result: Awaited<ReturnType<typeof gradeStructuredResponse>>["result"]; error: string | null }> {
  const problemSetup = extractProblemSetup(input.checkerInput);
  const fullCheckerInput = mergeStructure(problemSetup, input.claimFields);

  return gradeStructuredResponse({
    courseId: input.courseId,
    conceptIds: [input.conceptId],
    edgeIds: [],
    domain: input.checkerDomain,
    checkerInput: fullCheckerInput as GradeStructuredResponseInput["checkerInput"],
    // Same reasoning as submitTextReviewAnswer's own evidenceType
    // choice: an independent, unassisted attempt at a previously-seen
    // concept.
    evidenceType: "retrieval",
    assistanceLevel: 0,
    difficulty: 0.5,
    transferDistance: 0,
  });
}

export type SubmitMultipleChoiceReviewAnswerInput = {
  courseId: string;
  // Singular, matching submitTextReviewAnswer/submitStructuredReviewAnswer's
  // existing convention exactly: evidence commits to whichever one
  // concept a session item was surfaced/ranked under, even when the
  // underlying question_bank row's target_concept_ids tags more than
  // one (that full list is what review-queue eligibility and the
  // reject-cascade use it for, not per-answer evidence attribution).
  conceptId: string;
  /** question_bank.rubric for a 'multiple_choice' row:
   * { options: string[], correctOptionIndex: number }. */
  rubric: Record<string, unknown>;
  selectedIndex: number;
};

export type SubmitMultipleChoiceReviewAnswerResult = {
  outcome: "correct" | "incorrect";
  selectedIndex: number;
  correctOptionIndex: number;
};

/**
 * The multiple_choice-modality counterpart to submitTextReviewAnswer/
 * submitStructuredReviewAnswer -- deliberately does NOT route through
 * deterministic-grading's gradeTextResponse/gradeStructuredResponse
 * (design doc "Grading"): there's no LLM call and no checker dispatch
 * for "which index did they pick," so this commits evidence directly.
 * No assessment_attempts row either -- that table exists for
 * deterministic-grading's own checker/rubric attempt snapshots
 * (response_modality in ('structured','code','text')), not applicable
 * here; evidence_events (via commitEvidence) is already the durable,
 * evidence-grade record Constitution Principle II requires.
 *
 * Real bug found live: evidence_events requires a real "origin"
 * (source_artifact_id, assessment_attempt_id, or conversation_turn_id
 * -- 0004_learner_evidence.sql's own check). With no assessment_attempts
 * row and no conversation turn, this concept's own real source_anchors
 * (the actual uploaded material it was extracted from) is the honest
 * origin -- looked up here rather than skipped, which would have kept
 * failing this constraint on every real answer.
 */
export async function submitMultipleChoiceReviewAnswer(
  input: SubmitMultipleChoiceReviewAnswerInput,
): Promise<{ result: SubmitMultipleChoiceReviewAnswerResult; error: string | null }> {
  const graded = gradeMultipleChoiceAnswer(input.rubric, input.selectedIndex);
  if ("error" in graded) {
    return { result: graded, error: graded.error };
  }

  const supabase = await createClient();
  const { data: concept } = await supabase
    .from("course_concepts")
    .select("source_anchors")
    .eq("id", input.conceptId)
    .single();
  const sourceArtifactId = Array.isArray(concept?.source_anchors)
    ? (concept.source_anchors[0] as { artifactId?: unknown } | undefined)?.artifactId
    : undefined;
  if (typeof sourceArtifactId !== "string") {
    return {
      result: graded,
      error: `Concept ${input.conceptId} has no real source artifact to attribute this evidence to.`,
    };
  }

  const { error } = await commitEvidence({
    courseId: input.courseId,
    conceptIds: [input.conceptId],
    edgeIds: [],
    // Same reasoning as submitTextReviewAnswer/submitStructuredReviewAnswer's
    // own evidenceType choice: an independent, unassisted attempt at a
    // previously-seen concept.
    evidenceType: "retrieval",
    correctness: graded.outcome === "correct",
    // Deterministic index-compare, not a model judgment call -- full
    // confidence, unlike gradeTextResponse's real-but-variable
    // grader_confidence.
    graderConfidence: 1,
    assistanceLevel: 0,
    difficulty: 0.5,
    transferDistance: 0,
    sourceArtifactId,
  });

  return { result: graded, error };
}
