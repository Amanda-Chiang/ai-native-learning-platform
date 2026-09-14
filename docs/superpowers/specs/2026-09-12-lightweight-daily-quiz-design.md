# Lightweight daily MCQ quiz — design

**Status:** Approved (brainstormed interactively 2026-09-11/12), proceeding to implementation.
**Type:** Enhancement to already-shipped features (`course-graph-ingestion`,
`assessment-generation-pipeline`, `review-scheduler`), not a new Spec Kit
feature — same rationale as the 2026-09-05 unit-extraction-reconciliation
enhancement: this changes/extends already-shipped behavior rather than
adding a net-new capability with its own user stories.

## Problem

`question_bank` has zero rows in every real course. Material upload →
extraction produces real `course_concepts`, and `getExamConfig` works, but
nothing has ever generated a practice question, so the Study tab's daily
session always says "No review content is available yet." The full
`assessment-generation-pipeline` (heavy, checker-domain/free-text
questions, 6-layer validation) exists and is real, but nothing in the UI
constructs the `Assessment` blueprint it requires — there's no automatic
path from "I uploaded material" to "I have something to practice."

## What this builds

An automatic, lightweight multiple-choice quiz generated right after a
course's material is scanned — no drawing, no typing, answerable in your
head in a few seconds each. This is a *separate, additive* generation path
from the existing heavy pipeline, not a replacement.

## Trigger: either of two signals, once per extraction run

1. The student dismisses the review popup for that `extraction_run_id`
   (`ReviewQueue.tsx`'s `×` button — today this is purely a client-side
   `setActiveModalRunId(null)` with no server call at all; a real server
   action call is added here).
2. Every `course_units`/`course_concepts` row for that `extraction_run_id`
   has left `proposed` (all confirmed or archived) — checked after every
   `confirmCandidate`/`rejectCandidate` call and after the unit-confirm
   auto-confirm cascade.

Whichever fires first wins. Idempotency: `extraction_runs.quiz_generated_at`
(new column) — both call sites check it's still null before generating,
and set it immediately after (before or regardless of partial failure,
so a flaky generation doesn't retry-storm on every subsequent review
action).

## Concept selection & question count

- Eligible concepts: every concept from that extraction run (any status —
  `proposed` is fine, matching the tagging decision below) with
  `importance_score >= 0.6`.
- Per eligible concept, the model itself judges how many questions that
  concept's material actually supports (1 for a narrow concept, up to 3
  for one the source material spends real space on) and is instructed
  not to produce overlapping questions for the same concept.
- Hard cap: 15 questions total per extraction run, to bound cost/latency
  regardless of how many concepts qualify.
- Every question is tagged to ≥1 concept id (`target_concept_ids`, new
  column — see Schema). A question may span multiple concepts if it
  naturally does.

## Tagging & cascade delete

A question's `target_concept_ids` can include `proposed` concepts (no
review-status gate to be quiz-eligible). But if **every** concept a
question is tagged to gets archived (rejected), the question is deleted
outright — not archived, since it never had independent standing; it was
only ever a claim about now-rejected concepts. Checked inside
`rejectCandidate`'s concept branch, after a concept is archived: find every
`question_bank` row referencing it, and for each, delete it if none of its
`target_concept_ids` still resolve to a non-archived concept.

## Schema changes (additive — `question_bank`)

