"use server";

import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server.ts";
import { runTutorTurn, type PriorTurn } from "@/features/tutor-agent/run-tutor-turn.ts";
import { commitEvidence } from "@/features/learner-graph-evidence/actions.ts";
import { createTestDoubleOpenAIClient } from "@/features/tutor-agent/test-double-openai-client.ts";
import { detectsDirectAnswerRequest } from "@/features/tutor-agent/assistance-ladder.ts";
import type { TutorToolName } from "@/lib/supabase/database.types.ts";

/**
 * Gated explicitly by an env var only the Playwright E2E suite sets
 * (plan.md's Testing section) -- never on by accident in a real
 * conversation, and never silently indistinguishable from a real model
 * response (research.md's "no streaming" decision doesn't touch this;
 * this is purely a test seam).
 */
function createOpenAIClient(): OpenAI {
  if (process.env.TUTOR_AGENT_USE_TEST_DOUBLE === "true") {
    return createTestDoubleOpenAIClient();
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

/**
 * Server action contracts: specs/006-tutor-agent/contracts/tutor-actions.md
 */

const SYSTEM_INSTRUCTIONS = `You are a tutor for one student in one course. You may ONLY discuss this course's material.

Grounding rules (non-negotiable):
- Every substantive claim you make about course content MUST come from a search_course_materials call you made in this conversation -- never state a fact about the course from your own general knowledge.
- If search_course_materials returns nothing relevant, say plainly that the course material doesn't cover it. Do not invent a plausible-sounding answer.
- If the student's question is unrelated to this course entirely, say so and redirect them toward the course's actual scope. Do not answer it as if it were course content.

Pacing (PRD S14.3's assistance ladder): a message starting with "[Pacing note, not from the student: ...]" tells you exactly how much help to give for this response -- follow it precisely, giving the minimum useful intervention it specifies rather than jumping ahead.

Calibration: before explaining or discussing a concept, call get_concept_state for it (and get_concept_neighbors if the question touches a relationship) so you know what the student has actually demonstrated. A concept with no recorded evidence is genuinely "unverified" -- never assume it's better understood than that. A concept already at "solid" doesn't need re-teaching from scratch -- acknowledge the existing understanding instead.

Recording evidence (your only way to affect the student's recorded state -- you can never change it directly): call record_exposure when the student independently retrieves or applies something correctly (evidenceType matching what actually happened, correctness:true), when they give an incorrect independent attempt (correctness:false), or when something was only passively mentioned/exposed, never independently demonstrated (evidenceType:"exposure"). Call record_misconception_candidate specifically when you recognize a named, recurring wrong-belief pattern -- not for a single incorrect answer, which record_exposure already covers.`;

export type TutorTurnView = {
  role: "tutor";
  content: string;
  ladderStep: number | null;
  toolCalls: { toolName: string; summary: string }[];
};

export type ConversationTurnView = TutorTurnView | { role: "student"; content: string };

function summarizeToolCall(toolName: string): string {
  return `called ${toolName}`;
}

export async function startConversation(courseId: string): Promise<{ conversationId: string | null; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { conversationId: null, error: "You must be signed in to start a conversation with the tutor." };
  }

  const { data, error } = await supabase
    .from("tutor_conversations")
    .insert({ user_id: user.id, course_id: courseId })
    .select()
    .single();

  if (error || !data) {
    return { conversationId: null, error: error?.message ?? "Could not start a conversation." };
  }

  return { conversationId: data.id, error: null };
}

export async function sendTutorMessage(
  conversationId: string,
  message: string,
): Promise<{ turn: TutorTurnView | null; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { turn: null, error: "You must be signed in to message the tutor." };
  }

  const { data: conversation, error: conversationError } = await supabase
    .from("tutor_conversations")
    .select("*")
    .eq("id", conversationId)
    .eq("user_id", user.id)
    .single();
  if (conversationError || !conversation) {
    return { turn: null, error: `No conversation found with id "${conversationId}" for this student.` };
  }

  // Fetched BEFORE this message's own turns are inserted -- this is
  // exactly the prior-attempt history the ladder (US2) computes from.
  // Student turns only ever get their concept_ids/ladder-relevant fields
  // written once, at insert time below (data-model.md's append-only
  // design) -- concept_ids can only be known once run-tutor-turn.ts's
  // loop resolves them via search_course_materials, so the student turn
  // for THIS message is inserted after the loop runs, not before.
  const { data: priorTurnRows } = await supabase
    .from("tutor_conversation_turns")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("role", "student")
    .order("created_at", { ascending: true });

  const priorTurns: PriorTurn[] = (priorTurnRows ?? []).map((row) => ({
    conceptIds: row.concept_ids,
    correct: row.correct,
    requestedDirectAnswer: row.requested_direct_answer,
  }));

  const requestedDirectAnswer = detectsDirectAnswerRequest(message);

  const [conceptsRes, edgesRes] = await Promise.all([
    supabase.from("course_concepts").select("*").eq("course_id", conversation.course_id).eq("status", "confirmed"),
    supabase.from("concept_edges").select("*").eq("course_id", conversation.course_id).eq("status", "confirmed"),
  ]);

  const openai = createOpenAIClient();

  // A real model-call failure here must resolve as this action's own
  // { turn: null, error } shape, never an unhandled rejection -- found
  // during a hardening-pass audit: TutorChat.tsx's onSubmit has no
  // try/catch of its own around sendTutorMessage, so a thrown error
  // here would leave the client's "pending" state stuck forever with
  // no message shown, the same class of gap already found and fixed in
  // deterministic-grading's rubric grader and
  // assessment-generation-pipeline's per-attempt loop.
  let result: Awaited<ReturnType<typeof runTutorTurn>>;
  try {
    result = await runTutorTurn({
      openai,
      courseId: conversation.course_id,
      studentMessage: message,
      systemInstructions: SYSTEM_INSTRUCTIONS,
      courseMaterials: {
        concepts: conceptsRes.data ?? [],
        edges: edgesRes.data ?? [],
      },
      priorTurns,
      requestedDirectAnswer,
    });
  } catch (err) {
    return { turn: null, error: `The tutor couldn't respond: ${err instanceof Error ? err.message : String(err)}` };
  }

  const { data: studentTurn, error: studentTurnError } = await supabase
    .from("tutor_conversation_turns")
    .insert({
      conversation_id: conversationId,
      user_id: user.id,
      role: "student",
      content: message,
      concept_ids: result.conceptIds,
      requested_direct_answer: requestedDirectAnswer,
    })
    .select()
    .single();
  if (studentTurnError || !studentTurn) {
    return { turn: null, error: studentTurnError?.message ?? "Could not record the student's message." };
  }

  // Committed only now that the student turn's real id exists to
  // reference as conversationTurnId -- through learner-graph-evidence's
  // existing, validated commitEvidence, never a direct write to
  // learner_concept_state/learner_edge_state (Constitution Principle II,
  // FR-012).
  for (const staged of result.pendingEvidenceCommits) {
    const { error } = await commitEvidence({
      ...staged,
      courseId: conversation.course_id,
      conversationTurnId: studentTurn.id,
    });
    if (error) {
      return { turn: null, error };
    }
  }

  const { data: tutorTurn, error: tutorTurnError } = await supabase
    .from("tutor_conversation_turns")
    .insert({
      conversation_id: conversationId,
      user_id: user.id,
      role: "tutor",
      content: result.content,
      concept_ids: result.conceptIds,
      ladder_step_used: result.ladderStepUsed,
    })
    .select()
    .single();
  if (tutorTurnError || !tutorTurn) {
    return { turn: null, error: tutorTurnError?.message ?? "Could not record the tutor's reply." };
  }

  // Attributed to the tutor turn during which the calls happened
  // (data-model.md), inserted only after that turn exists to reference.
  for (const call of result.toolCalls) {
    const { error } = await supabase.from("tutor_tool_calls").insert({
      turn_id: tutorTurn.id,
      user_id: user.id,
      tool_name: call.toolName as TutorToolName,
      arguments: call.arguments,
      result: call.result as Record<string, unknown>,
    });
    if (error) {
      return { turn: null, error: error.message };
    }
  }

  await supabase
    .from("tutor_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  return {
    turn: {
      role: "tutor",
      content: tutorTurn.content,
      ladderStep: tutorTurn.ladder_step_used,
      toolCalls: result.toolCalls.map((c) => ({ toolName: c.toolName, summary: summarizeToolCall(c.toolName) })),
    },
    error: null,
  };
}

export async function getConversation(
  conversationId: string,
): Promise<{ turns: ConversationTurnView[]; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { turns: [], error: "You must be signed in to read this conversation." };
  }

  const { data, error } = await supabase
    .from("tutor_conversation_turns")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    return { turns: [], error: error.message };
  }

  const turns: ConversationTurnView[] = (data ?? []).map((row) =>
    row.role === "student"
      ? { role: "student", content: row.content }
      : {
          role: "tutor",
          content: row.content,
          ladderStep: row.ladder_step_used,
          toolCalls: [],
        },
  );

  return { turns, error: null };
}
