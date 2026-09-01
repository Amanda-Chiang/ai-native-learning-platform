# Research: Deterministic Grading

## Why E2B is a justified new dependency

- **Decision**: Add `@e2b/code-interpreter` (npm) as this feature's
  sandbox for running student/generated code, requiring a new
  `E2B_API_KEY` credential alongside the existing `OPENAI_API_KEY`/
  Supabase keys.
- **Rationale**: this project's standing rule is "no new external
  dependency when an existing one already solves the problem" — but
  nothing in this project can safely execute untrusted code today. The
  PRD itself names E2B specifically for exactly this case
  (`docs/technical-prd.md` 9.6, "E2B sandbox for untrusted student/
  generated code where local deterministic functions are insufficient")
  and the constitution's Technology & Architecture Constraints section
  lists E2B as part of the locked stack. Running untrusted code
  in-process (even in a Node `vm` context) is not a safe substitute —
  it doesn't provide real process/filesystem/network isolation, which
  is the entire point of grading arbitrary student code. This is a
  demonstrated requirement, not a speculative one.
- **Alternatives considered**: a local Node `vm`/`worker_threads`
  sandbox (rejected — insufficient isolation for genuinely untrusted
  code; a determined or buggy submission could escape or exhaust host
  resources). Docker-per-submission (rejected — real new infrastructure
  to operate, no benefit over a managed service already decided by the
  PRD). Skipping code grading for the MVP (rejected — spec.md's User
  Story 3 and the PRD's own P4 principle both require it; code is a
  first-class DSA response modality, not optional).

## `assessment_attempts`: a lightweight snapshot, not a question-bank FK

- **Decision**: `assessment_attempts` (migration
  `0006_deterministic_grading.sql`) stores a self-contained snapshot of
  what was graded — the question's own checker/rubric config (as
  submitted to this feature, not fetched from a bank), the student's
  response, and the grading result — rather than a foreign key into a
  question-bank table. This is also where
  `evidence_events.assessment_attempt_id`'s deferred FK finally gets
  attached (left unconstrained in `0004_learner_evidence.sql` — "no
  assessment_attempts table exists yet").
- **Rationale**: `assessment-generation-pipeline` (this feature's
  future sibling) is what will actually own a reusable, validated
  question bank — it doesn't exist yet, and this feature doesn't need
  it to exist to do its own job (grading a response that's already in
  final structured/code/text form, per spec.md Assumptions). Requiring
  a real question-bank FK now would either block this feature on one
  that isn't built yet, or force a speculative bank schema guessed at
  ahead of the feature that actually owns that design. A self-contained
  snapshot lets this feature ship independently and gives
  `assessment-generation-pipeline` a real, already-populated table to
  extend (e.g. adding an optional `question_bank_id` column) once it
  exists, rather than a schema neither feature has validated against
  real usage yet.
- **Alternatives considered**: no `assessment_attempts` table at all,
  passing grading results through only as request/response with no
  persisted record (rejected — the whole point of the deferred FK on
  `evidence_events.assessment_attempt_id` was to eventually have
  something real to reference; every grading attempt is also exactly
  the kind of provenance record this project's evidence-first design
  philosophy expects to exist). A full speculative question-bank schema
  built here first (rejected — that's `assessment-generation-pipeline`'s
  design to own, and guessing it now risks a shape that doesn't match
  what that feature's own blueprint/validation-layer design actually
  needs).

## One structural funnel from grading result to evidence commit

- **Decision**: `grading-evidence.ts` exports a single function,
  `commitEvidenceFromGradingResult`, that every one of the three
  grading paths (checker, sandbox, rubric) calls to translate its own
  result shape into `learner-graph-evidence`'s `CommitEvidenceInput` and
  actually call `commitEvidence`. No grading path calls `commitEvidence`
  directly itself.
- **Rationale**: Constitution Principle II (FR-011/FR-012) requires
  every grading result to become real evidence with an honest
  correctness/confidence/assistance-level mapping. Three independent
  call sites each remembering to map their own result correctly is
  exactly the kind of duplicated responsibility that drifts over time
  (one path's mapping gets tweaked, the others don't, and the
  divergence isn't visible until a real bug surfaces). One shared
  function makes the mapping rule visible and testable in one place,
  same reasoning `learner-graph-evidence`'s own single-`commitEvidence`
  design already established for this project.
- **Alternatives considered**: each grading action (`gradeStructuredResponse`/
  `gradeCodeResponse`/`gradeTextResponse`) calling `commitEvidence`
  directly with its own inline mapping (rejected — the duplication risk
  above, and harder to unit-test the mapping rule in isolation from the
  Supabase-calling action itself).

## Confidence threshold for rubric grading: one config value, not a magic number inline

- **Decision**: `rubric-grader.ts` takes a `confidenceThreshold`
  parameter (default exported alongside it, e.g.
  `DEFAULT_RUBRIC_GRADING_CONFIDENCE_THRESHOLD`) below which a grading
  result is flagged low-confidence (FR-010) — not a number inlined in
  the grading logic.
- **Rationale**: same reasoning already established twice in this
  project (`learner-graph-evidence`'s `evidence-weights.ts`,
  `tutor-agent`'s `assistance-ladder.ts` weights) — this is a tunable
  starting parameter per spec.md's own Assumptions, not a calibrated
  constant, and keeping it as an explicit, named, testable value is
  what makes future recalibration cheap and safe.
- **Alternatives considered**: hardcoding the threshold inline
  (rejected — same drift/testability risk the prior two features'
  research already rejected this for).
