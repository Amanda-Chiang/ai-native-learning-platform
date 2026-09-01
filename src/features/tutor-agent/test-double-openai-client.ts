import type OpenAI from "openai";

/**
 * A scripted stand-in for the OpenAI Responses API client, used only in
 * the Playwright E2E suite (gated by `TUTOR_AGENT_USE_TEST_DOUBLE=true`,
 * never on by accident -- plan.md's Testing section: no live OpenAI
 * calls in that suite). It exercises the SAME tool-execution code path
 * `run-tutor-turn.ts` uses against real (test) Supabase data -- only the
 * model's own text generation is faked, driven by the real tool results
 * (and run-tutor-turn.ts's own injected ladder-pacing note) it receives
 * back, not by guessing at what a real model would say.
 *
 * Scripted round pattern for a concept-related question (mirrors what a
 * real model calling these tools in sequence would actually do):
 * round 1 -> search_course_materials; round 2 -> get_concept_state for
 * whatever concept matched; round 3 -> final text, informed by both the
 * real search result and the real recorded state.
 *
 * - A message containing "weather"/"unrelated" skips tool calls entirely
 *   and declines as off-topic (no ladder applies).
 * - A "solid" recorded state is acknowledged instead of re-taught,
 *   regardless of ladder step (US3).
 * - Otherwise, the reply matches run-tutor-turn.ts's injected ladder
 *   step: step 0 asks the student to retrieve it themselves; step 6+
 *   gives the real answer (or an honest "not covered" if nothing
 *   matched); anything in between gives a partial hint only.
 * - A message containing "i got it right" additionally calls
 *   record_exposure (correctness:true, independent) before the final
 *   answer; a message containing "wrong answer" additionally calls
 *   record_misconception_candidate (US4) -- both real evidence commits
 *   against real (test) Supabase data, not mocked.
 */

type FakeCall = { name: string; call_id: string; arguments: string };

let callCounter = 0;
function nextCallId(): string {
  callCounter += 1;
  return `fake-call-${callCounter}`;
}

type InputItem = { type?: string; call_id?: string; output?: string; role?: string; content?: string };

function extractFunctionCallOutputs(input: OpenAI.Responses.ResponseInput): { call_id: string; output: string }[] {
  return (input as unknown as InputItem[])
    .filter((item) => item.type === "function_call_output")
    .map((item) => ({ call_id: item.call_id!, output: item.output! }));
}

function extractPacingStep(input: OpenAI.Responses.ResponseInput): number | null {
  const note = (input as unknown as InputItem[]).find(
    (item) => item.role === "user" && typeof item.content === "string" && item.content.startsWith("[Pacing note"),
  );
  if (!note) return null;
  const match = note.content!.match(/step (\d+)/);
  return match ? Number(match[1]) : null;
}

function buildResponse(outputText: string, functionCalls: FakeCall[] = []): OpenAI.Responses.Response {
  const output = functionCalls.map(
    (c) =>
      ({
        type: "function_call",
        call_id: c.call_id,
        name: c.name,
        arguments: c.arguments,
        id: c.call_id,
      }) as unknown as OpenAI.Responses.ResponseFunctionToolCall,
  );

  return {
    id: `fake-response-${nextCallId()}`,
    output,
    output_text: outputText,
  } as unknown as OpenAI.Responses.Response;
}

const OFF_TOPIC_MESSAGE = "That's outside this course -- let's stick to the material we're covering here.";
const NOT_COVERED_MESSAGE = "The course material doesn't cover that yet.";
const RETRIEVAL_PROMPT = "Before I explain, try recalling or predicting the answer yourself first -- what do you think it is?";

type SearchResult = { concepts?: { id: string; canonicalLabel: string; description: string }[] };
type ConceptStateResult = { states?: { conceptId: string; masteryState: string }[] };
type EvidenceAck = { status?: string };

