# Quickstart: Assessment Generation Pipeline

Like `course-graph-ingestion`, this feature needs a real `OPENAI_API_KEY`
and a real Trigger.dev project — the generation/validation calls are
real model calls, not verifiable offline.

## Group A — verifiable now, no external accounts needed

### A1. Typecheck

```bash
nvm use 24
npm run typecheck
```

**Expected outcome**: exits 0.

### A2. Pure logic, exhaustively

```bash
npm run test:unit
```

**Expected outcome**: passes, including new tests confirming — no
database, Trigger.dev, or model call involved:

- `candidate-generation-schema.ts`'s Structured Outputs schema parses a
  well-formed candidate and rejects a malformed one (missing
  `sourceAnchors`, a `checkerInput` present without a `checkerDomain` or
  vice versa).
- `source-alignment-check.ts`: a candidate whose `sourceAnchors` really
  do resolve to the blueprint's real target concepts/edges passes;
  one citing an anchor into a concept/edge not in the blueprint's
  targets fails, with the specific mismatched anchor identified.
- `answer-agreement-check.ts`: a candidate's stated answer matching the
  independent solve's real result passes; a mismatch fails with both
  values shown, never just "disagreement" with no detail.
- `validation-pipeline.ts`'s bounded-regeneration loop, given injected
  fake per-layer results: stops immediately on the first passing
  attempt; retries up to exactly `MAX_GENERATION_ATTEMPTS` on repeated
  failure, never one more; a layer that never ran (because an earlier
  one already failed) is recorded as `{ passed: false, detail: "not
  reached" }`, never a fabricated pass.

## Group B — requires a real Supabase project, OPENAI_API_KEY, and Trigger.dev

### B1. Apply the migration

```bash
npx supabase db push   # applies supabase/migrations/0007_assessment_generation.sql
```

**Expected outcome**: `assessment_generation_runs`, `question_bank`
exist with RLS enabled; an anon-key query against either returns
`status=200, rows=0` for a signed-out session.

### B2. A blueprint targeting real course material produces a validated question

```bash
#   1. Call requestQuestionGeneration with a blueprint targeting a
#      confirmed concept with real source material
#   2. Poll getGenerationRun(requestId) until status is no longer "pending"
#   3. Call getQuestionBank for the course
```

**Expected outcome**: step 2 reaches `"succeeded"`; step 3 shows a real
entry whose `sourceAnchors` are traceable to the actual confirmed
concept, and whose `validationReport` shows all six layers passed
(spec.md US1/US2).

### B3. A candidate with a deliberately wrong answer key never reaches the bank

```bash
#   1. Manually inject (or construct via a test-only path) a candidate
#      whose rubric/answer key disagrees with what an independent solve
#      of the same question would produce
#   2. Run it through runValidationLayers directly
```

**Expected outcome**: the `answerAgreement` layer fails with the real
disagreement recorded; the candidate is never persisted to
`question_bank` (spec.md US2 Acceptance Scenario 2).

### B4. A blueprint targeting nonexistent concepts fails plainly

```bash
#   1. Call requestQuestionGeneration with a blueprint whose
#      targetConceptIds includes an id that doesn't exist/isn't confirmed
```

**Expected outcome**: the action rejects before triggering the
background task at all (FR-012) — not required to automate every
combination, but confirm this by inspection before calling this
feature done.
