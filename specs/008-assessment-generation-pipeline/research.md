# Research: Assessment Generation Pipeline

## Trigger.dev, not a synchronous server action

- **Decision**: The whole generate-then-validate sequence runs as a
  Trigger.dev task (`trigger/generate-assessment.ts`), triggered from a
  server action that inserts the initial `assessment_generation_runs`
  row and calls `.trigger()` — the same shape
  `course-graph-ingestion`'s upload action uses to kick off
  `extract-course-graph.ts`.
- **Rationale**: `tutor-agent` and `deterministic-grading` both stayed
  synchronous because their work is bounded — a capped tool-call loop,
  one sandbox run, one rubric call. This pipeline is different: one
  attempt is generation (1 call) plus up to six validation layers,
  several of which are themselves model calls (source-alignment's
  model-judgment path, ambiguity, similarity, and the blind-solver
  fallback) — realistically 4-5 sequential LLM calls per attempt,
  multiplied by a bounded number of regeneration attempts on failure.
  That's slow, external, multi-step work needing retry/idempotency
  across a queue — exactly the criterion `course-graph-ingestion`'s own
  research.md already used to choose Trigger.dev over a plain server
  action, and this pipeline is at least as heavy.
- **Alternatives considered**: a synchronous server action (rejected —
  realistic worst-case latency of several sequential model calls times
  several regeneration attempts would badly exceed a reasonable request
  timeout, and a failed mid-pipeline request would have no durable
  record of which layer it reached, unlike a Trigger.dev run).

## Question bank is course-owned content, not student-owned data

- **Decision**: `assessment_generation_runs` and `question_bank` are
  RLS-keyed on `owner_id = auth.uid()`, the same pattern
  `course_units`/`course_concepts`/`concept_edges`/`extraction_runs`
  already use — not `user_id`, the pattern `learner-graph-evidence`/
  `tutor-agent`/`deterministic-grading` all used for their own tables.
- **Rationale**: those three most recent features' tables all describe
  something about one specific student (their evidence, their
  conversation, their graded attempt) — a reusable question bank entry
  is different in kind: it's course content, generated once and reused
  across however many students eventually attempt it, exactly like a
  confirmed concept or edge. Keying it by the student who happens to
  trigger generation would misrepresent what the data actually is, the
  same reasoning `learner-graph-evidence`'s own research.md used in the
  opposite direction to justify keying evidence by `user_id` instead of
  `owner_id`. This is a deliberate return to the earlier pattern, not a
  regression to inconsistency — the right key depends on what the data
  actually describes, not on "whatever the last few features did."
- **Alternatives considered**: `user_id`-keyed, matching the three most
  recent features for superficial consistency (rejected — same
  "consistent naming for two things that mean different concepts is
  the wrong kind of consistency" reasoning `learner-graph-evidence`'s
  own research.md already established, applied here in reverse).

## Independent-solve dispatch: the candidate declares its own checker domain

- **Decision**: Candidate generation (the Structured Outputs schema)
  requires the model to declare a `checkerDomain` (one of
  `deterministic-grading`'s five domains, or `null` for a modality with
  no exact checker) alongside a `checkerInput` matching that domain's
  real shape (`TraversalCheckInput`/`HeapCheckInput`/etc. from
  `deterministic-grading`'s own `data-model.md`) whenever `checkerDomain`
  is non-null. `independent-solve.ts` dispatches directly to that
  checker when present; otherwise it runs a separate "blind solver"
  model call — shown only the question, never the candidate's own
  stated answer — and the answer-agreement layer compares that
  independent result against the candidate's own key.
- **Rationale**: FR-007 requires reusing an existing exact checker
  whenever one applies, never a second model call re-solving a problem
  a checker can already verify exactly (Constitution Principle IV).
  The candidate itself is the natural place to capture which domain
  applies and in what shape, since the generating model already knows
  what kind of question it produced — inferring this after the fact
  from `response_modality` alone would be unreliable (a `"graph"`
  question could be BFS/DFS, topological sort, or shortest-path; there
  is no clean mechanical mapping from modality to checker domain).
- **Alternatives considered**: inferring `checkerDomain` from
  `response_modality` via a fixed lookup table (rejected — no clean
  1:1 mapping exists, as above; would misroute questions to the wrong
  checker or fail to route eligible ones at all). Always using a model
  call for independent-solve, never dispatching to a real checker
  (rejected — directly violates FR-007/Constitution Principle IV for
  domains an exact checker already covers).

## Similarity check: no new retrieval/embeddings infrastructure

- **Decision**: The similarity check is a model call comparing the
  candidate's question text against the course's own confirmed
  concepts'/edges' real `source_anchors` excerpts (the same
  already-extracted material `course-graph-ingestion` produced) — not
  a new embeddings/vector-similarity pipeline, and not narrowly scoped
  to "homework-tagged artifacts only" (that distinction doesn't exist
  in this project's schema yet — `artifacts` has no lecture-vs-homework
  category field).
- **Rationale**: same reasoning `tutor-agent`'s research.md already
  established for its own grounding query — the ontology's existing
  source anchors are real, already-validated material, and building a
  second, parallel retrieval/embeddings mechanism to compare against
  would be exactly the kind of new persistence layer this project's
  standing rule requires an ADR to justify first, with no demonstrated
  need the existing anchors don't already serve. Scoping the comparison
  to all confirmed source material (not narrowly "homework") is an
  honest, documented limitation given the schema gap, not silently
  pretended away.
- **Alternatives considered**: a new `artifacts.kind` column
  distinguishing homework from lecture material, checked against only
  homework-kind artifacts (rejected for this feature — that's a
  `course-graph-ingestion` schema change, out of this feature's scope
  to introduce as a side effect; revisit if a real need for that
  distinction is demonstrated later). A string-similarity/n-gram
  algorithm instead of a model call (rejected — weak against
  paraphrase, which is exactly the near-copy case FR-010 cares about
  most; the same "no exact checker exists for this judgment" reasoning
  `deterministic-grading`'s own rubric grader already used).

## Bounded regeneration: one config constant, not scattered magic numbers

- **Decision**: `validation-pipeline.ts` takes `MAX_GENERATION_ATTEMPTS`
  as an explicit, named, exported constant (default starting value: 3)
  — not inlined in the retry loop.
- **Rationale**: same reasoning established three times already in this
  project (`learner-graph-evidence`'s weights, `tutor-agent`'s ladder,
  `deterministic-grading`'s confidence threshold) — SC-005 and the
  spec's own Assumptions treat this as a tunable starting parameter,
  not a calibrated constant, so it needs to be a visible, testable
  value, not buried in a loop.
- **Alternatives considered**: unbounded retry until success (rejected
  — a blueprint that's genuinely unfulfillable, e.g. targeting concepts
  with too little source material, would loop forever burning model
  calls with no path to reporting failure, directly violating the
  Edge Cases section's "unfulfilled request is reported, never silently
  retried forever").