- `response_modality` gains `'multiple_choice'`.
- `rubric` (existing jsonb column, already "whatever this modality's
  answer key looks like") holds `{ options: string[4], correctOptionIndex: number }`
  for MCQ rows. No new `options` column — `checker_domain`/`checker_input`
  stay null for MCQ, same as they already are for plain `text` rows
  (those columns are reserved for the 5 real deterministic-checker
  domains, none of which is multiple-choice).
- New `target_concept_ids uuid[] not null` column, `check
  (array_length(target_concept_ids, 1) is not null)` — every question
  must reference at least one concept, no exceptions (matches Constitution
  Principle: no unanchored claim). This is also what the cascade-delete
  check above queries.
- `generation_run_id` becomes nullable — a lightweight-quiz row has no
  `assessment_generation_runs` row (that table's shape, a full
  candidate + 6-layer validation report, doesn't apply here). A row's
  `generation_run_id IS NULL` is exactly the rows this new path produced;
  no separate `source` column needed.
- `extraction_runs` gains `quiz_generated_at timestamptz` (idempotency,
  above).

## Generation & validation

A new, deliberately separate (not reused) generation module — its own
Structured Outputs schema and prompt, not `assessment-generation-pipeline`'s
`CandidateQuestion`/`CANDIDATE_GENERATION_RESPONSE_SCHEMA`, since MCQ's
shape (4 options + correct index, no rubric/checker duality) doesn't fit
that type cleanly and this path is meant to stay cheap and fast.

One model call per eligible concept (the model decides 1-3 questions from
that call, per the count-judgment above), grounded in that concept's real
`source_anchors` — every produced question must cite a real anchor,
enforced the same way `extraction-schema.ts`/`candidate-generation-schema.ts`
already enforce non-empty, real content (never `typeof x === "string"`
alone).

Of the existing 6-layer pipeline, only the **ambiguity check**
(`checkAmbiguity`'s pattern: a second model call asking "does this have
more than one reasonable correct answer?") is kept — reimplemented locally
against the MCQ candidate shape rather than importing
`assessment-generation-pipeline`'s version (avoids a cross-feature type
coupling for one ~20-line function). Independent-solve, answer-agreement,
similarity, and source-alignment are skipped: independent-solve/
answer-agreement exist to catch a wrong rubric on an open-ended answer
(not applicable — MCQ correctness is just "which index is marked
correct," self-evidently checkable); similarity/source-alignment are
about paraphrasing-vs-copying an open-ended claim, a much lower-stakes
concern for a 4-option recall question grounded in a cited anchor.
A candidate that fails the ambiguity check is dropped, not regenerated
(no bounded-retry loop — keeps this path simple; a concept with all its
candidates dropped just contributes fewer questions, not zero for the
whole run).

## Grading

Deterministic, no LLM call: compare the student's selected index against
`rubric.correctOptionIndex`. New `submitMultipleChoiceReviewAnswer`
(`review-scheduler/actions.ts`, mirrors `submitTextReviewAnswer`'s shape)
commits evidence directly via `commitEvidence` — `evidenceType:
"retrieval"`, `graderConfidence: 1` (fully certain, deterministic),
`assistanceLevel: 0`, same `difficulty`/`transferDistance` defaults the
other review-scheduler submit paths already use. `conceptIds` is
`[conceptId]`, the single concept a session item was surfaced/ranked
under — matching `submitTextReviewAnswer`/`submitStructuredReviewAnswer`'s
existing convention exactly, even when a question's `target_concept_ids`
tags more than one (that full list backs review-queue eligibility and
the reject-cascade, not per-answer evidence attribution). Evidence
commits fine against a `course_concepts` row of any status — confirmed
by reading `commitEvidence`, which checks existence in-course, not
status.

Real bug found live: `evidence_events` requires a real "origin"
(`source_artifact_id`, `assessment_attempt_id`, or `conversation_turn_id`
— `0004_learner_evidence.sql`'s own check). With no `assessment_attempts`
row and no conversation turn for this path, `submitMultipleChoiceReviewAnswer`
looks up the concept's own real `source_anchors[0].artifactId` (the
actual uploaded material it was extracted from) and passes that as
`sourceArtifactId` — the honest origin, not a workaround.

## Where it surfaces

Merged into the existing Study tab (`/courses/{id}/study`,
`StudySession.tsx`) as a third answer-form branch alongside the existing
`checkerDomain` (`StructuredAnswerForm`) and `text` (textarea) branches —
a new small radio-button component. `getDailyReviewSession`'s concept
query widens from `status = 'confirmed'` to `status in ('confirmed',
'proposed')` so a `proposed`-tagged MCQ concept can actually surface and
be ranked — `rankConceptsByPriority`/`isDue` are pure functions over
learner state/importance/prerequisite-out-degree, nothing in them assumes
`confirmed`; a still-proposed concept's prerequisite-out-degree simply
defaults to 0 (no confirmed edges reference it yet), which is a benign,
not-wrong default.

## Explicitly out of scope

- Not touching the existing heavy pipeline's `text`/`code`/`graph`/
  `tree`/`diagram` modalities, `assessment_generation_runs`, or
  `requestQuestionGeneration` — still unwired to any UI, still a real,
  separate known gap, not this feature's job to close.
- Not building a separate quiz surface — decided explicitly against this
  during brainstorming in favor of merging into the existing Study tab.
- No regeneration/versioning story if a course's material changes later
  — a re-upload creates a new `extraction_run_id`, which gets its own
  independent quiz-generation pass.
