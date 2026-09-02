# Feature Specification: Exam Planner

**Feature Branch**: `010-exam-planner`

**Created**: 2026-09-01

**Status**: Draft

**Input**: User description: "exam-planner: Phase 5's exam-prep half (PRD section 18.3, roadmap row 5). Given an exam date/scope configuration (which units/concepts are in scope) and a student's available time budget, generate a staged exam-prep plan that ramps intensity over the remaining time: early sessions focus on diagnostic retrieval and gap discovery, middle sessions on interleaving and relationship practice, late sessions on timed course-style transfer/mixed sets, and the final stretch on high-value weaknesses rather than indiscriminate cramming. An LLM may draft session composition/wording, but which concepts/questions are actually selected must come from deterministic learner/course state (same discipline review-scheduler already established for daily/weekly sessions). Also add an exam-readiness dashboard showing where the student stands against the exam's scope. Builds on review-scheduler's already-built review-priority ranking and session-generation machinery (composeDailySession-style functions, question_bank as the sole content source) rather than reimplementing scheduling from scratch."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configure an exam and get a staged prep plan (Priority: P1)

A student has an exam coming up. They tell the system when it is and what's in scope (which units or concepts will be tested), and get back a plan that spans the remaining time -- not just "here's everything," but a plan that starts with figuring out what they actually don't know yet, moves into practicing how concepts connect to each other, ramps into timed, mixed, exam-style practice, and spends the final stretch on their real remaining weak spots.

**Why this priority**: This is the feature's entire reason to exist -- PRD's own framing (18.3) is specifically that a good exam plan ramps intensity over time rather than being an undifferentiated pile of review, and without this, there's no "planner," just another review list.

**Independent Test**: Configure an exam with a real date and a scope of real confirmed course concepts; confirm the system returns a plan divided into stages spanning from today to the exam date, each stage with a distinct focus, and confirm the plan's concepts/questions all come from real, validated course content.

**Acceptance Scenarios**:

1. **Given** a student configures an exam 20 days out covering a set of real, confirmed concepts, **When** the plan is generated, **Then** it returns stages covering the full remaining time, ordered from today toward the exam date, each labeled with its focus (diagnostic, interleaving/relationships, timed mixed practice, final high-value review).
2. **Given** the student's overall gaps and weak concepts are known from their existing evidence, **When** the early diagnostic stage is generated, **Then** it prioritizes concepts within the exam's scope the student has the least/oldest evidence for, not a generic tour of the whole scope.
3. **Given** the exam is very close (e.g. tomorrow), **When** the plan is generated, **Then** it still produces a plan, compressed into whichever stages meaningfully fit the remaining time, rather than refusing to plan or fabricating stages that can't realistically happen.
4. **Given** part of the exam's configured scope has no validated practice content available at all, **When** the plan is generated, **Then** that gap is stated honestly in the plan, never silently dropped or papered over with unrelated content.

---

### User Story 2 - See exam readiness at a glance (Priority: P2)

At any point after configuring an exam, a student can check a readiness view showing how they're actually doing against the exam's real scope -- not a vague feeling, but a concrete picture of which concepts are solid, which are shaky, and which haven't been touched at all.

**Why this priority**: A staged plan (User Story 1) tells a student what to do next; a readiness view answers the different, equally real question "how worried should I be right now" -- valuable on its own, but the plan is still useful without it.

**Independent Test**: With an exam already configured and some evidence on the scoped concepts, open the readiness view and confirm it shows a real breakdown of the exam's scope by mastery level, distinctly calling out concepts with an unresolved misconception and concepts with no evidence at all.

**Acceptance Scenarios**:

1. **Given** an exam's scope includes concepts at a mix of real mastery levels, **When** the student opens the readiness view, **Then** they see the scope broken down by real mastery state, not a single vague percentage with nothing behind it.
2. **Given** a scoped concept has an unresolved misconception flag, **When** the readiness view is shown, **Then** that concept is called out distinctly, not buried at the same visibility as an ordinary weak concept.
3. **Given** a scoped concept has no evidence at all yet, **When** the readiness view is shown, **Then** it's shown as untouched, not conflated with "weak" (a concept never attempted is a different situation from one attempted and found wanting).

---

### User Story 3 - The plan and readiness stay current as time passes and evidence changes (Priority: P3)

A student doesn't just get a plan once and never look again -- as they actually practice (moving evidence), and as days pass (moving the plan's remaining stages), both the plan and the readiness view reflect the real, current state, not a stale snapshot from when the exam was first configured.

**Why this priority**: Without this, User Story 1's plan is a one-time artifact that goes stale the moment reality diverges from it -- true value requires the plan to still be honest a week later, but the initial plan (User Story 1) already delivers real value on day one even before this refinement.

