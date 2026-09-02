# Feature Specification: Review Scheduler

**Feature Branch**: `009-review-scheduler`

**Created**: 2026-09-01

**Status**: Draft

**Input**: User description: "review-scheduler: Phase 5's adaptive review half (PRD section 18.1-18.2, roadmap row 5). Deterministic review-priority function combining forgetting_risk * course_importance * evidence_gap * prerequisite_centrality * upcoming_exam_weight * unresolved_confusion_weight; spaced review dates per concept; a daily review session generator bounded by a configurable time budget (default 5-10 min), pulling questions from assessment-generation-pipeline's question_bank; and a weekly \"Connect\" session prioritizing new concepts introduced this week, weak edges linking new to older material, low-connectivity \"knowledge islands\", and contrasts between commonly confused concepts. exam-planner (PRD 18.3, exam date/scope config, staged exam-plan generation, readiness dashboard) is a separate, later feature -- out of scope here, but review-scheduler's priority function and session-generation machinery are what it will build on."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A short, prioritized daily review session (Priority: P1)

A student opens the app on an ordinary day (no exam looming) and wants to know what's worth practicing right now, without having to decide for themselves which of dozens of concepts to revisit. They get a short session, bounded by a time budget, made up of real practice questions targeting the concepts most worth reinforcing today -- and for each item, a plain-language reason it was chosen.

**Why this priority**: This is the feature's entire reason to exist -- PRD's stated exit criterion is "the system can answer 'what should I study for 30 minutes today, and why?'". Without this, nothing else in the feature has a reason to exist.

**Independent Test**: With a course that has some concepts already reviewed (varying recency/confidence) and some validated practice questions available, request today's review session and confirm it returns a bounded set of items, each traceable to a real concept and a real question, each carrying a stated reason, and that the whole session fits within the configured time budget.

**Acceptance Scenarios**:

1. **Given** a student with several concepts at varying review recency and mastery levels, **When** they request today's review session, **Then** they receive a session made of real, previously-validated practice questions, ordered so the highest-priority concepts (per the review-priority ranking) appear first, each item labeled with a plain-language reason (e.g. "it's been a while since you practiced this", "this one's tripped you up before").
2. **Given** a student whose selected time budget is smaller than the number of concepts genuinely due for review, **When** the session is generated, **Then** only the highest-priority items are included, and the student can see that more review is available beyond today's session.
3. **Given** a concept the student has an unresolved, flagged misconception on, **When** today's review session is generated, **Then** that concept is prioritized above an equally-overdue concept with no known misconception.
4. **Given** no course concept currently has any validated practice question available, **When** the student requests today's review session, **Then** they see an honest explanation that no review content exists yet, never a session silently padded with placeholder or repeated content.

---

### User Story 2 - Practicing a concept changes when it resurfaces (Priority: P2)

A student completes a review item. Whether they got it right, wrong, or needed a hint changes how soon that concept comes back around -- confidently correct answers push the concept further out; a wrong or unresolved answer brings it back sooner, not later.

**Why this priority**: Without this, "daily review" degenerates into either the same items every day forever, or an arbitrary rotation disconnected from actual performance -- the whole point of spaced review is that the schedule responds to real evidence of forgetting and mastery.

**Independent Test**: Have a student answer one review question correctly and, separately, another incorrectly; confirm the correctly-answered concept's next scheduled review date moves further into the future than the incorrectly-answered concept's, and that both changes are visible without needing to look at the underlying evidence log directly.

**Acceptance Scenarios**:

1. **Given** a student answers a review question about a concept correctly and independently (no hints used), **When** the schedule is next computed, **Then** that concept's next review date is pushed further out than it would be for a similarly-timed but incorrect answer.
2. **Given** a student answers a review question incorrectly, **When** the schedule is next computed, **Then** that concept's next review date moves closer (it becomes eligible to reappear sooner than an unrelated, correctly-mastered concept).
3. **Given** a concept has never been reviewed before, **When** the schedule is first computed for it, **Then** it is treated as immediately due, not silently skipped for lack of history.

