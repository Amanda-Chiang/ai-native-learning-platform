# Research: Tutor Agent

## Why not the separate `@openai/agents` package

- **Decision**: Build the tool-calling loop directly on the existing
  `openai` npm package's Responses API (`openai.responses.create` with a
  `tools` array), the same client `course-graph-ingestion`'s
  `openai-extraction-call.ts` already uses. Do not add the separate
  `@openai/agents` package.
- **Rationale**: the constitution's Technology & Architecture Constraints
  name "OpenAI Agents SDK / Responses API" together, and the PRD's own
  §14 recommendation frames the Agents SDK as sitting on top of Responses
  API primitives. But this project also has a standing rule: no new
  external dependency when an existing one already solves the problem.
  The Agents SDK's actual value-add over calling `tools`/multi-round
  tool-calling directly is (a) named-agent handoffs and cross-agent
  guardrails, and (b) some loop-management/tracing convenience. (a) is
  explicitly unused here — the constitution itself requires *one*
  primary tutor agent with *no* multi-agent handoff architecture for this
  feature (Architecture rule, and the 2026-08-31 decision log entry) —
  and (b) is a convenience, not a capability gap: the Responses API
  already returns tool-call requests in `response.output`, and feeding
  results back for the next round is a few lines of code, the same shape
  `course-graph-ingestion` already uses for its own single
  `responses.create` calls. Adding a second OpenAI package whose
  headline feature (multi-agent orchestration) this feature is
  constitutionally forbidden from using would be exactly the kind of
  unjustified new dependency the project's standing rule exists to
  prevent.
- **Alternatives considered**: adding `@openai/agents` now anyway "since
  the constitution names it" (rejected — the constitution's own
  Development Workflow section makes Core Principles/the no-new-
  dependency rule the actual load-bearing constraint; a
  literal-doc-title reading that adds an unused package would be
  optimizing for matching a phrase over the actual requirement it's
  shorthand for). Revisit if a real future need for named-agent handoffs
  or cross-agent tracing appears — record that as its own ADR when it
  does, per the project's standing "no new dependency without a
  demonstrated requirement" rule.

## Grounding: query confirmed course_concepts/concept_edges directly, no new retrieval pipeline

- **Decision**: `search_course_materials(query, filters)` is a structured
  Postgres query over `course_concepts`/`concept_edges` where
  `status = 'confirmed'`, matching `query` against
  `canonical_name`/`aliases`/`description` (concepts) or
  `explanation`/`relation_type` (edges), returning each match together
  with its existing `source_anchors` (artifact id + locator + excerpt).
  No embeddings, no vector store, no OpenAI hosted `file_search` tool,
  no `pgvector` extension.
- **Rationale**: every confirmed concept/edge already carries
  `source_anchors` from `course-graph-ingestion`'s extraction pipeline —
  a real excerpt of the actual uploaded artifact, already validated by
  Constitution Principle V at ingestion time. "Grounded in ... uploaded
  artifacts" (spec.md) is fully satisfied by citing that existing
  provenance data directly; building a second, parallel retrieval path
  over the raw artifact files (chunking, embeddings, a vector store)
  would duplicate information the ontology already carries, risk the two
  disagreeing, and is exactly the kind of new persistence layer the
  project's standing rule requires an ADR to justify before adding. The
  PRD itself (§9, R15-R18) treats hosted file-search/pgvector as
  available *if* retrieval control becomes a differentiator later — not
  as something this feature has a demonstrated need for today, since the
  ontology's own anchors already answer the grounding requirement.
