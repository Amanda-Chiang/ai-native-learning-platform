# Feature Specification: Tutor Agent

**Feature Branch**: `006-tutor-agent`

**Created**: 2026-09-01

**Status**: Draft

**Input**: User description: "tutor-agent: a single primary tutor agent that has a grounded conversation with a student about course material. Scope for this Phase 3 feature specifically (per docs/implementation-roadmap.md's Phase 3 row) is limited to: search_course_materials(query, filters) grounded in the course's confirmed concepts/edges and uploaded artifacts (source-anchored, Constitution Principle V); get_concept_state(concept_ids) and get_concept_neighbors(concept_id) reading real learner-graph-evidence state (never fabricated); record_exposure(...) and record_misconception_candidate(...) which commit real evidence_events through learner-graph-evidence's existing commitEvidence action (Constitution Principle II -- the agent never mutates learner state directly, only through that validated evidence path); and the PRD section 14.3 assistance ladder (0=ask student to retrieve/predict up through 6=give complete answer, minimum useful intervention, always overridable via an explicit \"just explain\" escape hatch per PRD's productive-friction decision). Explicitly OUT OF SCOPE for this feature (deferred to Phase 4's assessment-generation-pipeline): create_assessment_blueprint, render_graph, render_tree, run_code_checker, grade_structured_response, and any assessment/question-generation tool. The agent may never directly mutate mastery scores -- all learner-state updates happen through the existing validated evidence tools. One primary agent only, no multi-agent architecture."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A student gets a grounded, source-traceable answer (Priority: P1)

A student asks the tutor a question about material from their course. The
tutor answers using the course's own confirmed concepts, relationships,
and uploaded artifacts, and the answer's substantive claims can be traced
back to specific source material, never presented as authoritative when
it isn't grounded in anything real.

**Why this priority**: This is the baseline value of having a tutor at
all — an answer a student can trust is anchored to their actual course,
not a generic or fabricated one. Every other story depends on this
conversation loop existing first.

**Independent Test**: Ask the tutor a question whose answer exists in the
course's confirmed concepts/uploaded artifacts; confirm the response
references real course content and that a claim with no supporting
material is visibly flagged as such rather than stated as fact.

**Acceptance Scenarios**:

1. **Given** a course with confirmed concepts and uploaded artifacts,
   **When** a student asks a question whose answer is covered by that
   material, **Then** the tutor's answer is grounded in and traceable to
   specific confirmed concepts/edges or artifact excerpts.
2. **Given** a student asks something the course material doesn't cover,
   **When** the tutor responds, **Then** it says so plainly rather than
   inventing a plausible-sounding but ungrounded answer.
3. **Given** a student asks a question unrelated to the course entirely,
   **When** the tutor responds, **Then** it declines to answer as if it
   were course content and redirects toward the course's actual scope.

---

### User Story 2 - The tutor paces help instead of just answering (Priority: P1)

Before fully explaining something, the tutor gives the student a chance
to retrieve or predict the answer themselves, escalating help one step
at a time (PRD's assistance ladder) rather than jumping straight to a
complete answer — while always letting the student skip straight to a
full explanation if they ask for one.

**Why this priority**: This is the product's core differentiator (the
PRD's whole thesis: AI assistance that doesn't manufacture an illusion of
mastery). Without paced help, every conversation degrades into exposure
regardless of how well grounded the content is.

**Independent Test**: Ask the tutor to explain a concept the student
hasn't yet demonstrated retrieval of; confirm it starts with a retrieval
or diagnostic prompt rather than a full explanation, and that explicitly
asking for the full answer produces one immediately regardless of ladder
position.

**Acceptance Scenarios**:

1. **Given** a student asks the tutor to explain a concept with no prior
   recorded evidence, **When** the tutor responds, **Then** it opens with
   the minimum useful intervention (a retrieval/diagnostic prompt), not a
   complete explanation.
2. **Given** the student engages with the diagnostic step and still
   doesn't produce a correct answer, **When** the conversation continues,
   **Then** the tutor escalates the ladder one step at a time (cue →
   source pointer → explain mechanism → partial worked example → complete
   answer), never skipping straight from step 0 to step 6.
3. **Given** a student explicitly asks for the direct/complete answer at
   any point, **When** the tutor responds, **Then** it gives the complete
   answer immediately, regardless of where the ladder currently sits.

---

### User Story 3 - The tutor calibrates to what the student has actually demonstrated (Priority: P2)

Before responding, the tutor checks the student's real recorded state for
concepts relevant to the question (and the concepts connected to them),
and uses that to decide how to respond — for example, not re-teaching a
concept the student has already demonstrated solid understanding of, and
being aware when a prerequisite is still unverified.