---

### User Story 3 - A weekly session that connects new material to the bigger picture (Priority: P3)

Once a week, a student gets a longer session that isn't just "what's overdue" but "what ties this week's material into what you already know" -- new concepts from this week, connections between new and older material that are still weak, concepts that seem isolated from everything else in the course, and pairs of concepts the student (or others) commonly confuse with each other.

**Why this priority**: This is explicitly the second half of PRD 18.1-18.2's scope and delivers real standalone value (integration, not just repetition), but the daily session (User Story 1) already delivers the feature's core promise on its own -- this extends it rather than being required for the MVP.

**Independent Test**: With a course that has concepts introduced within the last 7 days, at least one weakly-evidenced connection between a new and an older concept, at least one low-connectivity concept, and a known pair of easily-confused concepts, request the weekly session and confirm all four categories of content are represented and each item states which category it came from.

**Acceptance Scenarios**:

1. **Given** concepts were introduced into the course within the last 7 days, **When** the weekly session is generated, **Then** at least one of those new concepts appears in the session.
2. **Given** a relationship between a newly-introduced concept and an older one has little supporting evidence, **When** the weekly session is generated, **Then** that relationship is surfaced as something to practice or reinforce.
3. **Given** a concept has very few relationships evidenced compared to the rest of the course's concepts, **When** the weekly session is generated, **Then** that concept is surfaced as worth connecting to the rest of the course.
4. **Given** two concepts are commonly confused with one another, **When** the weekly session is generated, **Then** a contrast between them appears in the session.

---

### Edge Cases

