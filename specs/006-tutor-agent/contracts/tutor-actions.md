# Server Action Contracts

All server actions (`src/features/tutor-agent/actions.ts`), same pattern
as every other feature in this project.

## `startConversation(courseId: string): Promise<{ conversationId: string; error: string | null }>`

- **Produces**: a new `tutor_conversations` row for the calling student
  and this course. `userId` comes from the authenticated session only,
  never a parameter (same reasoning as every other action's
  `owner_id`/`user_id` handling in this project).

## `sendTutorMessage(conversationId: string, message: string): Promise<{ turn: TutorTurnView | null; error: string | null }>`

```ts
type TutorTurnView = {
  role: "tutor";
  content: string;
  ladderStep: number | null;   // null when this turn wasn't a paced-help response (e.g. a plain grounded answer with no ladder involved)
  toolCalls: { toolName: string; summary: string }[];   // human-readable trace, not the raw arguments/result
};
```

- **Consumes**: the conversation to continue and the student's message
  text. Rejects (with an error, not a silent no-op) if `conversationId`
  doesn't resolve to a `tutor_conversations` row owned by the calling
  student.
- **Produces**: one `tutor_conversation_turns` row for the student's
  message (`role: "student"`), then runs `run-tutor-turn.ts`'s
  model↔tool loop (research.md's capped-round design), inserting one
  `tutor_tool_calls` row per tool invocation and finally one
  `tutor_conversation_turns` row for the tutor's reply (`role: "tutor"`).
  Every tool call that commits evidence (`record_exposure`,
  `record_misconception_candidate`) calls
  `learner-graph-evidence`'s existing `commitEvidence` with
  `conversationTurnId` set to the *student* turn that prompted it — this
  action never writes `learner_concept_state`/`learner_edge_state`
  itself (Constitution Principle II).
- If the tool-call loop hits its round cap without a final response
  (research.md), `turn.content` is an honest "I'm not able to finish
  that right now" message, not a truncated/fabricated answer, and
  `error` is `null` (this is a completed, if unsatisfying, turn — not a
  failure of the action itself).

## `getConversation(conversationId: string): Promise<{ turns: (TutorTurnView | { role: "student"; content: string })[]; error: string | null }>`

- **Produces**: the calling student's own conversation history
  (RLS-scoped, no `userId` parameter accepted — same isolation pattern as
  every existing read action in this project), turns in chronological
  order.

## Tool functions (not server actions — internal to `run-tutor-turn.ts`)

These are the JSON-schema tools (`tutor-tools-schema.ts`) the model can
call during a turn; they are plain TypeScript functions invoked by the
tool-calling loop, not separately exposed as server actions.

### `search_course_materials(query: string, filters?: { conceptIds?: string[] })`

- **Produces**: confirmed concepts/edges matching `query`
  (`search-course-materials.ts`, data-model.md), each with its real
  `source_anchors`. Empty array when nothing matches — never a fabricated
  result.

### `get_concept_state(conceptIds: string[])`

- **Produces**: each concept's real state via
  `learner-graph-evidence`'s existing `getConceptState` (unchanged, one
  call per id) — the FR-010-equivalent baseline when no evidence exists,
  from that same existing codepath, never a separate default coded here.

### `get_concept_neighbors(conceptId: string)`

- **Produces**: the confirmed `concept_edges` rows touching `conceptId`
  (either endpoint), with each neighboring concept's own real
  `masteryState` via the same `getConceptState` codepath — so the tutor
  can reason about a prerequisite's real state, not just the target
  concept's.

### `record_exposure(input: RecordEvidenceInput)`

```ts
type RecordEvidenceInput = {
  conceptIds: string[];
  edgeIds: string[];
  evidenceType: EvidenceType;   // e.g. "exposure" for passive mention, "retrieval"/"application" for an independent demonstration (FR-009/FR-011 both go through this one tool, distinguished by evidenceType/correctness/assistanceLevel — not two separate code paths)
  correctness: boolean | null;
  graderConfidence: number;
  assistanceLevel: number;
  difficulty: number;
  transferDistance: number;
  studentConfidence?: number;
};
```

- **Produces**: calls `learner-graph-evidence`'s existing
  `commitEvidence` with `conversationTurnId` set to the student turn
  being responded to. Named `record_exposure` to match PRD S14.2's tool
  list, but — same as `commitEvidence` itself — general over
  `evidenceType`; it is the one tool this feature uses for every
  conversation-derived evidence commit that isn't specifically a
  recognized misconception pattern (see below).

### `record_misconception_candidate(input: { conceptIds: string[]; description: string } & Omit<RecordEvidenceInput, "conceptIds" | "edgeIds" | "evidenceType">)`

- **Produces**: calls `commitEvidence` with `evidenceType: "misconception"`
  and `correctness: false` — used specifically when the tutor recognizes
  a named, recurring wrong-belief pattern (distinct from an ordinary
  incorrect retrieval attempt, which `record_exposure` already covers
  with `evidenceType: "retrieval"`/`correctness: false`). `description`
  is stored nowhere new — it exists only to make the model's own
  reasoning for calling this tool visible in `tutor_tool_calls.arguments`
  (audit trail), not a new persisted field on `evidence_events`.
