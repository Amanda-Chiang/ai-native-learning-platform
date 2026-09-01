import type OpenAI from "openai";
import {
  SEARCH_COURSE_MATERIALS_TOOL,
  GET_CONCEPT_STATE_TOOL,
  GET_CONCEPT_NEIGHBORS_TOOL,
  RECORD_EXPOSURE_TOOL,
  RECORD_MISCONCEPTION_CANDIDATE_TOOL,
} from "./tutor-tools-schema.ts";
import {
  validateSearchCourseMaterialsArgs,
  validateGetConceptStateArgs,
  validateGetConceptNeighborsArgs,
  validateRecordExposureArgs,
  validateRecordMisconceptionCandidateArgs,
} from "./tool-call-validation.ts";
import { searchCourseMaterials, getConceptNeighbors } from "./search-course-materials.ts";
import { computeLadderStep, DEFAULT_LADDER_WEIGHTS, type LadderAttempt } from "./assistance-ladder.ts";
import { getConceptState, type CommitEvidenceInput } from "@/features/learner-graph-evidence/actions.ts";
import type { EvidenceType } from "@/types/domain/evidence-event.ts";
import type { CourseConceptRow, ConceptEdgeRow } from "@/lib/supabase/database.types.ts";

/**
 * The model<->tool round-trip loop (research.md "Tool-call loop bound",
 * "Why not the separate @openai/agents package"). Built directly on the
 * `openai` client's Responses API, the same client
 * course-graph-ingestion already uses -- no new package.
 *
 * This file grows across user stories: US1 wires only
 * search_course_materials; US3 adds get_concept_state/
 * get_concept_neighbors; US4 adds the two evidence-recording tools. Each
 * addition only ever extends `executeTool` and the `tools` array passed
 * in by the caller -- the loop mechanics themselves don't change.
 */

// A tool-calling loop with no bound is a real reliability/cost risk; an
// explicit low cap keeps latency bounded and turns "the model kept
// requesting tools instead of answering" into a visible, honest failure
// mode rather than an infinite loop (research.md).
const MAX_TOOL_ROUNDS = 6;

export const TOOL_ROUND_LIMIT_MESSAGE =
  "I'm not able to finish that right now -- could you try asking in a narrower way?";

const TUTOR_MODEL = process.env.OPENAI_TUTOR_MODEL ?? "gpt-4.1";

// PRD S14.3's seven-step assistance ladder.
const LADDER_STEP_DESCRIPTIONS = [
  "Ask the student to retrieve or predict the answer themselves -- do not explain anything yet.",
  "Ask a diagnostic question narrowing in on the specific gap.",
  "Give a conceptual cue, not the mechanism itself.",
  "Point to the relevant course source or visual.",
  "Explain the missing mechanism.",
  "Give a partial worked example.",
  "Give the complete answer.",
];

export type ToolCallRecord = {
  toolName: string;
  arguments: Record<string, unknown>;
  result: unknown;
};

export type CourseMaterialsContext = {
  concepts: CourseConceptRow[];
  edges: ConceptEdgeRow[];
};

/** This conversation's own turn history, for deriving priorAttempts (data-model.md). */
export type PriorTurn = {
  conceptIds: string[];
  correct: boolean | null;
  requestedDirectAnswer: boolean;
};

export type RunTutorTurnInput = {
  openai: OpenAI;
  courseId: string;
  studentMessage: string;
  systemInstructions: string;
  courseMaterials: CourseMaterialsContext;
  /** This conversation's prior turns (US2's ladder pacing). */
  priorTurns: PriorTurn[];
  /** Whether THIS message explicitly asked to skip the ladder (FR-006). */
  requestedDirectAnswer: boolean;
};

/**
 * courseId is filled in by the caller (actions.ts); conversationTurnId
 * can't be -- the student turn it must reference doesn't exist in the
 * database until after this loop returns (T016's same insert-after-
 * resolving-concept-ids ordering). Staged here, actually committed by
 * actions.ts once that turn's real id exists.
 */