**Why this priority**: Builds directly on learner-graph-evidence's real,
evidence-backed state (Phase 3's other half) — without this, the tutor
would either re-teach material the student has already mastered or
assume mastery of prerequisites that were never actually verified.

**Independent Test**: With one concept's state already at "solid" from
recorded evidence and a related concept still "unverified," ask the tutor
about both in the same conversation; confirm its response visibly treats
them differently (e.g., doesn't restart from-scratch explanation for the
solid concept) and never states a stronger state than what's actually
recorded.

**Acceptance Scenarios**:

1. **Given** a concept the student has real "solid" evidence for,
   **When** the student asks about it, **Then** the tutor's response
   reflects that existing understanding rather than re-teaching it from
   the beginning as if nothing were known.
2. **Given** a concept with no recorded evidence at all, **When** the
   tutor considers it, **Then** it treats it as genuinely unverified, not
   as an assumed baseline of "weak" or any other earned-sounding state.
3. **Given** a question that touches a concept's neighboring
   concepts/relationships, **When** the tutor responds, **Then** it can
   reference the real relationship structure (e.g., a prerequisite that's
   still unverified) rather than treating the concept in isolation.

---

### User Story 4 - The conversation itself produces real, auditable evidence (Priority: P2)

When a student demonstrates something during the conversation — retrieves
something correctly with no help, or gives a confident but incorrect
answer more than once — the tutor records that as a real evidence event
through the same validated evidence-commit mechanism used everywhere else
in the product. The tutor itself never directly changes a mastery score,
evidence tally, or misconception flag.

**Why this priority**: This is what makes the tutor a real evidence
source rather than a black box — every one of its effects on learner
state must be traceable to something that actually happened, same
guarantee the product makes everywhere else (Constitution Principle II).
Depends on Stories 1-2 existing (there must be a conversation to draw
evidence from) and on the state calibration in Story 3 to know what's
already recorded.

**Independent Test**: Have a conversation where the student answers a
retrieval-style question correctly unprompted, and separately one where
the student confidently gives the same wrong answer twice; confirm both
produce a real evidence record (not a direct mastery change) and that
reading the student's state back afterward reflects it.

**Acceptance Scenarios**:

1. **Given** a student answers a diagnostic/retrieval prompt correctly
   without help, **When** the tutor recognizes this, **Then** it records
   a real evidence event of the appropriate type and confidence — it does
   not change any mastery/state value directly.
2. **Given** a student gives a confident, incorrect, independent answer
   to the same concept twice in one conversation, **When** the tutor
   recognizes the pattern, **Then** it records misconception-candidate
   evidence through the same validated evidence-commit mechanism, and the
   student's state afterward shows the resulting signal.
3. **Given** a note upload, mention, or passive exposure to a concept
   during the conversation (not an independent demonstration), **When**
   the tutor records anything from it, **Then** it is recorded at
   exposure-level confidence, never as retrieval/application-tier
   evidence.

---

### Edge Cases

- What happens when the tutor cannot ground a claim in any real course
  material or recorded state? It must say so plainly, never present an
  invented answer or an invented state as if real.
- What happens when a student refuses to engage with a diagnostic
  question (goes silent, changes the subject, repeats "I don't know")?
  The ladder must still be able to escalate rather than stall
  indefinitely waiting for an answer that never comes.
- What happens if `get_concept_state`/`get_concept_neighbors` return the
  no-evidence-yet baseline? The tutor must treat that as genuinely
  unverified, not silently assume any stronger state.
- What happens when a student's question spans concepts across more than
  one course? Out of scope for this feature — a conversation is scoped
  to one course, same as every other feature in this product today.
- What happens if the same confident-incorrect pattern recorded by the
  tutor conflicts with a much stronger, older piece of graded evidence?
  Resolution is entirely the existing `computeLearnerState` algorithm's
  job (learner-graph-evidence) — this feature only ever commits evidence
  through that mechanism, it never resolves conflicts itself.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The tutor MUST answer a student's question grounded in that
  course's confirmed concepts, confirmed relationships, and uploaded
  artifacts, with substantive claims traceable to specific source
  material.
- **FR-002**: The tutor MUST clearly indicate when it cannot ground an
  answer in real course material, rather than presenting an ungrounded
  answer as if it were sourced from the course.
- **FR-003**: The tutor MUST decline to answer questions unrelated to the
  student's course as if they were course content.
- **FR-004**: The tutor MUST open help for an unverified concept with the
  minimum useful intervention (a retrieval or diagnostic prompt), per the
  PRD's seven-step assistance ladder, before offering a full explanation.
- **FR-005**: The tutor MUST escalate the assistance ladder one step at a
  time as a student continues to struggle, never skipping directly from
  the lowest to the highest intervention.
- **FR-006**: A student MUST be able to request a direct, complete
  explanation at any point in the conversation and receive one
  immediately, regardless of the ladder's current position.
- **FR-007**: Before responding about a concept or relationship, the
  tutor MUST check that target's real recorded learner state (and, when
  relevant, its neighboring concepts/relationships) rather than assuming
  a state.
