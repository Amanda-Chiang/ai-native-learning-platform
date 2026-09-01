"use server";

import { createClient } from "@/lib/supabase/server.ts";
import { getCourseGraph } from "@/features/course-graph-ingestion/actions.ts";
import { validateHasTarget } from "@/features/learner-graph-evidence/commit-evidence-validation.ts";
import { computeLearnerState, type ContributingFactor } from "@/features/learner-graph-evidence/compute-learner-state.ts";
import { applyLearnerState } from "@/features/learner-graph-evidence/apply-learner-state.ts";
import { DEFAULT_EVIDENCE_WEIGHTS } from "@/features/learner-graph-evidence/evidence-weights.ts";
import type { EvidenceEvent, EvidenceType } from "@/types/domain/evidence-event.ts";
import type { CourseGraph, MasteryState, LearnerRelationshipState } from "@/types/graph/course-graph.ts";
import type { EvidenceEventRow, EvidenceTypeDb } from "@/lib/supabase/database.types.ts";

/**
 * Server action contracts: specs/005-learner-graph-evidence/contracts/evidence-actions.md
 */

function eventRowToDomain(row: EvidenceEventRow): EvidenceEvent {
  return {
    id: row.id,
    userId: row.user_id,
    courseId: row.course_id,
    conceptIds: row.concept_ids,
    edgeIds: row.edge_ids,
    evidenceType: row.evidence_type,
    correctness: row.correctness,
    graderConfidence: row.grader_confidence,
    assistanceLevel: row.assistance_level,
    difficulty: row.difficulty,
    transferDistance: row.transfer_distance,
    studentConfidence: row.student_confidence ?? undefined,
    sourceArtifactId: row.source_artifact_id ?? undefined,
    assessmentAttemptId: row.assessment_attempt_id ?? undefined,
    conversationTurnId: row.conversation_turn_id ?? undefined,
    createdAt: row.created_at,
  };
}

export type CommitEvidenceInput = {
  courseId: string;
  conceptIds: string[];
  edgeIds: string[];
  evidenceType: EvidenceType;
  correctness: boolean | null;
  graderConfidence: number;
  assistanceLevel: number;
  difficulty: number;
  transferDistance: number;
  studentConfidence?: number;
  sourceArtifactId?: string;
  assessmentAttemptId?: string;
  conversationTurnId?: string;
};

export type LearnerConceptState = {
  masteryState: MasteryState;
  score: number;
  hasUnresolvedMisconception: boolean;
  contributingFactors: ContributingFactor[];
  lastEvidenceAt: string | null;
};

export type LearnerEdgeState = {
  learnerState: LearnerRelationshipState;
  score: number;
  hasUnresolvedMisconception: boolean;
  contributingFactors: ContributingFactor[];
  lastEvidenceAt: string | null;
};

export async function commitEvidence(input: CommitEvidenceInput): Promise<{ error: string | null }> {
  const validation = validateHasTarget(input.conceptIds, input.edgeIds);
  if (!validation.valid) {
    return { error: validation.error };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to commit evidence." };
  }

  // FR-007: every targeted id must resolve to a real row in this course
  // before anything is written.
  if (input.conceptIds.length > 0) {
    const { data: rows } = await supabase
      .from("course_concepts")
      .select("id")
      .eq("course_id", input.courseId)
      .in("id", input.conceptIds);
    const found = new Set((rows ?? []).map((r) => r.id));
    const missing = input.conceptIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      return { error: `No concept found in this course for id(s): ${missing.join(", ")}.` };
    }
  }
  if (input.edgeIds.length > 0) {
    const { data: rows } = await supabase
      .from("concept_edges")
      .select("id")
      .eq("course_id", input.courseId)
      .in("id", input.edgeIds);
    const found = new Set((rows ?? []).map((r) => r.id));
    const missing = input.edgeIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      return { error: `No edge found in this course for id(s): ${missing.join(", ")}.` };
    }
  }

  // Constitution Principle II: the evidence_events insert always
  // happens first, before any learner_concept_state/learner_edge_state
  // write -- and every state write below happens only because this
  // insert succeeded.
  const { error: insertError } = await supabase.from("evidence_events").insert({
    user_id: user.id,
    course_id: input.courseId,
    concept_ids: input.conceptIds,
    edge_ids: input.edgeIds,
    evidence_type: input.evidenceType as EvidenceTypeDb,
    correctness: input.correctness,
    grader_confidence: input.graderConfidence,
    assistance_level: input.assistanceLevel,
    difficulty: input.difficulty,
    transfer_distance: input.transferDistance,
    student_confidence: input.studentConfidence ?? null,
    source_artifact_id: input.sourceArtifactId ?? null,
    assessment_attempt_id: input.assessmentAttemptId ?? null,
    conversation_turn_id: input.conversationTurnId ?? null,
  });
  if (insertError) {
    return { error: insertError.message };
  }

  const now = new Date();

  for (const conceptId of input.conceptIds) {
    const { data: history } = await supabase
      .from("evidence_events")
      .select("*")
      .eq("user_id", user.id)
      .contains("concept_ids", [conceptId]);
    const events = (history ?? []).map(eventRowToDomain);
    const state = computeLearnerState(events, now, DEFAULT_EVIDENCE_WEIGHTS, "concept");

    const { error } = await supabase.from("learner_concept_state").upsert(
      {
        user_id: user.id,
        course_id: input.courseId,
        concept_id: conceptId,
        mastery_state: state.tier,
        score: state.score,
        has_unresolved_misconception: state.hasUnresolvedMisconception,
        contributing_factors: state.contributingFactors,
        last_evidence_at: state.lastEvidenceAt!,
        updated_at: now.toISOString(),
      },
      { onConflict: "user_id,course_id,concept_id" },
    );
    if (error) {
      return { error: error.message };
    }
  }

  for (const edgeId of input.edgeIds) {
    const { data: history } = await supabase
      .from("evidence_events")
      .select("*")
      .eq("user_id", user.id)
      .contains("edge_ids", [edgeId]);
    const events = (history ?? []).map(eventRowToDomain);
    const state = computeLearnerState(events, now, DEFAULT_EVIDENCE_WEIGHTS, "edge");

    const { error } = await supabase.from("learner_edge_state").upsert(
      {
        user_id: user.id,
        course_id: input.courseId,
        edge_id: edgeId,
        learner_state: state.tier,
        score: state.score,
        has_unresolved_misconception: state.hasUnresolvedMisconception,
        contributing_factors: state.contributingFactors,
        last_evidence_at: state.lastEvidenceAt!,
        updated_at: now.toISOString(),
      },
      { onConflict: "user_id,course_id,edge_id" },
    );
    if (error) {
      return { error: error.message };
    }
  }

  return { error: null };
}