export type StagedEvidenceCommit = Omit<CommitEvidenceInput, "courseId" | "conversationTurnId">;

export type RunTutorTurnResult = {
  content: string;
  toolCalls: ToolCallRecord[];
  /** null when this turn never resolved to a specific concept (e.g. off-topic/not-covered). */
  ladderStepUsed: number | null;
  conceptIds: string[];
  pendingEvidenceCommits: StagedEvidenceCommit[];
};

async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: RunTutorTurnInput,
  pendingEvidenceCommits: StagedEvidenceCommit[],
): Promise<unknown> {
  switch (toolName) {
    case "search_course_materials": {
      const validation = validateSearchCourseMaterialsArgs(args);
      if (!validation.valid) {
        return { error: validation.error };
      }
      return searchCourseMaterials(
        ctx.courseMaterials.concepts,
        ctx.courseMaterials.edges,
        ctx.courseId,
        args.query as string,
        args.conceptIds ? { conceptIds: args.conceptIds as string[] } : undefined,
      );
    }
    case "get_concept_state": {
      const validation = validateGetConceptStateArgs(args);
      if (!validation.valid) {
        return { error: validation.error };
      }
      // Never a separately-coded default for "no evidence yet" -- the
      // exact same codepath learner-graph-evidence's own contract uses.
      const conceptIds = args.conceptIds as string[];
      const states = await Promise.all(
        conceptIds.map(async (conceptId) => ({
          conceptId,
          ...(await getConceptState(ctx.courseId, conceptId)),
        })),
      );
      return { states };
    }
    case "get_concept_neighbors": {
      const validation = validateGetConceptNeighborsArgs(args);
      if (!validation.valid) {
        return { error: validation.error };
      }
      const conceptId = args.conceptId as string;
      const neighbors = getConceptNeighbors(ctx.courseMaterials.edges, ctx.courseId, conceptId);
      const neighborsWithState = await Promise.all(
        neighbors.map(async (n) => ({
          ...n,
          state: await getConceptState(ctx.courseId, n.neighborConceptId),
        })),
      );
      return { neighbors: neighborsWithState };
    }
    case "record_exposure": {
      const validation = validateRecordExposureArgs(args);
      if (!validation.valid) {
        return { error: validation.error };
      }
      // Staged, not committed here (Constitution Principle II requires
      // the evidence_events insert precede the state upsert -- but it
      // also requires a real conversationTurnId, which doesn't exist
      // until actions.ts inserts the student turn after this loop
      // returns). This is still the ONLY path that can affect learner
      // state -- no code in this feature writes learner_concept_state/
      // learner_edge_state directly.
      pendingEvidenceCommits.push({
        conceptIds: (args.conceptIds as string[]) ?? [],
        edgeIds: (args.edgeIds as string[]) ?? [],
        evidenceType: args.evidenceType as EvidenceType,
        correctness: (args.correctness as boolean | null) ?? null,
        graderConfidence: args.graderConfidence as number,
        assistanceLevel: args.assistanceLevel as number,
        difficulty: args.difficulty as number,
        transferDistance: args.transferDistance as number,
        studentConfidence: args.studentConfidence as number | undefined,
      });
      return { status: "recorded" };
    }
    case "record_misconception_candidate": {
      const validation = validateRecordMisconceptionCandidateArgs(args);
      if (!validation.valid) {
        return { error: validation.error };
      }
      // Always incorrect, independent evidence of type "misconception"
      // -- distinct from an ordinary incorrect retrieval attempt, which
      // record_exposure already covers (contracts/tutor-actions.md).
      pendingEvidenceCommits.push({
        conceptIds: args.conceptIds as string[],
        edgeIds: [],
        evidenceType: "misconception",
        correctness: false,
        graderConfidence: args.graderConfidence as number,
        assistanceLevel: args.assistanceLevel as number,
        difficulty: args.difficulty as number,
        transferDistance: args.transferDistance as number,
        studentConfidence: args.studentConfidence as number | undefined,
      });
      return { status: "recorded" };
    }
    default:
      // Reaching this means the model called a tool this turn's `tools`
      // array didn't actually offer it -- a real, surfaceable error, not
      // a silently-ignored no-op.
      return { error: `Unknown or not-yet-available tool: "${toolName}".` };
  }
}

