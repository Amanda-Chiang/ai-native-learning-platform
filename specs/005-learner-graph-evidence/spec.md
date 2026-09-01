# Feature Specification: Learner Graph Evidence

**Feature Branch**: `005-learner-graph-evidence`

**Created**: 2026-09-01

**Status**: Draft

**Input**: User description: "learner-graph-evidence: Phase 3 (evidence half) of docs/implementation-roadmap.md, the first of two Spec Kit features under Phase 3 (learner-graph-evidence, tutor-agent) -- built first since tutor-agent's tool surface (record_exposure, get_concept_state, commit_evidence, etc., PRD S14.2) calls into this feature's validated evidence pipeline, not the other way around. Adds learner_concept_state, learner_edge_state, and evidence_events persistence (evidence_events' shape already exists as the EvidenceEvent domain type from course-domain-schemas) plus the interpretable weighted-evidence algorithm from PRD S10.4 that turns an appended EvidenceEvent into an updated learner_concept_state/learner_edge_state dimension -- exposure evidence alone must never raise mastery past "exposed" (Constitution Principle III), and no code path may write learner state directly without a corresponding evidence_events row (Constitution Principle II, non-negotiable). Also wires concept-atlas-renderer's rendered mastery/relationship state and evidence provenance to this real per-learner data for the first time, replacing course-graph-ingestion's ingestion-time baseline placeholder (masteryState always "unverified"). Does not include the tutor agent's conversational loop, chat UI, or its other tools (search_course_materials, assessment blueprint creation, code/graph checkers) -- those are tutor-agent's job, built after this one exists to call into."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Independent evidence moves a student's understanding forward (Priority: P1)

A student independently and correctly retrieves, applies, or transfers a
concept (e.g. answers a practice question without hints). The system
records this as evidence and the student's tracked understanding of that
concept — and any relationship it's connected through — visibly
strengthens as a result.

**Why this priority**: This is the mechanism everything else in this
feature depends on. Without it, there is no learner state to read,
render, or explain — it's the MVP.

**Independent Test**: Commit one strong, independent, correct piece of
evidence for a concept with no prior evidence; confirm the concept's
tracked state moves up from its starting point and that reading the
concept's current state back reflects the change immediately.

**Acceptance Scenarios**:

1. **Given** a concept with no prior evidence, **When** the student
   independently and correctly retrieves it (no hints, no assistance),
   **Then** the concept's tracked state moves to at least a "retrieved
   independently" tier, and that change is queryable immediately after.
2. **Given** a concept already at a "retrieved independently" tier,
   **When** the student correctly applies it in a novel context, **Then**
   the tracked state strengthens further rather than staying flat or
   resetting.
3. **Given** a relationship between two concepts, **When** the student
   provides evidence that specifically demonstrates understanding of
   *how the two connect* (not just each concept individually), **Then**
   that relationship's own tracked state changes independently of either
   endpoint concept's state.

---

### User Story 2 - Exposure alone never fabricates mastery (Priority: P1)

A student uploads notes, has a conversation about a concept, or views an
AI-generated explanation — all without independently producing or
demonstrating anything themselves. The system records this as low-
confidence exposure evidence and does not let it, by itself or repeated
many times, make the concept look mastered.

**Why this priority**: This is the product's core trust guarantee
(Constitution Principle III) — get it wrong and the atlas becomes exactly
the illusion-of-mastery problem the product exists to prevent. Ships
alongside User Story 1 since it's really the same mechanism's other,
equally load-bearing half.

**Independent Test**: Record only exposure-tier evidence for a concept —
repeatedly, across many separate events — and confirm its tracked state
never crosses out of the "exposed" tier no matter how many exposure
events accumulate.

**Acceptance Scenarios**:

1. **Given** a concept with no prior evidence, **When** the student views
   an AI explanation of it, **Then** the concept's tracked state moves to
   "exposed" at most, never higher.
2. **Given** a concept already at "exposed" from one exposure event,
   **When** ten more exposure-only events are recorded for the same
   concept, **Then** the tracked state still does not exceed "exposed."
