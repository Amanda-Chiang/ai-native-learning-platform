# Research: Learner Graph Evidence

## State computation: recompute from the full evidence log, never patch a running score

- **Decision**: `learner_concept_state`/`learner_edge_state` are a
  **rebuildable cache**, not the source of truth. `commitEvidence`
  inserts one `evidence_events` row, then re-reads *every* evidence event
  for that (student, concept) or (student, edge) pair and calls a pure
  function, `computeLearnerState(events, now, weights)`, that derives the
  full state from scratch every time. There is no incremental
  "add this event's contribution to the running total" code path
  anywhere.
- **Rationale**: this is the long-term-maintainability choice, not just
  the simplest one, and it's worth being explicit about why. PRD §10.4 is
  explicit that the algorithm's weights are "product parameters, not
  psychological truths" and expects recalibration once real usage data
  exists — possibly a full replacement with knowledge tracing later. An
  *incremental* aggregate (a running weighted sum updated on each new
  event) bakes the weights in effect *at insert time* permanently into
  the stored number — recalibrating weights later would require either
  accepting a permanently-inconsistent history (old events under old
  weights, new events under new weights, blended in one number with no
  way to tell which is which) or a special one-off migration script to
  "fix" old data. A **recompute-from-log** design sidesteps that
  entirely: change `evidence-weights.ts`, and every concept's/edge's
  state becomes correct under the new weights the next time it's
  touched — no migration, no blended-inconsistency risk, ever. This is
  the standard event-sourcing tradeoff (append-only log as truth,
  derived state as a disposable projection), applied here because the
  spec's own FR-006 already requires logging every component of every
  event — the data event sourcing needs was going to be persisted
  either way; recompute-from-log is what makes that data actually usable
  for its stated purpose (recalibration) instead of just sitting unread.
- **Alternatives considered**: an incremental running-aggregate update
  (rejected — the recalibration problem above; also silently accumulates
  floating-point drift over thousands of updates, another maintenance
  hazard a recompute-from-scratch design can't have by construction).
  A hybrid (periodic incremental updates plus an occasional full
  recompute "to catch drift") — rejected as unneeded complexity: at this
  project's realistic per-concept event volume (tens to low hundreds,
  not millions), full recompute is fast enough that there's no
  performance problem to solve with a hybrid in the first place. Revisit
  only if real usage data shows per-concept event counts becoming large
  enough that recompute latency is an actual, measured problem — not
  before.

## Evidence belongs to the student, not the course owner

- **Decision**: `evidence_events`, `learner_concept_state`, and
  `learner_edge_state` are RLS-scoped on `user_id = auth.uid()` — not
  `owner_id`, the key every prior table in this project (`courses`,
  `artifacts`, `course_concepts`, `concept_edges`, ...) uses.
- **Rationale**: every earlier table's `owner_id` genuinely means "the
  course creator," which is correct for course-level ontology data. This
  data is different in kind: it's about *who the evidence describes*,
  which is the student, not whoever created the course. Today those
  happen to be the same account (spec.md Assumptions — no separate
  enrollment model exists yet), so `user_id = auth.uid()` and
  `owner_id = auth.uid()` currently gate identical access. But naming and
  keying this by `user_id` now, correctly, avoids a rename-and-re-key
  migration later when multi-student enrollment is added (a real,
  already-implied future need per the PRD's whole framing of "a
  student's" evidence — not a speculative one this decision is
  over-building for).
- **Alternatives considered**: reuse `owner_id` for consistency with
  every other table (rejected — consistent naming for two things that
  mean different concepts is the wrong kind of consistency, and it's the
  one table in this project where "owner" and "student" are foreseeably
  going to diverge).

## Reusing the already-shipped MasteryState/LearnerRelationshipState enums

- **Decision**: `learner_concept_state.mastery_state` uses the exact same
  four-value enum `course-graph.ts`'s `MasteryState` already defines
  (`"unverified" | "exposed" | "weak" | "solid"`); `learner_edge_state.learner_state`
  uses the same `LearnerRelationshipState` (`"weak" | "strong"`). No new,
  parallel enum is introduced.
- **Rationale**: a second enum meaning the same thing as an
  already-shipped one is a maintenance liability waiting to happen — the
  two would need to be kept in sync by hand forever, and nothing stops
  them silently drifting apart. Reusing the renderer DTO's own vocabulary
  also means `apply-learner-state.ts`'s overlay is closer to a direct
  copy than a translation layer, which is less code and less to get
  wrong.
- **Alternatives considered**: a richer, continuous-score persisted state
  with the four-tier enum computed only at render time (rejected for
  *this* feature's persisted schema — the continuous score is still
  computed and returned by `computeLearnerState` for FR-006's "log every
  component," just not stored as the queryable `mastery_state` column;
  storing both the tier and its computed inputs, not inventing a fifth
  ambiguous state, is what FR-006 and FR-009 both actually need).

## Independence detection: reuse the existing `assistanceLevel` field

- **Decision**: "independent" evidence (FR-004, spec.md Assumptions) is
  defined as an event whose `assistanceLevel` is at or below a
  configured threshold (`evidence-weights.ts`), reusing the field PRD
  §14.3's assistance ladder (0 = pure independent retrieval, 6 = given
  the complete answer) already puts on every `EvidenceEvent`. No new
  field is added to detect independence.