**Independent Test**: Configure an exam, generate a plan, then commit new evidence on one of its scoped concepts and let a day pass; re-request the plan and readiness view and confirm both reflect the change (the concept's readiness improves or worsens for real, and the plan's current stage reflects today's actual position relative to the exam date), without needing to reconfigure the exam.

**Acceptance Scenarios**:

1. **Given** a student has practiced a scoped concept since the plan was last generated, **When** they re-request the plan or readiness view, **Then** the new evidence is reflected -- never a plan silently frozen at its original generation moment.
2. **Given** several days have passed since the exam was configured, **When** the plan is re-requested, **Then** the stage boundaries reflect today's real remaining time before the exam, not the original day-one countdown.
3. **Given** the exam date has already passed, **When** the plan or readiness view is requested, **Then** the system says so plainly rather than returning a plan for time that no longer exists.

---

### Edge Cases

- What happens when a student configures an exam with a scope that includes a concept/unit id that doesn't exist or isn't confirmed? The configuration is rejected before anything is generated, the same "resolve to a real row before writing anything" discipline the rest of this product already uses.
- What happens when two exams are configured with overlapping scope? Each exam's plan and readiness are computed independently against the same underlying evidence -- there's no shared, mutable "exam state" for them to conflict over.
- What happens when a student has zero evidence on the entire exam scope (a brand-new topic)? The plan still generates, starting entirely in the diagnostic stage, and readiness shows every scoped concept as untouched, not an error.
- What happens when the configured time budget is larger than what the remaining days could realistically absorb? The plan still fits within the real number of days remaining; it doesn't invent additional days.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST let a student configure an exam with a real date and a scope (a set of concepts and/or units), rejecting the configuration before generating anything when the scope references a concept/unit that doesn't exist or isn't confirmed.
- **FR-002**: System MUST generate a staged plan spanning from today to the configured exam date, divided into stages with distinct focuses: an early diagnostic/gap-discovery stage, a middle interleaving/relationship-practice stage, a late timed-mixed-practice stage, and a final high-value-weakness stage.
- **FR-003**: Stage boundaries and how much of the remaining time each stage gets MUST be computed deterministically from the real number of days remaining, never invented or estimated by an LLM.
- **FR-004**: Which concepts and questions appear in any stage MUST be selected by deterministic learner/course state (the same review-priority ranking and validated question-bank content already established), reusing that existing mechanism rather than a second, parallel selection method.
- **FR-005**: An LLM MAY be used to draft a stage's session wording/composition (e.g. framing, ordering presentation), but MUST NOT be the thing deciding which concepts or questions are actually included.
- **FR-006**: System MUST still produce a usable, honestly-labeled plan when the exam is very close (too little remaining time for every stage to appear in full) -- never refuse to plan and never fabricate stages that can't fit.
- **FR-007**: System MUST state plainly, within the plan itself, when part of the exam's configured scope has no validated practice content available -- never silently omitted or padded with unrelated content.
- **FR-008**: System MUST provide a readiness view showing the exam's scope broken down by real mastery state (not a single undifferentiated score), distinctly calling out concepts with an unresolved misconception and concepts with no evidence at all.
- **FR-009**: Both the staged plan and the readiness view MUST be computed fresh from current evidence and the current date every time they're requested -- never a cached snapshot from when the exam was first configured.
- **FR-010**: When an exam's date has already passed, requesting its plan or readiness MUST say so plainly rather than returning a plan for time that no longer exists.
- **FR-011**: This feature MUST reuse the existing review-priority ranking and question-bank-backed session content mechanism (review-scheduler) for concept/question selection -- it MUST NOT reimplement a second scheduling or content-selection mechanism.
- **FR-012**: Completing a practice item generated by this feature MUST go through the existing evidence-commit and grading pipeline already used elsewhere in the product -- this feature MUST NOT introduce a second, parallel way of recording whether an answer was correct.

### Key Entities

- **Exam Configuration**: A student's real exam date and scope (concepts/units in scope), the input the rest of this feature is computed against.
- **Staged Exam Plan**: A time-ordered sequence of stages between today and the exam date, each with a distinct focus and its own selected concepts/questions, recomputed fresh on every request, never a stored snapshot.
- **Readiness Snapshot**: A real-time breakdown of the exam's scope by mastery state, unresolved-misconception concepts, and untouched concepts -- a view over existing learner state, not new state of its own.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A student can configure a real exam and receive a complete, staged plan spanning the remaining time in a single request.
- **SC-002**: Every concept or question appearing anywhere in a plan or readiness view is traceable to real, existing course/learner state -- zero fabricated stages, concepts, or readiness figures.
- **SC-003**: A concept with an unresolved misconception within an exam's scope is never displayed at the same visibility as an ordinary weak concept in the readiness view -- it is always distinctly identifiable.
- **SC-004**: Re-requesting a plan or readiness view after new evidence has been committed reflects that evidence every time, with no manual refresh/reconfiguration step required.
- **SC-005**: An exam configured with unrealistically little remaining time still produces a plan that fits the real number of days left, never a plan claiming more time exists than actually does.

## Assumptions

- This feature is a consumer of `review-scheduler`'s review-priority ranking and `assessment-generation-pipeline`'s validated `question_bank` -- it does not introduce a second content-generation or ranking mechanism; a validated question is still required for a concept to be practiced, same as the daily/weekly sessions.
- Completing a plan's practice item reuses the product's existing grading/evidence-commit pipeline (`deterministic-grading`) end to end, same as `review-scheduler`.
- "Scope" is a set of concept and/or unit ids the student selects when configuring the exam; a unit in scope is treated as shorthand for all of that unit's confirmed concepts.
- The four named stages (diagnostic, interleaving, timed-mixed, final-weakness) are the fixed stage shape this feature produces; how much of the remaining time each stage occupies is a tunable, documented allocation, not a fixed absolute duration.
- A student may configure more than one exam at a time (e.g. two different courses); each is independent, with no shared state between them beyond both reading the same underlying evidence.
- "Timed" mixed practice in the late stage refers to the session being presented as time-boxed practice; this feature does not require a new timing/proctoring mechanism -- the same untimed question-bank content is reused, just composed and framed as a timed set.
