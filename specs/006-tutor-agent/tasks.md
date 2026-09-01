---

description: "Task list template for feature implementation"
---

# Tasks: Tutor Agent

**Input**: Design documents from `/specs/006-tutor-agent/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/tutor-actions.md, quickstart.md

**Tests**: Included. This feature's real testable value splits in two:
pure logic (`computeLadderStep`, the grounding query builder, tool-call
validation) gets exhaustive `node --test` coverage test-first, same
reasoning already applied to `learner-graph-evidence`'s
`computeLearnerState`; the new chat UI gets Playwright coverage using a
test-double tutor response (plan.md's Testing section — no live OpenAI
calls in the suite, no pixel-diff visual regression needed here).

**Organization**: Tasks are grouped by user story (spec.md priorities:
US1/US2 = P1, US3/US4 = P2).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US4)
- Every task includes its exact file path

## Path Conventions

Single Next.js project (per plan.md's Project Structure):
`src/features/tutor-agent/`, `supabase/migrations/`,
`tests/unit/tutor-agent/`, `tests/e2e/`.

---

## Phase 1: Setup

- [X] T001 [P] Create `src/features/tutor-agent/tutor-tools-schema.ts` per
  contracts/tutor-actions.md: JSON-schema tool definitions for all 5
  tools (`search_course_materials`, `get_concept_state`,
  `get_concept_neighbors`, `record_exposure`,
  `record_misconception_candidate`), mirroring
  `course-graph-ingestion/extraction-schema.ts`'s pattern for passing a
  schema to the OpenAI Responses API — parameter shapes match
  contracts/tutor-actions.md exactly. No database dependency, so this
  can be written before the migration exists.

**Checkpoint**: The tool surface's exact shape is fixed in one place
before any code calls it.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema and shared types every user story writes to or reads
from. No user story can be implemented before this phase completes.

- [X] T002 Write `supabase/migrations/0005_tutor_agent.sql` per
  data-model.md: `tutor_conversations`, `tutor_conversation_turns`,
  `tutor_tool_calls`, all columns/check constraints as specified
  (append-only turns/tool-calls, `tool_name` constrained to exactly this
  feature's 5 tools) — RLS keyed on `user_id = auth.uid()` (research.md,
  matching `learner-graph-evidence`'s precedent); also adds the
  `evidence_events_conversation_turn_id_fkey` foreign key data-model.md
  calls out as this migration's divergence from `0004_learner_evidence.sql`
- [X] T003 Push the migration (`npx supabase db push`) and verify RLS: an
  anon-key query against each new table returns `status=200, rows=0` for
  a signed-out session, and the new FK constraint exists — do not proceed
  until confirmed against the live project
- [X] T004 [P] Extend `src/lib/supabase/database.types.ts` with
  `TutorConversationRow`, `TutorConversationTurnRow`, `TutorToolCallRow`
  row/insert/update types, same pattern used for every prior table

**Checkpoint**: Schema live and RLS-verified. No conversation logic yet.

---

## Phase 3: User Story 1 - A student gets a grounded, source-traceable answer (Priority: P1)

**Goal**: A student can start a conversation and get an answer grounded
in and traceable to the course's own confirmed concepts/edges/artifacts —
or an honest "not covered"/"off-topic" response when nothing grounds it.
No pacing yet (US2 adds the assistance ladder on top of this same loop).

**Independent Test**: Ask the tutor a question covered by confirmed
course material and confirm the response is traceable to real content;
ask something uncovered or off-topic and confirm it says so plainly
rather than inventing an answer (spec.md).

**Depends on**: Phase 2 (schema, tool schemas).

### Implementation for User Story 1

- [X] T005 [P] [US1] Write
  `tests/unit/tutor-agent/search-course-materials.test.ts` (test-first):
  a query scoped to one `course_id` never returns another course's rows;
  only `status = 'confirmed'` concepts/edges are matched; matching is
  case-insensitive against `canonical_name`/`aliases`/`description`
  (concepts) or `explanation` (edges); a query matching nothing returns
  an empty array, never a fabricated result; every returned item carries
  its real `source_anchors` unchanged
- [X] T006 [US1] Create `src/features/tutor-agent/search-course-materials.ts`
  per data-model.md: `buildSearchQuery(courseId, query, filters?)` plus
  row-to-result mapping; make T005 pass
- [X] T007 [P] [US1] Write
  `tests/unit/tutor-agent/tool-call-validation.test.ts` (test-first): a
  pure validator rejects a `search_course_materials` call missing
  `query`, a `get_concept_state` call with an empty `conceptIds` array,
  and a `get_concept_neighbors` call missing `conceptId`, all before any
  Supabase call happens
- [X] T008 [US1] Create `src/features/tutor-agent/tool-call-validation.ts`:
  the pure validators T007 tests, one per tool this feature's schema
  defines (extended further in US4 for the two evidence-recording tools)
- [X] T009 [US1] Create `src/features/tutor-agent/run-tutor-turn.ts`
  (initial version): the model↔tool round-trip loop per research.md's
  capped-round design (max 6 rounds; an honest "I'm not able to finish
  that right now" reply if the cap is hit, never a truncated/fabricated
  answer) — wires only `search_course_materials` at this stage
  (`get_concept_state`/`get_concept_neighbors` added in US3, the two
  evidence-recording tools added in US4); the model's instructions
  require every substantive claim to cite a `search_course_materials`
  result, and require an honest "not covered"/"off-topic" response when
  nothing grounds the question (FR-001/FR-002/FR-003)
- [X] T010 [US1] Create `src/features/tutor-agent/actions.ts` with
  `startConversation` and `sendTutorMessage` per
  contracts/tutor-actions.md: inserts the student's `tutor_conversation_turns`
  row, runs `run-tutor-turn.ts`, inserts one `tutor_tool_calls` row per
  tool invocation, inserts the tutor's reply turn; rejects with an error
  (not a silent no-op) when `conversationId` doesn't resolve to a
  conversation owned by the calling student
- [X] T011 [US1] In `actions.ts`: `getConversation(conversationId)` per
  contracts/tutor-actions.md — RLS-scoped read (no `userId` parameter
  accepted), turns in chronological order
- [X] T012 [US1] Create `src/app/courses/[courseId]/tutor/page.tsx`: a
  minimal chat UI — start a conversation on load, send a message, render
  the turn history as it grows
- [X] T013 [P] [US1] Write `tests/e2e/tutor-agent.spec.ts`'s first
  scenarios: a question covered by confirmed course material produces a
  visibly grounded/sourced answer; a question the material doesn't cover
  produces an honest "not covered" response — both using a scripted
  test-double tutor response (plan.md — no live OpenAI calls in this
  suite)

**Checkpoint**: A student can have a grounded conversation. This is the
MVP — every later story either paces this loop, calibrates it to real
state, or makes its effects real evidence.

---

## Phase 4: User Story 2 - The tutor paces help instead of just answering (Priority: P1)

**Goal**: Help opens at the minimum useful intervention and escalates one
step at a time (PRD's assistance ladder), while a student can always
reach the complete answer immediately by asking for it directly.

**Independent Test**: Ask about a concept with no prior evidence and
confirm the first response is a retrieval/diagnostic prompt, not a full
explanation; confirm escalation happens one step at a time across
repeated struggling attempts; confirm asking for the direct answer at any
point produces one immediately (spec.md).

**Depends on**: User Story 1 (the conversation loop this story paces).

### Implementation for User Story 2

- [X] T014 [P] [US2] Write
  `tests/unit/tutor-agent/assistance-ladder.test.ts` (test-first): no
  prior attempts on a concept resolves to step `0`; unresolved attempts
  escalate one step at a time per `weights.attemptsPerStep`, never
  skipping steps; any attempt with `requestedDirectAnswer: true` resolves
  to step `6` immediately regardless of how many attempts came before it
  (FR-006's escape hatch checked first); a `resolved: true` attempt
  passed for one question doesn't leak into a separately-scoped call for
  a different question
- [X] T015 [US2] Create `src/features/tutor-agent/assistance-ladder.ts`
  per data-model.md: `computeLadderStep(priorAttempts, weights)` plus a
  default `LadderWeights` (`attemptsPerStep`, labeled in a code comment as
  a tunable starting parameter, not a calibrated constant — same labeling
  convention `learner-graph-evidence/evidence-weights.ts` already
  established); make T014 pass
- [X] T016 [US2] Wire `run-tutor-turn.ts` to call `computeLadderStep`
  before responding to a concept-explanation request: derive
  `priorAttempts` from this conversation's own `tutor_conversation_turns`
  history (`concept_ids`/`correct`/`requested_direct_answer`), detect an
  explicit "just explain"/"give me the answer" request in the student's
  message as `requestedDirectAnswer`, and instruct the model to respond
  at exactly the computed step's intervention level (FR-004/FR-005/FR-006)
- [X] T017 [US2] Extend `actions.ts`'s `sendTutorMessage` to persist
  `concept_ids`/`correct`/`requested_direct_answer` on the student's turn
  and `ladder_step_used` on the tutor's reply turn (data-model.md)
- [X] T018 [P] [US2] Add `tests/e2e/tutor-agent.spec.ts` scenarios: asking
  about an unverified concept opens with a diagnostic prompt, not a full
  explanation; explicitly asking for the direct answer produces one
  immediately regardless of ladder position (scripted test-double
  responses at each ladder step)

**Checkpoint**: Help is paced, not just answered outright, and the escape
hatch always works — the product's core differentiator is now real, not
just designed for.

---

## Phase 5: User Story 3 - The tutor calibrates to what the student has actually demonstrated (Priority: P2)

**Goal**: Before responding, the tutor checks the student's real recorded
state for the concept in question (and its neighbors), never assumes a
stronger state than what's actually recorded, and can reason about
prerequisite relationships.

**Independent Test**: With one concept's real state at "solid" and a
neighboring concept "unverified," ask about both in one conversation;
confirm the response visibly treats them differently and never overstates
the unverified one (spec.md).

**Depends on**: User Story 1 (a conversation must exist) and
`learner-graph-evidence`'s already-shipped `getConceptState`/`getEdgeState`.

### Implementation for User Story 3

- [X] T019 [P] [US3] Write
  `tests/unit/tutor-agent/get-concept-neighbors.test.ts` (test-first): a
  query for one concept returns only confirmed `concept_edges` touching
  it as either endpoint, scoped to the given course; a concept with no
  edges returns an empty array, never a fabricated relationship
- [X] T020 [US3] Extend `search-course-materials.ts` with
  `getConceptNeighbors(courseId, conceptId)` per contracts/tutor-actions.md
  (both functions query the same confirmed `course_concepts`/
  `concept_edges` tables, so they share this file rather than
  duplicating query setup); make T019 pass
- [X] T021 [US3] Wire `run-tutor-turn.ts`'s tool-execution step for
  `get_concept_state` (calling `learner-graph-evidence`'s existing
  `getConceptState` per id — never a separately-coded default for
  "no evidence yet," reusing that exact codepath) and
  `get_concept_neighbors` (calling T020's `getConceptNeighbors`, then
  `getConceptState` for each neighboring concept)
- [X] T022 [US3] Update `run-tutor-turn.ts`'s model instructions to
  require calling `get_concept_state` (and `get_concept_neighbors` when a
  question touches a relationship) before responding about a concept, and
  to treat an "unverified"/baseline result as genuinely unverified, never
  assuming a stronger state (FR-007/FR-008)
- [X] T023 [P] [US3] Add a `tests/e2e/tutor-agent.spec.ts` scenario: with
  one concept fixture-seeded at "solid" state and a neighboring concept
  "unverified," confirm the scripted test-double response visibly
  reflects that difference (a live model's actual judgment isn't
  something this suite can assert on — it confirms the tutor received
  and passed through the real state, not that the model reasoned about it
  well)

**Checkpoint**: The tutor's responses reflect real, current learner
state — never an assumed one.

---

## Phase 6: User Story 4 - The conversation itself produces real, auditable evidence (Priority: P2)

**Goal**: Independent correct retrieval and confident, repeated incorrect
answers become real `evidence_events` through the existing validated
`commitEvidence` path — the tutor never writes learner state directly.

**Independent Test**: In one conversation, answer a retrieval prompt
correctly unprompted, then give a confident wrong answer twice more to
the same concept; confirm both produce real evidence (not a direct
mastery change) and that reading the state back afterward reflects it
(spec.md).

**Depends on**: User Story 1 (a conversation must exist), User Story 2
(attempt/resolution tracking supplies the "independent, correct/incorrect"
signal), and `learner-graph-evidence`'s already-shipped `commitEvidence`.

### Implementation for User Story 4

- [X] T024 [P] [US4] Extend
  `tests/unit/tutor-agent/tool-call-validation.test.ts`: rejects a
  `record_exposure`/`record_misconception_candidate` call targeting zero
  concepts and zero edges (mirrors
  `learner-graph-evidence/commit-evidence-validation.ts`'s existing
  rule), and rejects a `record_misconception_candidate` call missing
  `description`
- [X] T025 [US4] Extend `tool-call-validation.ts` to cover
  `record_exposure`/`record_misconception_candidate`; make the new T024
  cases pass
- [X] T026 [US4] Wire `run-tutor-turn.ts`'s tool-execution step for
  `record_exposure` and `record_misconception_candidate`: both call
  `learner-graph-evidence`'s existing `commitEvidence` with
  `conversationTurnId` set to the student turn being responded to
  (contracts/tutor-actions.md) — no code path in this feature writes
  `learner_concept_state`/`learner_edge_state` directly (Constitution
  Principle II, FR-012)
- [X] T027 [US4] Update `run-tutor-turn.ts`'s model instructions: call
  `record_exposure` when a student demonstrates independent correct
  retrieval/application (FR-009, `evidenceType` reflecting what actually
  happened) and when logging passive exposure (FR-011, always at
  exposure-level confidence); call `record_misconception_candidate`
  specifically for a recognized, recurring wrong-belief pattern, not for
  an isolated incorrect answer (which `record_exposure` with
  `evidenceType: "retrieval"`/`correctness: false` already covers)
- [X] T028 [P] [US4] Add a `tests/e2e/tutor-agent.spec.ts` scenario: a
  scripted test-double conversation where the student answers correctly
  unprompted, then confidently incorrectly twice more; confirm (via a
  direct `getConceptState` check, not UI-only) that real `evidence_events`
  rows exist referencing this conversation's turn ids and that
  `hasUnresolvedMisconception` ends up `true`

**Checkpoint**: All four user stories complete. A student's conversation
is grounded, paced, calibrated to their real state, and every one of its
effects on that state is real, evidence-backed, and traceable back to the
turn that produced it.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T029 Run `npm run typecheck` across the whole repository — expect
  PASS with no regressions outside this feature
- [X] T030 Run `npm run test:unit` — expect PASS (all prior phases' tests
  plus this feature's assistance-ladder/search-course-materials/
  get-concept-neighbors/tool-call-validation tests)
- [X] T031 Add `tests/e2e/tutor-agent.spec.ts` to the project's e2e test
  run and confirm the full suite passes
- [X] T032 Walk through quickstart.md Groups A and B end to end; Group
  B's live conversation/ladder/evidence checks (a real `OPENAI_API_KEY`
  call, real Supabase reads) must be actually confirmed against the live
  project before this feature is called done, not assumed from the
  test-double suite alone

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational only — the MVP: a
  grounded conversation loop exists.
- **User Story 2 (Phase 4)**: Depends on US1 (paces the same loop US1
  built).
- **User Story 3 (Phase 5)**: Depends on US1 (a conversation to calibrate)
  and reuses `learner-graph-evidence`'s existing state-read actions
  unchanged.
- **User Story 4 (Phase 6)**: Depends on US1 (a conversation to draw
  evidence from) and US2 (attempt/resolution tracking supplies the
  independent-correctness signal), and reuses
  `learner-graph-evidence`'s existing `commitEvidence` unchanged.
- **Polish (Phase 7)**: Depends on all four user stories.

### Within Each User Story

- US1: test-first pure query/validation work (T005-T008), then the
  tool-calling loop and server actions that compose them (T009-T011,
  same files, sequential), then the new UI (T012), then its E2E coverage
  (T013).
- US2: test-first pure ladder algorithm (T014-T015), then wiring it into
  the existing loop/actions from US1 (T016-T017, same files as US1,
  sequential extension), then its E2E coverage (T018).
- US3: test-first pure neighbor query (T019-T020), then wiring the two
  read-only tools into the existing loop (T021-T022), then its E2E
  coverage (T023).
- US4: test-first validation extension (T024-T025), then wiring the two
  evidence-recording tools into the existing loop (T026-T027), then its
  E2E coverage (T028).

### Parallel Opportunities

- T001 (tool schemas) has no dependency on the migration and could start
  immediately.
- T004 (database types) and T005/T007 (US1's test files) can all start
  once T002/T003 land, independently of each other.
- T005 and T007 are different files with no dependency on each other.
- T014 (US2's ladder test) can be written in parallel with any US1 task
  once US1's phase begins, since `assistance-ladder.ts` is a new,
  independent file — only the *wiring* task (T016) has to wait for US1's
  `run-tutor-turn.ts` (T009) to exist.
- T019 (US3's neighbor-query test) is similarly independent of US2's
  ladder work — both extend different parts of the US1 baseline.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (T002-T003 — blocks everything; must be
   verified live against Supabase, not just written)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: have one real conversation, confirm a grounded
   answer cites real course content and an uncovered question gets an
   honest "not covered" response, `npm run typecheck` and this story's
   unit/E2E tests all pass
5. This alone proves the core grounded-conversation mechanism works
   before pacing, state-calibration, or evidence-recording exist

### Incremental Delivery

1. Setup + Foundational → schema live, tool schemas in place
2. US1 → a grounded conversation loop exists (MVP)
3. US2 → help is paced, not just answered outright — the product's core
   differentiator is real
4. US3 → responses reflect real, current learner state, never an assumed
   one
5. US4 → every learner-state effect of a conversation is real,
   evidence-backed, and traceable
6. Polish → full test suite, live quickstart walkthrough

### Solo Build Note

Same as every prior feature: `[P]` markers mark ordering-independence,
not parallel staffing. Commit after each task or tight cluster,
solo-authored, no AI co-author trailer, per project convention.

---

## Notes

- US3 and US4 both reuse `learner-graph-evidence`'s existing actions
  (`getConceptState`/`getEdgeState`/`commitEvidence`) completely
  unchanged — neither story adds a second implementation of state-reading
  or evidence-writing logic. Called out explicitly rather than left to
  look like new capability was built where reuse was actually the point.
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that
  aren't called out explicitly (US4's dependency on both US1 and US2 is
  documented above, not hidden).