export async function runTutorTurn(ctx: RunTutorTurnInput): Promise<RunTutorTurnResult> {
  const toolCalls: ToolCallRecord[] = [];
  const pendingEvidenceCommits: StagedEvidenceCommit[] = [];
  const tools = [
    SEARCH_COURSE_MATERIALS_TOOL,
    GET_CONCEPT_STATE_TOOL,
    GET_CONCEPT_NEIGHBORS_TOOL,
    RECORD_EXPOSURE_TOOL,
    RECORD_MISCONCEPTION_CANDIDATE_TOOL,
  ];

  let previousResponseId: string | undefined;
  let input: OpenAI.Responses.ResponseInput = [{ role: "user", content: ctx.studentMessage }];
  let ladderStepUsed: number | null = null;
  let conceptIds: string[] = [];
  // Once computed, this note must accompany every subsequent round, not
  // just the round it was computed in -- a real model call chains state
  // via previous_response_id, but this loop's own `input` is replaced
  // each round with just that round's outputs, so anything the model
  // still needs to see (like this pacing instruction) has to be
  // re-included explicitly.
  let pacingNoteItem: OpenAI.Responses.ResponseInputItem | null = null;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await ctx.openai.responses.create({
      model: TUTOR_MODEL,
      instructions: ctx.systemInstructions,
      input,
      tools,
      previous_response_id: previousResponseId,
    });

    const functionCalls = response.output.filter(
      (item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === "function_call",
    );

    if (functionCalls.length === 0) {
      return { content: response.output_text, toolCalls, ladderStepUsed, conceptIds, pendingEvidenceCommits };
    }

    const outputs: OpenAI.Responses.ResponseInputItem[] = [];
    for (const call of functionCalls) {
      const args = JSON.parse(call.arguments) as Record<string, unknown>;
      const result = await executeTool(call.name, args, ctx, pendingEvidenceCommits);
      toolCalls.push({ toolName: call.name, arguments: args, result });
      outputs.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result),
      });

      // The ladder can only be computed once we know which concept(s)
      // this exchange actually concerns -- that's exactly what a
      // search_course_materials match tells us (T016).
      if (call.name === "search_course_materials") {
        const matchedConcepts = (result as { concepts?: { id: string }[] }).concepts ?? [];
        if (matchedConcepts.length > 0) {
          conceptIds = matchedConcepts.map((c) => c.id);
          const priorAttempts: LadderAttempt[] = ctx.priorTurns
            .filter((t) => t.conceptIds.some((id) => conceptIds.includes(id)))
            .map((t) => ({ resolved: t.correct === true, requestedDirectAnswer: t.requestedDirectAnswer }));
          if (ctx.requestedDirectAnswer) {
            priorAttempts.push({ resolved: false, requestedDirectAnswer: true });
          }
          ladderStepUsed = computeLadderStep(priorAttempts, DEFAULT_LADDER_WEIGHTS);
          pacingNoteItem = {
            role: "user",
            content: `[Pacing note, not from the student: respond at assistance-ladder step ${ladderStepUsed} -- ${LADDER_STEP_DESCRIPTIONS[ladderStepUsed]}]`,
          };
        }
      }
    }

    if (pacingNoteItem) {
      outputs.push(pacingNoteItem);
    }

    previousResponseId = response.id;
    input = outputs;
  }

  // The cap was reached without a final text response -- an honest
  // fallback, never a truncated/fabricated answer (research.md).
  return { content: TOOL_ROUND_LIMIT_MESSAGE, toolCalls, ladderStepUsed, conceptIds, pendingEvidenceCommits };
}