function finalAnswer(
  matchedConcept: { canonicalLabel: string; description: string } | null,
  input: OpenAI.Responses.ResponseInput,
): OpenAI.Responses.Response {
  const step = extractPacingStep(input);
  if (step === null || step >= 6) {
    return buildResponse(matchedConcept ? `${matchedConcept.canonicalLabel}: ${matchedConcept.description}` : NOT_COVERED_MESSAGE);
  }
  if (step === 0) {
    return buildResponse(RETRIEVAL_PROMPT);
  }
  return buildResponse(
    matchedConcept ? `Here's a hint: think about what ${matchedConcept.canonicalLabel} is used for.` : NOT_COVERED_MESSAGE,
  );
}

export function createTestDoubleOpenAIClient(): OpenAI {
  // Scoped to one client instance -- one sendTutorMessage call creates
  // exactly one client (actions.ts), so this closure state never leaks
  // across different students'/conversations' turns.
  let matchedConcept: { id: string; canonicalLabel: string; description: string } | null = null;
  let originalMessage = "";

  const client = {
    responses: {
      async create(params: OpenAI.Responses.ResponseCreateParamsNonStreaming): Promise<OpenAI.Responses.Response> {
        const input = params.input as OpenAI.Responses.ResponseInput;
        const priorOutputs = extractFunctionCallOutputs(input);

        if (priorOutputs.length > 0) {
          const latest = priorOutputs[priorOutputs.length - 1];
          const parsed = JSON.parse(latest.output) as SearchResult & ConceptStateResult & EvidenceAck;

          // Just got record_exposure/record_misconception_candidate's
          // acknowledgment back -- nothing left to do but answer.
          if (parsed.status === "recorded") {
            return finalAnswer(matchedConcept, input);
          }

          // Just got a get_concept_state result back.
          if (parsed.states) {
            const state = parsed.states[0];
            if (state?.masteryState === "solid") {
              return buildResponse("You've already shown solid understanding of this -- want to go deeper instead?");
            }

            if (matchedConcept && originalMessage.includes("i got it right")) {
              return buildResponse("", [
                {
                  name: "record_exposure",
                  call_id: nextCallId(),
                  arguments: JSON.stringify({
                    conceptIds: [matchedConcept.id],
                    edgeIds: [],
                    evidenceType: "retrieval",
                    correctness: true,
                    graderConfidence: 0.9,
                    assistanceLevel: 0,
                    difficulty: 0.6,
                    transferDistance: 0,
                    studentConfidence: 0.9,
                  }),
                },
              ]);
            }
            if (matchedConcept && originalMessage.includes("wrong answer")) {
              return buildResponse("", [
                {
                  name: "record_misconception_candidate",
                  call_id: nextCallId(),
                  arguments: JSON.stringify({
                    conceptIds: [matchedConcept.id],
                    description: "Repeatedly confuses this concept with a related but distinct one.",
                    graderConfidence: 0.9,
                    assistanceLevel: 0,
                    difficulty: 0.6,
                    transferDistance: 0,
                    studentConfidence: 0.9,
                  }),
                },
              ]);
            }

            return finalAnswer(matchedConcept, input);
          }

          // Just got a search_course_materials result back.
          const concept = parsed.concepts?.[0];
          if (!concept) {
            return buildResponse(NOT_COVERED_MESSAGE);
          }
          matchedConcept = concept;
          return buildResponse("", [
            {
              name: "get_concept_state",
              call_id: nextCallId(),
              arguments: JSON.stringify({ conceptIds: [concept.id] }),
            },
          ]);
        }

        // Round 1: decide from the student's own message.
        const firstItem = input[0] as { content?: string };
        const message = (firstItem?.content ?? "").toLowerCase();
        originalMessage = message;

        if (message.includes("weather") || message.includes("unrelated")) {
          return buildResponse(OFF_TOPIC_MESSAGE);
        }

        const match = message.match(/(?:explain|about)\s+(.+?)(?:[,.]|$| -- i got it right| -- wrong answer)/);
        const query = (match ? match[1] : message).trim();

        return buildResponse("", [
          {
            name: "search_course_materials",
            call_id: nextCallId(),
            arguments: JSON.stringify({ query }),
          },
        ]);
      },
    },
  };

  return client as unknown as OpenAI;
}
