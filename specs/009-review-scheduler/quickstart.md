# Quickstart: Review Scheduler

Unlike `assessment-generation-pipeline`/`deterministic-grading`, this
feature makes no LLM/E2B call of its own -- everything here is
verifiable against a real Supabase project alone, no `OPENAI_API_KEY`
or Trigger.dev project required (though a real `question_bank`, itself
produced by `assessment-generation-pipeline`, is needed for a
realistic walkthrough).

## Group A -- pure logic, no database needed

```bash
nvm use 24
npm run typecheck
npm run test:unit
```

**Expected outcome**: both exit 0, including new tests confirming --
all pure, all constructed fixtures, no live call involved:

- `review-priority.ts`: a concept with an unresolved misconception
  ranks above an equally-overdue concept without one; a more important
  concept (higher `importance_score`) ranks above an equally-overdue,
  equally-central, unflagged concept; every `ConceptPriority.reasons`
  entry is non-empty and specific, never a generic string.
- `next-review-date.ts`: a `LearnerConceptState` with a higher `score`
  produces a later `computeNextReviewDate` than one with a lower score
  and the same `lastEvidenceAt` (US2/SC-005); `hasUnresolvedMisconception:
  true` forces a near-immediate due date regardless of score;
  `lastEvidenceAt: null` always returns a past-or-present date
  (immediately due, FR-004).
- `daily-session.ts`: a due concept with zero available
  `question_bank` entries is skipped, never fabricated as a placeholder
  item (FR-009); the session never exceeds
  `timeBudgetMinutes / DEFAULT_MINUTES_PER_QUESTION` items rounded down,
  except it still returns at least one item when the budget is smaller
  than one question's cost (Edge Cases); an empty `questionsByConcept`
  for every due concept produces `{ status: "no_content" }`, never an
  empty `{ status: "ok", items: [] }` masquerading as "nothing to do"
  (FR-008); `excludeConceptIds` really excludes those concepts from the
  ranked slice (FR-013).
- `connect-session.ts`: a concept introduced 8 days ago is excluded
  from `newConcepts`, one introduced 3 days ago is included; an edge
  between a new and an old concept with `learnerState.learnerState ===
  "weak"` appears in `weakConnections`, one with `"strong"` doesn't; a
  concept whose `edgeCount` is well below the course average appears in
  `lowConnectivityConcepts`; only `relationType === "contrasts_with"`
  edges appear in `confusedPairs`.

## Group B -- requires a real Supabase project with real course data

### B1. A real course with evidence history and a populated question bank

```bash
#   1. Seed (or reuse) a course with several confirmed concepts, some
#      evidence_events at varying recency/correctness, one unresolved
#      misconception flag, and confirmed question_bank entries for at
#      least some of those concepts (via assessment-generation-pipeline)
#   2. Call getDailyReviewSession(courseId)
```

**Expected outcome**: returns `{ status: "ok" }` with a bounded,
ranked list of real items; the flagged-misconception concept's item (if
a validated question exists for it) appears above an equally-overdue,
unflagged concept's item; every item's `reasons` names a real factor.

### B2. A concept due for review with no validated question yet

```bash
#   1. From B1's course, pick a due concept with zero question_bank entries
#   2. Call getDailyReviewSession(courseId) again
```

**Expected outcome**: that concept is absent from the session's items,
the rest of the session is unaffected, and no evidence_events row is
created for it (FR-009 -- confirm by querying evidence_events directly).

### B3. Answering correctly vs. incorrectly changes the next-due date

```bash
#   1. Note a concept's current getConceptState(courseId, conceptId)
#   2. Complete a real question for it via deterministic-grading's
#      existing grading action -- once answered correctly and
#      independently, once (a different concept) answered incorrectly
#   3. Call getConceptState again for each and compute
#      computeNextReviewDate from the fresh state
```

**Expected outcome**: the correctly-answered concept's computed
next-review date is later than the incorrectly-answered one's
(US2/SC-005), confirmed against real evidence_events rows, not
injected fixtures.

### B4. The weekly Connect session against real course data

```bash
#   1. Ensure the B1 course has at least one concept confirmed within
#      the last 7 days, one contrasts_with edge, and enough concepts/
#      edges that connectivity varies
#   2. Call getConnectSession(courseId)
```

**Expected outcome**: all four categories that have qualifying real
content are non-empty and reference real concepts/edges; a category
with no qualifying content returns empty, not a fabricated example.