- **Rationale**: the field already exists, already means exactly this,
  and is already required data on every event (`EvidenceEvent.assistanceLevel: number`,
  not optional). Inventing a second, parallel "was this independent"
  boolean would duplicate information the assistance ladder already
  encodes and create a place for the two to disagree.
- **Alternatives considered**: a separate explicit `independent: boolean`
  field on evidence submission (rejected — redundant with
  `assistanceLevel`, and whoever calls `commitEvidence` — today only this
  feature's own test/quickstart paths, later `tutor-agent` — would have
  to keep both in sync correctly, which is exactly the kind of
  duplicated-source-of-truth bug the recompute-from-log decision above
  is deliberately avoiding elsewhere in this same feature).

## Tier cutoffs, weights, and the misconception threshold: one config object, not scattered constants

- **Decision**: `evidence-weights.ts` is the single place every tunable
  number in this feature lives: per-`EvidenceType` strength weights, the
  recency half-life, the independence (`assistanceLevel`) cutoff, the
  three score cutoffs separating unverified/exposed/weak/solid, and the
  misconception threshold (spec.md Assumptions: "two or more," a
  starting value). `computeLearnerState` takes this object as a
  parameter — it is never hardcoded inside the function body.
- **Rationale**: PRD §10.4 explicitly frames every one of these numbers
  as "product parameters, not psychological truths," expected to change
  once real usage data exists. Keeping them in one exported, typed
  object rather than scattered through the computation function's body
  is what actually makes that recalibration cheap and safe later — a
  future change touches one file, and `compute-learner-state.test.ts`'s
  existing tests immediately show whether a new set of weights breaks
  any already-agreed-on behavior (e.g. "exposure never exceeds
  'exposed'" stays true under any weights where exposure's own strength
  value is below the exposed/weak cutoff by construction, not by a
  separate check that could be forgotten if weights change).
- **Alternatives considered**: making weights a database-configurable
  table (rejected — no UI or workflow need for changing weights *without
  a code deploy* has been stated anywhere in this project; that would be
  building speculative flexibility PRD §10.4 doesn't ask for. A typed,
  version-controlled config file is the right amount of flexibility for
  "these will change later, thoughtfully, by someone reading the code" —
  not "these need to be tunable by a non-engineer at runtime," which is
  a different, unstated requirement).

## Overlaying real state onto course-graph-ingestion's baseline, without touching it

- **Decision**: `apply-learner-state.ts` exports a pure function,
  `applyLearnerState(graph: CourseGraph, conceptStates: Map<string, LearnerConceptStateRow>, edgeStates: Map<string, LearnerEdgeStateRow>): CourseGraph`,
  that returns a new `CourseGraph` with each concept's `masteryState`
  and each edge's `learnerState`/`explanation` replaced wherever a
  matching state row exists, left at `course-graph-ingestion`'s baseline
  otherwise. A new server action, `getCourseGraphForLearner(courseId)`
  (this feature's `actions.ts`), calls `course-graph-ingestion`'s
  existing `getCourseGraph(courseId)` and then this overlay, and
  `src/app/courses/[courseId]/atlas/page.tsx` is updated to call the new
  function instead of the old one.
- **Rationale**: `course-graph-ingestion`'s `materializeCourseGraph`
  already has one clear job (confirmed ontology → baseline DTO) and its
  own passing test suite built around that. Extending it to also know
  about per-student evidence would mix two concerns that change for
  different reasons (ontology confirmation vs. evidence accumulation)
  into one function, making both harder to reason about and test in
  isolation later. A separate overlay function keeps each piece
  single-responsibility and composable — exactly the same reasoning this
  project already applied when it kept `extract-course-graph.ts` and
  `ingest-artifact.ts` as two chained tasks instead of one
  (`brain/decisions/architecture-log.md`, "Chaining onto Phase 1's
  ingest-artifact task").
- **Alternatives considered**: modifying `materializeCourseGraph` itself
  to accept optional learner state (rejected — couples two independently-evolving
  concerns in one function and one call signature; every future caller
  of `materializeCourseGraph` that doesn't care about per-student state,
  such as `scripts/score-extraction.ts` if it's ever adapted to check
  ontology structure, would still need to pass `null`/empty maps through
  it for no reason).

## No background job needed

- **Decision**: `commitEvidence` runs entirely inside one Next.js server
  action — insert the evidence row, recompute, upsert the state row, all
  in one request/transaction. No Trigger.dev task.
- **Rationale**: unlike `course-graph-ingestion`'s OpenAI calls (slow,
  external, needs retry/idempotency across a queue), this feature's work
  is a bounded database read plus a pure in-memory computation plus a
  database write — well within a normal request's time budget, with
  nothing external to fail asynchronously. Introducing a background job
  here would add operational complexity (a new task, its own idempotency
  handling) with no problem it actually solves.
- **Alternatives considered**: a Trigger.dev task for evidence commit
  (rejected per the above — genuinely no benefit at this feature's
  actual workload).