3. **Given** a concept currently at a stronger tier from genuine
   independent evidence, **When** a new exposure-only event is recorded,
   **Then** the existing stronger state is not downgraded by the mere
   exposure event (exposure adds no information beyond what's already
   demonstrated — it doesn't erase demonstrated evidence either).

---

### User Story 3 - The concept atlas shows what a student has actually demonstrated (Priority: P2)

A student opens their course's concept atlas. Instead of every concept
and relationship showing the same generic "not yet verified" appearance
regardless of what the student has actually done, the map reflects their
real, evidence-backed progress.

**Why this priority**: This is where the evidence mechanism (US1/US2)
becomes visible and useful to the actual student, not just a database
change nobody sees. Depends on US1/US2 already producing real state to
render.

**Independent Test**: With evidence already recorded strengthening one
concept and weakening/leaving another untouched, open the atlas and
confirm the two concepts render with visibly different, correct states —
not the same placeholder appearance.

**Acceptance Scenarios**:

1. **Given** a concept with strong independent evidence recorded,
   **When** the student views the atlas, **Then** that concept renders at
   its real, current tier, not the generic ingestion-time placeholder.
2. **Given** a concept with no evidence at all yet, **When** the student
   views the atlas, **Then** it renders at the same neutral "not yet
   verified" state as before — a legitimate absence of evidence, not a
   bug, and not confused with a concept that has weak evidence.
3. **Given** a relationship with evidence showing the student struggles
   to connect two otherwise-understood concepts, **When** the student
   views the atlas, **Then** that relationship renders distinctly weak
   even though both endpoint concepts individually render strong.

---

### User Story 4 - A student can see why a concept is rated the way it is (Priority: P2)

A student clicks a concept or relationship in the atlas and, alongside
its current state, sees what evidence actually produced that state — not
just a bare label with no explanation.

**Why this priority**: A state a student can't trace back to something
real is no more trustworthy than no state at all — this is what makes
the evidence mechanism legible rather than a black box. Depends on US1
(there must be real evidence to show) and reuses US3's rendering surface.

**Independent Test**: Open the detail view for a concept with recorded
evidence and confirm at least the most recent contributing evidence
(what happened, when, and its type) is visible; open the detail view for
a concept with no evidence and confirm it says so plainly rather than
showing nothing or a misleading blank state.

**Acceptance Scenarios**:

1. **Given** a concept with two independent pieces of evidence recorded
   at different times, **When** the student opens its detail view,
   **Then** they can see at least the most recent contributing evidence's
   type and when it happened.
2. **Given** a concept with no evidence yet, **When** the student opens
   its detail view, **Then** it says plainly that no evidence has been
   recorded yet, not a fabricated-sounding explanation.

---

### User Story 5 - Repeated confident wrong answers surface as a misconception, not silence (Priority: P3)

A student answers confidently and incorrectly about the same concept more
than once. Rather than this being ignored or just quietly lowering a
score, it's surfaced as a distinct, visible signal that something
specific is being misunderstood.

**Why this priority**: Valuable and directly named in the product's
design (PRD's evidence-tier model includes a dedicated misconception
signal), but the product is still useful without it while US1-US4 exist —
correctly tracking positive evidence matters more than flagging negative
patterns.

**Independent Test**: Record two or more confident, incorrect responses
for the same concept and confirm it now carries a distinct "unresolved
misconception" signal, separate from and visible alongside its ordinary
mastery tier.

**Acceptance Scenarios**:

1. **Given** a concept with one confident incorrect response recorded,
   **When** a second confident incorrect response on the same concept is
   recorded, **Then** the concept is marked with an unresolved
   misconception signal.
2. **Given** a concept marked with an unresolved misconception signal,
   **When** the student subsequently provides strong correct independent
   evidence for that same concept, **Then** the misconception signal is
   resolved rather than staying stuck alongside now-contradicting
   evidence.
3. **Given** a concept with a single incorrect response (not confident,
   or not yet repeated), **When** evaluated, **Then** it does not yet
   carry the misconception signal — a single wrong answer is not treated
   the same as a demonstrated pattern.

---

### Edge Cases

- What happens when evidence is recorded for a concept or relationship
  that doesn't exist (a dangling reference)? The system must reject it
  rather than silently creating orphaned state.
- What happens when two pieces of evidence for the same concept arrive
  with contradictory signals close together (e.g. a correct independent
  retrieval immediately followed by a confident wrong answer)? Both are
  recorded as real, separate evidence — the algorithm's job is to weigh
  them, not to let the system silently discard either one.
- What happens when a student's very first interaction with a concept is
  strong, independent, and correct (no prior exposure at all)? Mastery
  can still be recorded from that evidence alone — exposure isn't a
  required precondition, only a insufficient one on its own.
- What happens when the concept atlas is viewed for a course the student
  has no evidence in at all yet (a brand new student)? It must render
  using the same baseline states `course-graph-ingestion` already
  produces for a course with no evidence — not an error, and not
  fabricated progress.
- What happens if evidence-recording and state-reading happen for
  different students on the same shared concept? Each student's tracked
  state must be entirely their own — one student's evidence must never
  affect what another student sees for the same concept.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST record every piece of evidence about a
  student's understanding as its own immutable record before any tracked
  learner state changes — no code path may write tracked concept or
  relationship state without a corresponding evidence record produced
  first (Constitution Principle II, non-negotiable).
- **FR-002**: Evidence records MUST be append-only — the system MUST
  provide no way to edit or delete a previously recorded piece of
  evidence, including for evidence later found to be wrong (a
  correction is new evidence, not a rewrite of history).
- **FR-003**: Exposure-tier evidence (viewing an explanation, uploading
  notes, passive conversation) MUST NOT, alone or accumulated in any
  quantity, raise a concept's or relationship's tracked state above the
  "exposed" tier.
- **FR-004**: Only independent retrieval, application, transfer, or
  otherwise validated performance evidence MAY raise a concept's or
  relationship's tracked state into a tier stronger than "exposed."
- **FR-005**: The system MUST track a relationship's own state
  independently of either of its two endpoint concepts' individual
  states — a student can understand two concepts individually while the
  connection between them remains weak, and vice versa.
- **FR-006**: Every factor that contributed to a computed state change
  (evidence strength, how recent it is, whether it was independent,
  grading/confidence in the evidence itself, and its difficulty) MUST be
  recorded alongside the resulting state, not discarded after the
  computation — future recalibration of the algorithm's weights depends
  on this history existing, and the current weights are explicitly
  starting parameters, not fixed truths.
- **FR-007**: The system MUST reject evidence submitted for a concept or
  relationship that does not exist, rather than creating tracked state
  for a dangling reference.
- **FR-008**: Each student's tracked concept/relationship state MUST be
  isolated from every other student's — reading or writing one student's
  state must never be affected by or visible to another student.
- **FR-009**: The system MUST provide a way to read a student's current
  tracked state for a concept or relationship, including enough of the
  contributing evidence to explain *why* it's at that state (at minimum,
  the most recent contributing evidence's type and timing).
- **FR-010**: When a concept or relationship has no evidence recorded yet
  for a given student, reading its state MUST return the same baseline
  ("unverified" concept state / "strong," i.e. not-yet-flagged-weak,
  relationship state) that `course-graph-ingestion` already established
  as the correct representation of "nothing demonstrated yet" — this
  feature does not introduce a second, different way of representing
  absence of evidence.
- **FR-011**: Two or more confident, incorrect, independent responses
  about the same concept MUST produce a distinct "unresolved
  misconception" signal, visible separately from the concept's ordinary
  mastery tier, not merely folded into a lower mastery number with no
  other trace.
- **FR-012**: A subsequent strong, correct, independent piece of evidence
  for a concept carrying an unresolved misconception signal MUST resolve
  that signal, rather than leaving it permanently stuck once triggered.
- **FR-013**: The concept atlas's rendered mastery and relationship
  states MUST reflect each viewing student's own real tracked state
  (via FR-009) once evidence exists, replacing the ingestion-time
  baseline placeholder for exactly the concepts/relationships that have
  evidence — concepts/relationships with no evidence still render at the
  FR-010 baseline, correctly, not as a regression.
- **FR-014**: The concept/relationship detail view MUST surface evidence
  provenance (FR-009's explanation) when evidence exists, and MUST state
  plainly that no evidence exists yet when it doesn't — never a
  fabricated-sounding explanation standing in for genuine absence of
  data.

### Key Entities

- **EvidenceEvent** *(already defined, `src/types/domain/evidence-event.ts`)*:
  An immutable record of one thing a student did bearing on their
  understanding. This feature is what actually persists and acts on
  instances of this type for the first time — it does not redefine it.
- **Learner Concept State**: One student's current tracked understanding
  of one concept in one course — current mastery tier, the components
  that most recently contributed to it (FR-006), and whether an
  unresolved misconception signal is active (FR-011). New to this
  feature.
- **Learner Relationship State**: The same as Learner Concept State, but
  for one student's understanding of one specific relationship between
  two concepts, tracked independently of either endpoint (FR-005). New
  to this feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A student who provides only exposure-tier evidence for any
  number of concepts never sees any of them rendered above "exposed,"
  verified automatically across at least 50 simulated exposure-only
  events without a single violation.
- **SC-002**: A student who independently and correctly retrieves a
  concept for the first time sees that concept's tracked state move
  above "exposed" without requiring any additional exposure evidence
  first.
- **SC-003**: 100% of learner concept/relationship state records that
  exist can be traced back to at least one real evidence record — zero
  state exists with no evidence behind it, checked automatically.
- **SC-004**: A student opening a concept's detail view after evidence
  has been recorded can identify what evidence produced its current
  state without needing to ask anyone or guess.
- **SC-005**: Two independent students working through the same shared
  course concept end up with completely independent tracked states —
  verified by confirming one student's evidence never changes what a
  second student sees for the same concept.
- **SC-006**: A student who gives two confident wrong answers on the same
  concept sees a distinct misconception signal within the same session,
  not only reflected as a generically lower score they'd have to infer
  the reason for themselves.

## Assumptions

- "Two or more" confident incorrect responses (FR-011, SC-006) is a
  concrete, testable starting threshold, not a calibrated psychological
  finding — same status as the weighted-evidence algorithm's other
  weights (PRD §10.4: "exact weights are product parameters, not
  psychological truths, log all components so later usage data can
  support calibration"). Expected to be tunable later, not treated as
  fixed.
- "Confident" (as in "confident incorrect response," FR-011) refers to
  the `studentConfidence` field already present on `EvidenceEvent` — this
  feature defines the specific threshold/comparison used against it as a
  planning-phase detail, not a product-level ambiguity to resolve here.
- The exact numeric weights in the weighted-evidence algorithm (PRD
  §10.4) are explicitly not fixed by this spec — per the PRD's own
  instruction, they are logged, inspectable starting parameters (FR-006),
  not something this document pins to specific numbers it has no
  calibration data to justify.
- This feature does not build the tutor agent's conversational loop,
  chat UI, or its tool-calling surface (`search_course_materials`,
  assessment blueprint creation, code/graph checkers) — per
  `docs/implementation-roadmap.md`'s Phase 3 split, that is the separate
  `tutor-agent` feature, built after this one so it has a real,
  validated evidence pipeline to call into rather than mutating state
  directly.
- This feature does not build assessment generation, grading, or the
  review/spaced-repetition scheduler — those are Phases 4-5, downstream
  consumers of the state this feature produces, not part of producing it.
- "Independent" evidence (FR-004) means evidence not itself derived from
  exposure in the same interaction (e.g. a student who was just shown the
  answer and immediately repeats it back is not independent retrieval) —
  the exact detection mechanism for this is a planning-phase decision;
  this spec only fixes the required outcome.
