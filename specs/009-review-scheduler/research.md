# Research: Review Scheduler

## No new persistence layer — everything is derived from existing state

- **Decision**: Neither the review-priority score nor "when a concept
  is next due" is stored. Both are pure functions computed on read from
  data this project already has: `computeLearnerState`'s existing
  `tier`/`score`/`lastEvidenceAt`/`hasUnresolvedMisconception` output
  (per concept and, via its edge overload, per relationship),
  `course_concepts.importance_score`, `concept_edges` (for prerequisite
  and `contrasts_with` relationships), and `question_bank`.
- **Rationale**: every one of the priority formula's six factors
  (spec.md FR-001) already has a real source:
  - `forgetting_risk` / `evidence_gap`: `computeLearnerState`'s
    `lastEvidenceAt` (recency) and `score`/`tier` (how thin the
    evidence is) — the same recency-decay math
    `learner-graph-evidence` already uses for mastery, not a second
    forgetting-curve implementation.
  - `course_importance`: `course_concepts.importance_score`, unchanged.
  - `prerequisite_centrality`: a concept's out-degree of
    `prerequisite_for` edges in `concept_edges` — how many other
    concepts list it as a prerequisite.
  - `unresolved_confusion_weight`: `computeLearnerState`'s existing
    `hasUnresolvedMisconception` flag.
  - `upcoming_exam_weight`: a neutral constant (see below) until
    `exam-planner` exists.
  This means the requirement for a new table is never actually
  demonstrated — the Constitution's "no new persistence layer without a
  demonstrated requirement" bar isn't cleared by justification, it's
  cleared by there being nothing left to store. "Next review date" in
  particular is deliberately NOT a stored, incrementally-patched column
  (the classic spaced-repetition implementation) — it's recomputed from
  the same evidence log `computeLearnerState` already replays, matching
  this project's standing "recompute from the full evidence log, never
  patch a running score" discipline (`learner-graph-evidence`
  research.md), extended here to scheduling state, not just mastery
  state.
- **Alternatives considered**: a new `concept_review_schedule` table
  storing a per-concept, per-student next-due date and interval,
  updated incrementally after each review (rejected — this is exactly
  the kind of mutable, hand-patched state Principle II's spirit warns
  against; it would also need its own reconciliation with
  `evidence_events` as the source of truth, duplicating information
  instead of deriving it). A new `review_sessions` table logging what
  was shown each day (rejected for the same reason FR-013's "request
  more" doesn't need one — see below).

## "Request more" needs no server-side session log

- **Decision**: FR-013 (a student can request additional items beyond
  an initial session) is served by the client passing back the concept
  ids already shown; the server excludes those from the next ranked
  slice. No session is persisted.
- **Rationale**: the ranking is deterministic and stable between two
  requests with no new evidence in between (SC-004) — there's nothing
  to log that isn't already reconstructable from "what was already
  shown," which the requester already knows. Introducing a session-log
  table would be new persistence with no real need behind it, the same
  reasoning as the table above.
- **Alternatives considered**: a `review_sessions`/`review_session_items`
  table (rejected — no demonstrated need; would also raise a real
  question this feature doesn't need to answer, like how long a
  session record should live).

## Route: `/study`, not `/review` — a real naming collision found live

- **Decision**: This feature's session UI lives at
  `src/app/courses/[courseId]/study/page.tsx`.
- **Rationale**: `src/app/courses/[courseId]/review/page.tsx` already
  exists — it's `course-graph-ingestion`'s ontology confirmation queue
  (pending concept/edge candidates a course owner confirms or rejects),
  a completely unrelated meaning of "review." Reusing that path would
  either collide outright or force an unrelated feature's route to
  carry two meanings. Found by inspection while planning this feature's
  UI, before any code was written.
- **Alternatives considered**: renaming the existing ingestion queue
  route to free up `/review` (rejected — out of scope for this feature,
  and that route is already live/tested via
  `tests/visual/review-queue.spec.ts`; renaming it is an unrelated,
  unjustified side effect).

## Synchronous server actions, not a Trigger.dev background task

- **Decision**: All of this feature's read/compose operations
  (`getDailyReviewSession`, `getConnectSession`) are plain `"use
  server"` actions, like `deterministic-grading` and `tutor-agent`, not
  a Trigger.dev task like `course-graph-ingestion`/
  `assessment-generation-pipeline`.
- **Rationale**: nothing here makes an LLM call or any other slow,
  multi-step external call (FR-002 forbids an LLM in the ranking path
  entirely) — it's a handful of bounded Postgres reads plus in-memory
  computation, well within a normal request's latency budget, the same
  criterion `assessment-generation-pipeline`'s own research.md used in
  the opposite direction to justify a background task there.
- **Alternatives considered**: a background task pre-computing sessions
  on a schedule (rejected — unnecessary complexity for work cheap
  enough to compute synchronously on request; would also introduce
  staleness the synchronous approach doesn't have).

## Question selection: one bank entry per due concept, no repeat-avoidance yet

- **Decision**: When multiple validated `question_bank` entries exist
  for the same due concept, the session picks one (the most recently
  validated) without tracking which specific questions a student has
  already seen.
- **Rationale**: `assessment_attempts` (deterministic-grading) stores a
  question snapshot, not a foreign key back to `question_bank`, so
  "has this exact bank entry been shown before" isn't reliably
  answerable yet without a new join path — and the spec doesn't
  actually require no-repeats (SC-002/SC-003 require every item be
  real and traceable, not that no two sessions ever repeat a question).
  Building repeat-avoidance now would be solving a problem the spec
  doesn't ask for, ahead of a real signal that it matters.
- **Alternatives considered**: adding a `question_bank_id` FK to
  `assessment_attempts` now to support least-recently-used selection
  (rejected for this feature — a real, reasonable future improvement,
  but a schema change to an already-shipped feature's table is out of
  scope here; noted so it isn't silently forgotten).

## Priority formula weights: tunable constants, not calibrated values

- **Decision**: The six factors in FR-001 combine via named, exported,
  tunable constants in `review-priority.ts` (relative weight per
  factor, the neutral `upcoming_exam_weight` placeholder value),
  default values chosen for reasonable dogfood behavior.
- **Rationale**: same reasoning established repeatedly in this project
  (`evidence-weights.ts`, `assistance-ladder.ts`,
  `deterministic-grading`'s confidence threshold,
  `assessment-generation-pipeline`'s `MAX_GENERATION_ATTEMPTS`) — these
  are starting parameters this project has no real usage data to
  calibrate yet, not constants to bury inline.
- **Alternatives considered**: none seriously — inlining the weights
  would repeat a mistake this project has already corrected three
  times.
