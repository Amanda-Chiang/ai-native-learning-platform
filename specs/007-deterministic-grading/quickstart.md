# Quickstart: Deterministic Grading

Unlike every prior feature, this one needs a real `E2B_API_KEY` in
addition to the existing `OPENAI_API_KEY`/Supabase credentials — code
grading is a real sandboxed execution, not verifiable offline.

## Group A — verifiable now, no external accounts needed

### A1. Typecheck

```bash
nvm use 24
npm run typecheck
```

**Expected outcome**: exits 0.

### A2. The five checkers, exhaustively

```bash
npm run test:unit
```

**Expected outcome**: passes, including new tests confirming — no
database, sandbox, or model call involved:

- BFS/DFS: a claimed order consistent with the algorithm's real
  step-by-step constraints is accepted even when it differs from one
  arbitrarily-chosen reference order (multiple valid orders under
  tie-breaking); a claimed order that violates a real constraint at
  some step is rejected with the exact index it diverged at; a
  claimed order using an unreachable/nonexistent node is reported as
  `invalid_input`, not silently graded.
- Heap: an operation trace's claimed extracted sequence/final state is
  checked exactly (heap operations have no tie-breaking ambiguity);
  `checkHeapProperty` independently validates a bare array against the
  min-/max-heap property.
- Tree: traversal is checked by exact match (no ambiguity possible from
  a fixed left/right structure); insertion's claimed resulting tree is
  compared structurally against standard BST insertion.
- Topological sort: any claimed order respecting every edge's real
  precedence constraint is accepted (not just one canonical order); a
  cyclic input graph is reported as `invalid_input` ("no valid order
  exists"), never graded as a wrong answer.
- Shortest path: a claimed path is accepted if it's a real path whose
  weight sums to the graph's real shortest distance, even if it differs
  from another equally-short path.
- `rubric-grader.ts`'s confidence-threshold logic: a result below
  `DEFAULT_RUBRIC_GRADING_CONFIDENCE_THRESHOLD` is flagged
  `isLowConfidence: true`; one at or above it is not.

## Group B — requires a real Supabase project, OPENAI_API_KEY, and E2B_API_KEY

### B1. Apply the migration

```bash
npx supabase db push   # applies supabase/migrations/0006_deterministic_grading.sql
```

**Expected outcome**: `assessment_attempts` exists with RLS enabled; an
anon-key query returns `status=200, rows=0` for a signed-out session;
the new `evidence_events_assessment_attempt_id_fkey` constraint is
present.

### B2. A structured response is graded and becomes real evidence

```bash
#   1. Call gradeStructuredResponse with a real BFS problem and a
#      correct claimed order
#   2. Call learner-graph-evidence's getConceptState for the targeted concept
```

**Expected outcome**: step 2 shows a tier above the FR-010 baseline,
sourced from a real `evidence_events` row whose `assessment_attempt_id`
resolves to a real `assessment_attempts` row.

### B3. Code actually runs in the sandbox

```bash
#   1. Call gradeCodeResponse with real code and a real test
#   2. Confirm result.outcome === "graded" and result.tests reflects
#      the real pass/fail of that exact code
#   3. Call gradeCodeResponse with code that infinite-loops
```

**Expected outcome**: step 2's result is a genuine sandboxed execution
outcome, not a model-invented summary; step 3 returns
`outcome: "did_not_complete"` (`reason: "timeout"`), not a fabricated
pass or fail.

### B4. A low-confidence rubric grading is flagged, not silently trusted

```bash
#   1. Call gradeTextResponse with a genuinely ambiguous free-text answer
#   2. Confirm result.isLowConfidence === true
#   3. Call learner-graph-evidence's getConceptState for the targeted concept
```

**Expected outcome**: step 3's `contributingFactors` shows a
`graderConfidence` reflecting the real low value, not inflated to look
certain (FR-010) — not required to automate a "genuinely ambiguous"
test case, but confirm this by inspection before calling this feature
done.