- **Alternatives considered**: OpenAI's hosted `file_search` tool over a
  per-course vector store of uploaded artifacts (rejected for now — real
  new infrastructure, i.e. maintaining a synced vector store per course,
  with no demonstrated need the ontology's existing anchors don't already
  cover; the PRD explicitly keeps this as a later alternative, not a v1
  requirement). Supabase `pgvector` (rejected for the same reason, and
  it's explicitly a new persistence layer requiring its own ADR first
  per the project's standing rule). Revisit if real usage shows students
  asking things confirmed concepts/edges genuinely don't cover but the
  raw artifact text does.

## Assistance ladder: recomputed from conversation history, not a persisted counter

- **Decision**: `assistance-ladder.ts` exports a pure function,
  `computeLadderStep(priorAttempts: LadderAttempt[], now, weights)`,
  that derives the current ladder step (0-6, PRD §14.3) fresh from that
  concept's attempt history within the current conversation — no
  `ladder_step` column is persisted anywhere. `LadderAttempt` is a small
  record of `{ resolved: boolean, requestedDirectAnswer: boolean }` per
  prior turn touching that concept, derived from
  `tutor_conversation_turns`.
- **Rationale**: same reasoning `learner-graph-evidence`'s
  `computeLearnerState` already established for this project
  (research.md "recompute from the full evidence log, never patch a
  running score") — a persisted step counter would need its own update
  path to keep in sync with the turns that actually justify it, and
  would drift the moment ladder-escalation *policy* changes (e.g.
  retuning how many attempts before escalating). Recomputing from the
  conversation's own turn history means the ladder logic is one pure,
  directly-testable function, consistent with this project's established
  pattern for exactly this kind of tunable, PRD-flagged-as-not-final
  policy.
- **Alternatives considered**: a persisted per-(conversation, concept)
  ladder-step column (rejected — same recalibration/drift risk
  `learner-graph-evidence`'s research.md already rejected an incremental
  aggregate for, applied here to a different kind of running state).

## No streaming in this feature

- **Decision**: `sendTutorMessage` returns the complete assistant turn
  once ready; no token-by-token streaming response, no new Route Handler
  with a `ReadableStream`.
- **Rationale**: this project has no existing streaming infrastructure
  (every prior feature is a synchronous server action), and SC-007's
  latency target (first visible reply within 3 seconds for the common
  case) is achievable by capping the tool-call loop and keeping grounding
  a fast indexed query (above) — not something that specifically requires
  streaming to hit. Adding a streaming Route Handler here would be new
  infrastructure with no demonstrated requirement forcing it yet.
- **Alternatives considered**: a streaming chat response via a Route
  Handler (rejected for now — real added complexity, no demonstrated
  need; revisit if real usage shows turns routinely exceeding the
  latency target and streaming perceived latency would meaningfully
  help).

## Tool-call loop bound

- **Decision**: `run-tutor-turn.ts` caps the model↔tool round-trip loop
  at a fixed maximum (6 rounds) per student turn. If the cap is reached
  without a final text response, the turn ends with an honest "I'm not
  able to finish that right now" message rather than looping
  indefinitely or silently returning a partial/fabricated answer.
- **Rationale**: a tool-calling loop with no bound is a real
  reliability/cost risk (a model that keeps requesting tools instead of
  answering). An explicit, low cap keeps latency bounded (Technical
  Context's performance goal) and turns an unbounded-loop failure mode
  into a visible, honest one — consistent with the project's
  no-silent-placeholders rule (a truncated/looping turn must say so, not
  quietly return whatever partial text exists as if it were complete).
- **Alternatives considered**: no cap (rejected — unbounded latency/cost
  risk with no real benefit); a much lower cap like 2 (rejected — a
  single question can legitimately need `search_course_materials` +
  `get_concept_state` + `get_concept_neighbors` before the model has
  enough grounding to respond well, so 2 would cut off normal, non-buggy
  turns).

## Conversation/turn persistence backs the field learner-graph-evidence left unbacked

- **Decision**: `tutor_conversations` and `tutor_conversation_turns` are
  new, real tables (migration `0005_tutor_agent.sql`), and
  `evidence_events.conversation_turn_id` gets a real foreign key to
  `tutor_conversation_turns.id` for the first time — it was left as a
  bare, unconstrained `uuid` column in `0004_learner_evidence.sql`
  specifically because "no conversation-turn table yet" existed
  (`specs/005-learner-graph-evidence/data-model.md`).
- **Rationale**: this is exactly the feature that creates that table, so
  this is the natural, and only correct, place to attach the FK — adding
  it here closes a documented, deliberate gap rather than leaving a
  second feature also treat conversation provenance as an untyped bare
  id.
- **Alternatives considered**: leaving the column unconstrained
  indefinitely (rejected — the gap was explicitly deferred to "when a
  conversation-turn table exists," not left as a permanent design
  choice).
