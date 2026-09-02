# Quickstart: Exam Planner

Like `review-scheduler`, this feature makes no LLM call of its own
(FR-005's optional wording draft is deferred, research.md) --
everything here is verifiable against a real Supabase project alone.

## Group A -- pure logic, no database needed

```bash
nvm use 24
npm run typecheck
npm run test:unit
```

**Expected outcome**: both exit 0, including new tests confirming --
all pure, all constructed fixtures:

- `stage-boundaries.ts`: four stages' date ranges sum to exactly the
  days between `now` and `examDate`; `final-weakness` still gets at
  least one day when the exam is only a few days out; throws when
  `examDate` is not after `now`.
- `scoped-selection.ts`: `selectDiagnosticConcepts`/
  `selectFinalWeaknessConcepts` only ever return concepts present in
  the scoped input, ranked the same way `review-scheduler`'s
  `rankConceptsByPriority` already does; `selectInterleavingEdges`
  only returns an edge when *both* endpoints are in scope and its
  learner state is `"weak"`; `selectTimedMixedConcepts` returns a
  spread across different mastery tiers, not only the single
  highest-priority concept.
- `readiness-snapshot.ts`: a concept with `lastEvidenceAt: null` lands
  in `untouched`, never `unverified`/`weak`; a concept with
  `hasUnresolvedMisconception: true` appears in
  `unresolvedMisconceptions` regardless of which tier bucket it's
  also in.
- `plan-composition.ts`: a stage with no available content produces
  `contentGap: true` with a real message, never a silently-empty or
  fabricated stage (FR-007).

## Group B -- requires a real Supabase project

### B1. Apply the migration

```bash
npx supabase db push   # applies supabase/migrations/0008_exam_planner.sql
```

**Expected outcome**: `exam_configs` exists with RLS enabled; an
anon-key query returns `status=200, rows=0` for a signed-out session.

### B2. A real staged plan against real course/evidence data

```bash
#   1. Seed a course with confirmed concepts/edges at varying evidence,
#      one unresolved misconception, and validated question_bank
#      entries for at least some scoped concepts
#   2. Configure an exam ~20 days out with that scope
#   3. Call getExamPlan(courseId)
```

**Expected outcome**: four stages spanning today through the exam
date; the diagnostic stage's concepts are real, low-evidence concepts
within scope; every selected concept/question is traceable to real
course/learner state.

### B3. A close exam still produces a usable, honest plan

```bash
#   1. Configure a second exam 2 days out
#   2. Call getExamPlan(courseId)
```

**Expected outcome**: a plan still returns, compressed into whichever
stages fit 2 real days -- never a refusal, never a stage claiming more
time than exists (FR-006/SC-005).

### B4. Readiness reflects real state, distinctly

```bash
#   1. Call getExamReadiness(courseId) for B2's course
```

**Expected outcome**: the scope's real mastery breakdown; the
unresolved-misconception concept is distinctly listed; a scoped
concept with zero evidence appears in `untouched`, not `unverified`.

### B5. Evidence and time changes are reflected without reconfiguring

```bash
#   1. Commit new real evidence (via deterministic-grading's existing
#      grading actions) on one of B2's scoped concepts
#   2. Call getExamPlan/getExamReadiness again for the same course
```

**Expected outcome**: the new evidence is reflected in both -- no
manual refresh or reconfiguration step (FR-009/SC-004).

### B6. An exam whose date has passed is reported honestly

```bash
#   1. Configure an exam with a past date (or wait out one of the
#      above configs)
#   2. Call getExamPlan(courseId)
```

**Expected outcome**: `{ error: "exam_date_passed" }`, never a plan for
time that no longer exists (FR-010).