- What happens when a student has no evidence history at all yet (first day using the product)? Every concept with a validated practice question available is treated as due, ranked by course importance and prerequisite position rather than recency (there's no recency yet).
- What happens when the time budget is set smaller than even one full practice question reasonably takes? The session still returns at least one item rather than an empty session, and communicates that the budget was too small to fit the full ranked list.
- What happens when a concept is due for review but has no validated practice question in the bank yet? That concept is skipped for today's session (never blocks the rest of the session) and is not silently marked as reviewed.
- How does the system behave once exam-planner (a separate, later feature) doesn't exist yet? The priority ranking's exam-related weighting has no real exam context to draw on and must default to a neutral influence, never an invented deadline.
- What happens if a student completes more review items than the session originally offered (asks for "more")? Additional items are drawn from the next-highest-priority concepts not yet included, still respecting the same ranking.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST compute a deterministic review-priority ranking over a student's concepts, combining: how likely the concept is to be forgotten given time since last practiced, how important the concept is to the course, how thin the student's evidence for that concept is, how central the concept is as a prerequisite to other concepts, and whether the concept carries an unresolved misconception flag.
- **FR-002**: System MUST NOT use an LLM's free-form judgment to decide which concepts are due or how they're ranked -- the ranking MUST be produced by the same deterministic factors every time given the same underlying learner/course state (Constitution Principle IV).
- **FR-003**: System MUST maintain a next-review date per concept per student, and MUST update it whenever new evidence for that concept is committed -- never as a value a person or the AI edits directly.
- **FR-004**: A concept with no prior evidence MUST be treated as immediately due, not skipped or deprioritized for lack of history.
- **FR-005**: System MUST generate a daily review session bounded by a configurable time budget (a sensible default between 5 and 10 minutes when the student hasn't set one), composed only of concepts currently due, ordered by the review-priority ranking.
- **FR-006**: Every item in a review session MUST be a real, previously-validated practice question already confirmed for reuse (i.e. drawn from the existing validated question bank), never a question invented on the spot for the session and never a raw source excerpt presented as a question.
- **FR-007**: Every item in a review session MUST carry a human-readable reason referencing the real factor(s) that made it a priority (e.g. recency, unresolved misconception, low evidence) -- never a generic or fabricated justification.
- **FR-008**: When no concept currently has any eligible practice question available, the system MUST tell the student honestly that no review content exists yet, never silently return an empty-feeling or padded session.
- **FR-009**: When a due concept has no eligible practice question available, that concept MUST be excluded from today's session without blocking or degrading the rest of the session, and MUST NOT be recorded as having been reviewed.
- **FR-010**: Completing a review item MUST go through the existing evidence-commit and grading pipeline already used for practice questions elsewhere in the product -- this feature MUST NOT introduce a second, parallel way of recording whether an answer was correct.
- **FR-011**: System MUST generate a weekly "Connect" session that surfaces, distinctly labeled: concepts introduced in the past 7 days, concept-to-concept relationships between new and older material with little supporting evidence, concepts with unusually low connectivity relative to the rest of the course, and pairs of concepts known to be commonly confused with one another.
- **FR-012**: The review-priority ranking's exam-related factor MUST default to a neutral influence when no exam configuration exists yet (exam-planner is out of scope for this feature) -- it MUST NOT fabricate an exam date or scope that was never provided.
- **FR-013**: System MUST allow a student to request additional review items beyond what an initial session offered, continuing to draw from the same priority ranking rather than an arbitrary or random selection.

### Key Entities

- **Review Priority Score**: A per-concept, per-student computed ranking value combining forgetting risk, course importance, evidence thinness, prerequisite centrality, unresolved-misconception status, and (when available) exam relevance -- recomputed from current learner/course state, not stored as a hand-edited number.
- **Concept Review Schedule**: The per-concept, per-student record of when a concept is next due for review, derived from evidence history (recency and correctness of past practice), never edited directly by a person or the AI.
- **Daily Review Session**: A time-bounded, ordered set of validated practice questions targeting a student's currently-due concepts, each item carrying its priority reason.
- **Weekly Connect Session**: A longer, once-a-week set of items distinctly categorized into new concepts, weak new-to-old connections, low-connectivity concepts, and commonly-confused-concept contrasts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A student can get a fully-formed daily review session, with a stated reason for every item, in a single request.
- **SC-002**: Every item a student is asked to practice in a daily or weekly session is traceable to a real, previously-validated question and a real reason -- zero sessions contain a fabricated, placeholder, or unexplained item.
- **SC-003**: A concept a student has an unresolved, flagged misconception on is never absent from a daily session while a validated question for it exists, until that misconception is resolved.
- **SC-004**: Across repeated daily sessions with no new evidence in between, the same overdue concepts are ranked consistently in the same relative order -- the ranking never changes without a real change in underlying evidence.
- **SC-005**: A student who answers a concept's practice question correctly and independently sees that concept's next-due date move further out than a student who answered incorrectly, every time, with no exceptions.
- **SC-006**: A weekly Connect session, when requested for a course with qualifying content, always contains at least one item from each of the four categories (new concepts, weak new-to-old connections, low-connectivity concepts, confused-concept contrasts) when that category has qualifying content, and clearly states when a category has none.

## Assumptions

- Exam-planner (PRD 18.3) does not exist yet; the review-priority ranking's exam-related factor is included in the formula as specified but has no real data source until that feature ships, so it defaults to a neutral (non-distorting) influence rather than being omitted from the ranking's shape entirely.
- The daily time budget defaults to a fixed value in the 5-10 minute range chosen during planning, and can be adjusted by the student; it is not something the system infers automatically per-student in this feature.
- "Validated practice question" means a question already produced and confirmed by the existing question-generation pipeline (assessment-generation-pipeline) -- this feature is a consumer of that content, not a new way of producing or validating questions.
- Completing a review item's grading and evidence-commit reuses the product's existing grading pipeline (deterministic-grading) end to end; this feature only decides *which* question to show and *when* a concept is next due, not how an answer is judged.
- "Commonly confused concepts" draws on misconception/confusion signals already captured elsewhere in the product (e.g. flagged misconceptions, contrast relationships in the course graph) rather than this feature independently deciding which concepts are confusable.
- A "week" for the Connect session's "introduced this week" scope is a rolling 7-day window ending at the moment the session is requested, not a fixed calendar week.