export async function getConceptState(courseId: string, conceptId: string): Promise<LearnerConceptState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // RLS-scoped reads accept no userId parameter; a signed-out caller
    // has no student to compute state for -- the FR-010 baseline is the
    // honest answer, same codepath as "no evidence yet".
    const baseline = computeLearnerState([], new Date(), DEFAULT_EVIDENCE_WEIGHTS, "concept");
    return {
      masteryState: baseline.tier,
      score: baseline.score,
      hasUnresolvedMisconception: baseline.hasUnresolvedMisconception,
      contributingFactors: baseline.contributingFactors,
      lastEvidenceAt: baseline.lastEvidenceAt,
    };
  }

  const { data: history } = await supabase
    .from("evidence_events")
    .select("*")
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .contains("concept_ids", [conceptId]);
  const events = (history ?? []).map(eventRowToDomain);
  const state = computeLearnerState(events, new Date(), DEFAULT_EVIDENCE_WEIGHTS, "concept");

  return {
    masteryState: state.tier,
    score: state.score,
    hasUnresolvedMisconception: state.hasUnresolvedMisconception,
    contributingFactors: state.contributingFactors,
    lastEvidenceAt: state.lastEvidenceAt,
  };
}

export async function getEdgeState(courseId: string, edgeId: string): Promise<LearnerEdgeState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const baseline = computeLearnerState([], new Date(), DEFAULT_EVIDENCE_WEIGHTS, "edge");
    return {
      learnerState: baseline.tier,
      score: baseline.score,
      hasUnresolvedMisconception: baseline.hasUnresolvedMisconception,
      contributingFactors: baseline.contributingFactors,
      lastEvidenceAt: baseline.lastEvidenceAt,
    };
  }

  const { data: history } = await supabase
    .from("evidence_events")
    .select("*")
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .contains("edge_ids", [edgeId]);
  const events = (history ?? []).map(eventRowToDomain);
  const state = computeLearnerState(events, new Date(), DEFAULT_EVIDENCE_WEIGHTS, "edge");

  return {
    learnerState: state.tier,
    score: state.score,
    hasUnresolvedMisconception: state.hasUnresolvedMisconception,
    contributingFactors: state.contributingFactors,
    lastEvidenceAt: state.lastEvidenceAt,
  };
}

/**
 * Backs ConceptAtlas's optional getEvidenceProvenance prop (T019) --
 * derived from getConceptState/getEdgeState's own contributingFactors,
 * not a separate query path. null explicitly means "no evidence
 * recorded yet" (FR-014), matching ConceptDetailPanel's EvidenceProvenance
 * type.
 */
export async function getEvidenceProvenance(
  kind: "concept" | "relationship",
  courseId: string,
  id: string,
): Promise<{ lastEvidenceType: EvidenceType; lastEvidenceAt: string } | null> {
  const state = kind === "concept" ? await getConceptState(courseId, id) : await getEdgeState(courseId, id);
  if (state.contributingFactors.length === 0 || state.lastEvidenceAt === null) {
    return null;
  }
  const lastFactor = state.contributingFactors[state.contributingFactors.length - 1];
  return { lastEvidenceType: lastFactor.evidenceType, lastEvidenceAt: state.lastEvidenceAt };
}

export async function getCourseGraphForLearner(courseId: string): Promise<CourseGraph> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const baseline = await getCourseGraph(courseId);
  if (!user) {
    return baseline;
  }

  const [conceptStatesRes, edgeStatesRes] = await Promise.all([
    supabase.from("learner_concept_state").select("*").eq("user_id", user.id).eq("course_id", courseId),
    supabase.from("learner_edge_state").select("*").eq("user_id", user.id).eq("course_id", courseId),
  ]);

  const conceptStates = new Map(
    (conceptStatesRes.data ?? []).map((row) => [
      row.concept_id,
      { masteryState: row.mastery_state, hasUnresolvedMisconception: row.has_unresolved_misconception },
    ]),
  );
  const edgeStates = new Map(
    (edgeStatesRes.data ?? []).map((row) => [row.edge_id, { learnerState: row.learner_state }]),
  );

  return applyLearnerState(baseline, conceptStates, edgeStates);
}