- **FR-008**: The tutor MUST treat a concept/relationship with no
  recorded evidence as genuinely unverified, never as an assumed
  intermediate state.
- **FR-009**: When a student demonstrates independent, correct retrieval
  or application during the conversation, the tutor MUST record that as
  evidence through the existing validated evidence-commit mechanism.
- **FR-010**: When a student gives two or more confident, incorrect,
  independent responses to the same concept within a conversation, the
  tutor MUST record misconception-candidate evidence through the same
  validated evidence-commit mechanism.
- **FR-011**: Passive exposure during a conversation (a mention, a note
  upload reference, an unprompted statement with no independent
  demonstration) MUST be recorded at exposure-level confidence, never at
  retrieval/application/transfer-tier confidence.
- **FR-012**: The tutor MUST NOT directly write or modify any mastery
  score, evidence tally, or misconception flag — every learner-state
  effect of a conversation MUST go through the existing validated
  evidence-commit mechanism.
- **FR-013**: A conversation MUST be handled by exactly one primary tutor
  agent — this feature MUST NOT introduce a multi-agent hand-off
  architecture.
- **FR-014**: This feature's tool surface MUST NOT include
  assessment-generation or grading capabilities (creating assessment
  blueprints, rendering graphs/trees for assessment purposes, running
  code checkers, or structured-response grading) — those are a later
  feature's responsibility.
- **FR-015**: Every evidence event this feature commits MUST record which
  conversation (and turn within it) produced it, so a student's evidence
  history remains traceable back to what was actually said.

### Key Entities

- **Tutor Conversation**: One ongoing dialogue between a student and the
  tutor, scoped to a single course.
- **Conversation Turn**: One message exchange within a conversation;
  evidence committed during a conversation references the specific turn
  that produced it (existing `evidence_events.conversation_turn_id`,
  currently un-backed by a real table — this feature is what gives it
  one).
- **Tool Call**: One invocation of a tutor capability (course-material
  search, learner-state lookup, evidence recording) during a turn —
  useful for tracing why the tutor responded the way it did.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a question the course material actually covers, a
  student can identify which real course content the tutor's answer came
  from, for 100% of substantive claims made.
- **SC-002**: A student never receives a full explanation of an
  unverified concept as the tutor's first response — the ladder always
  opens at the minimum useful intervention.
- **SC-003**: A student can always reach a complete, direct explanation
  within their very next message, regardless of where the assistance
  ladder currently sits.
- **SC-004**: 100% of learner-state changes produced by a conversation
  are traceable to a real, committed evidence event referencing that
  conversation and turn — zero direct writes to mastery-bearing state
  from conversation-handling code.
- **SC-005**: A concept the student has real "solid" evidence for is
  never re-explained from scratch as if nothing were known, across
  repeated questions about it in the same conversation.
- **SC-006**: Two confident, incorrect, independent responses to the same
  concept in one conversation produce a visible misconception signal
  without requiring a separate assessment session.
- **SC-007**: Interactive responses begin (first token/visible reply)
  within 3 seconds for the common case where no long-running background
  process is required.

## Assumptions

- One conversation is scoped to exactly one course, matching every other
  feature in this product today (no cross-course tutoring in this
  feature's scope).
- "Student" and course owner remain the same account for now, matching
  every other Phase 0-3 feature's current scope — no separate
  enrollment/multi-student model exists yet.
- The assistance ladder's default aggressiveness gives one
  retrieval/diagnostic attempt when a concept already has some prior
  exposure recorded, consistent with the PRD's existing productive-friction
  decision; this default is a tunable product parameter, not a fixed
  rule, matching how `learner-graph-evidence`'s own weights are treated.
- The tool surface this feature ships (course-material search,
  learner-state lookup, evidence recording) is deliberately the initial
  subset the PRD's full tool list describes — assessment/grading/
  visualization tools are a later feature's scope, not omitted by
  oversight.
- This feature reuses `learner-graph-evidence`'s existing
  `commitEvidence`/`getConceptState`/`getEdgeState` actions as its only
  path to learner-state effects; it does not introduce a second,
  parallel evidence-writing mechanism.
