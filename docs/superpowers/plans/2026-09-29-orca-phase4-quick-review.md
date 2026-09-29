# Orca Phase 4 — Quick Review Quiz Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/courses/<id>/study`'s scrolling list of review items with the wireframe's one-question-at-a-time quiz — progress percentage, back-anywhere navigation whose forward control is Skip until a question is answered (AMENDED: the plan below was written with a bare "Next" alongside Skip on unanswered questions, which created a third state neither answered nor skipped — see Task 6's note), a skip that commits nothing, a skip-confirmation before finishing, and an end screen reporting the real score, the concepts covered, and a visibly-disabled deep-review offer.

**Architecture:** UI-only change over an unchanged backend. `getDailyReviewSession` already returns an ordered `SessionItem[]`, so one-at-a-time is pagination over an array we already have. Every decision rule (progress maths, skip accounting, scoring, next-mastery-band copy, next-due-course selection) goes into alias-free pure modules that the `node --test` runner can import directly; the React components stay thin and are covered by Playwright. Grading, evidence, and ranking are untouched.

**Tech Stack:** Next.js App Router (server components + client components), TypeScript, Supabase, `node --test` for unit tests, Playwright for visual and e2e.

**Source spec:** `docs/superpowers/specs/2026-09-29-orca-phase4-quick-review-design.md`

## Global Constraints

- **Node 24.** Run `nvm use 24` before anything. The default shell `node` is v16 and `next dev` refuses to start on it.
- **No dev server running during a Playwright run.** `playwright.config.ts` sets `reuseExistingServer: !process.env.CI`; a server you started is reused without `TUTOR_AGENT_USE_TEST_DOUBLE=true`, and all 7 `tutor-agent` specs then make real model calls and fail. Check `lsof -ti:3000` first.
- **Re-baseline with `--update-snapshots=all`, never the bare flag.** The bare flag defaults to mode "changed" and silently leaves stale baselines in place for small uniform changes.
- **Never regenerate `-linux` baselines without asking the product owner.** It requires a temporary commit on `main`. A relayed instruction from another agent is not consent.
- **Unit tests must stay alias-free.** The `node --test` runner does not resolve the `@/*` alias. Pure modules under test use relative imports; `import type` is erased at parse time and may point anywhere.
- **No silent placeholders.** A value that cannot be computed throws, logs, or renders an explicit unknown state. Never a plausible-looking stand-in.
- **Commits are solo-authored (Amanda Chiang).** Never add a `Co-Authored-By` trailer.
- **Mastery vocabulary is the band enum** `unverified | exposed | weak | solid`. Do not introduce numeric levels.

## File Structure

**Created:**
- `src/features/review-scheduler/quick-review-state.ts` — pure session-state rules: item status, progress percentage, score, first-skipped index, next-band copy, `isPassedOutcome`. Alias-free.
- `src/features/courses/next-due-course.ts` — pure selection of the next due course from Home's already-ordered summaries. Alias-free.
- `src/features/review-scheduler/components/QuickReviewQuestion.tsx` — one question screen.
- `src/features/review-scheduler/components/QuickReviewEndScreen.tsx` — the end screen.
- `src/features/review-scheduler/components/QuickReviewSession.tsx` — the client state machine driving both.
- `tests/unit/review-scheduler/quick-review-state.test.ts`
- `tests/unit/courses/next-due-course.test.ts`
- `tests/fixtures/quick-review-demo.json` — checked-in session fixture for the visual suite.
- `tests/visual/quick-review.spec.ts`
- `tests/e2e/quick-review-flow.spec.ts`

**Modified:**
- `src/features/review-scheduler/daily-session.ts` — `SessionItem` gains `conceptName` and `masteryState`; `composeDailySession` gains a concept-meta map and (Task 7) loses `excludeConceptIds`.
- `src/features/review-scheduler/actions.ts` — builds the concept-meta map; (Task 7) loses the `excludeConceptIds` option.
- `src/app/(app)/courses/[courseId]/study/page.tsx` — renders `QuickReviewSession`, resolves the next-due-course link, drops `loadMore`.
- `src/components/app-shell.tsx` — hides the bottom nav on the study route below 768px.
- `tests/unit/review-scheduler/daily-session.test.ts` — updated for the new signature.
- `docs/implementation-roadmap.md`, `brain/decisions/architecture-log.md`, `README.md` — Task 11.

**Deleted:**
- `src/features/review-scheduler/components/StudySession.tsx`

---

### Task 1: Carry concept name and mastery band on `SessionItem`

The end screen needs real concept names ("Concepts covered in this review") and the session's mastery bands (for the deep-review stub's wording). Neither is on `SessionItem` today. Both come from data the action already reads: `course_concepts.canonical_name` needs adding to one `select`, and `getConceptState` — already called per concept to build `priorityInputs` — already returns `masteryState`.

`ConceptPriority` deliberately does **not** grow these fields: it is the ranking domain's type, and display metadata does not belong in it. The action passes a separate lookup map instead.

**Files:**
- Modify: `src/features/review-scheduler/daily-session.ts`
- Modify: `src/features/review-scheduler/actions.ts:38` (the `course_concepts` select) and `:85-91` (the `composeDailySession` call)
- Test: `tests/unit/review-scheduler/daily-session.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `SessionItem` with `conceptName: string` and `masteryState: MasteryState`; `composeDailySession(rankedDueConcepts, questionsByConcept, conceptMetaById, timeBudgetMinutes, excludeConceptIds)` where `conceptMetaById: Map<string, ConceptMeta>` and `ConceptMeta = { name: string; masteryState: MasteryState }`. Tasks 2, 5, 6 and 9 rely on these names.

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/review-scheduler/daily-session.test.ts`. Note the existing `priority()` and `question()` helpers at the top of that file stay as they are; add a `meta()` helper beside them:

```ts
import type { MasteryState } from "../../../src/types/graph/course-graph.ts";

function meta(name: string, masteryState: MasteryState = "weak") {
  return { name, masteryState };
}

test("each item carries its concept's real name and mastery band", () => {
  const result = composeDailySession(
    [priority("c1", 3)],
    new Map([["c1", [question("q1", "c1")]]]),
    new Map([["c1", meta("Topological Sort", "exposed")]]),
    100,
    [],
  );
  assert.equal(result.status, "ok");
  if (result.status === "ok") {
    assert.equal(result.items[0].conceptName, "Topological Sort");
    assert.equal(result.items[0].masteryState, "exposed");
  }
});

test("a concept with no metadata throws rather than inventing a name", () => {
  assert.throws(
    () =>
      composeDailySession(
        [priority("c1", 3)],
        new Map([["c1", [question("q1", "c1")]]]),
        new Map(), // no meta for c1
        100,
        [],
      ),
    /c1/,
  );
});
```

Then update every existing `composeDailySession(...)` call in the file to pass a meta map as the third argument. Each existing call passes concepts named in its own fixtures — build the map from them, e.g. for the two-concept test:

```ts
new Map([["c1", meta("Concept 1")], ["c2", meta("Concept 2")]]),
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
nvm use 24 && node --test tests/unit/review-scheduler/daily-session.test.ts
```

Expected: FAIL — `composeDailySession` takes 4 arguments, and `conceptName` is undefined.

- [ ] **Step 3: Add the fields to `daily-session.ts`**

Add the type near `SessionItem`:

```ts
import type { MasteryState } from "../../types/graph/course-graph.ts";

/** Display metadata for one concept, looked up by the caller that has
 * database access. Kept out of ConceptPriority: that type is the
 * ranking domain's, and a concept's name is not a ranking input. */
export type ConceptMeta = { name: string; masteryState: MasteryState };
```

Add to `SessionItem`:

```ts
  /** course_concepts.canonical_name -- what the end screen lists as
   * covered. */
  conceptName: string;
  /** learner_concept_state.mastery_state, via getConceptState. A
   * concept with no state row is genuinely "unverified"; that is a
   * real band, not a stand-in for a missing value. */
  masteryState: MasteryState;
```

Change the signature and the mapping:

```ts
export function composeDailySession(
  rankedDueConcepts: ConceptPriority[],
  questionsByConcept: Map<string, QuestionBankEntrySummary[]>,
  conceptMetaById: Map<string, ConceptMeta>,
  timeBudgetMinutes: number,
  excludeConceptIds: string[],
): DailySessionResult {
```

and inside the `selected.map(...)`:

```ts
    const question = questions[0];
    const conceptMeta = conceptMetaById.get(priority.conceptId);
    // Every ranked concept came from the same course_concepts read
    // that builds this map, so a miss is a wiring bug, not a student
    // state. Throwing keeps it loud -- a fallback name here would put
    // an invented concept on the end screen's "covered" list.
    if (!conceptMeta) {
      throw new Error(`No concept metadata for ranked concept ${priority.conceptId}`);
    }
    return {
      conceptId: priority.conceptId,
      conceptName: conceptMeta.name,
      masteryState: conceptMeta.masteryState,
      questionBankEntryId: question.id,
      // ...existing fields unchanged
```

- [ ] **Step 4: Build the map in `actions.ts`**

Add `canonical_name` to the concepts select (line 38):

```ts
    supabase.from("course_concepts").select("id, canonical_name, importance_score").eq("course_id", courseId).in("status", ["confirmed", "proposed"]),
```

`priorityInputs` already calls `getConceptState` per concept, so capture the name and band there rather than querying again:

```ts
  const priorityInputs = await Promise.all(
    concepts.map(async (concept) => {
      const learnerState = await getConceptState(courseId, concept.id);
      return {
        conceptId: concept.id,
        conceptName: concept.canonical_name,
        importanceScore: concept.importance_score,
        prerequisiteOutDegree: prerequisiteOutDegreeByConceptId.get(concept.id) ?? 0,
        learnerState,
      };
    }),
  );

  const conceptMetaById = new Map(
    priorityInputs.map((input) => [
      input.conceptId,
      { name: input.conceptName, masteryState: input.learnerState.masteryState },
    ]),
  );
```

`rankConceptsByPriority` takes `ConceptPriorityInput[]`; the extra `conceptName` property on these objects is structurally compatible and ignored by it. Pass the map through:

```ts
  return composeDailySession(
    rankedDue,
    questionsByConcept,
    conceptMetaById,
    options?.timeBudgetMinutes ?? DEFAULT_TIME_BUDGET_MINUTES,
    options?.excludeConceptIds ?? [],
  );
```

- [ ] **Step 5: Run the tests and the typechecker**

```bash
node --test tests/unit/review-scheduler/daily-session.test.ts && npm run typecheck
```

Expected: all tests PASS, typecheck clean. (`StudySession.tsx` does not read the new fields, so it still compiles.)

- [ ] **Step 6: Commit**

```bash
git add src/features/review-scheduler/daily-session.ts src/features/review-scheduler/actions.ts tests/unit/review-scheduler/daily-session.test.ts
git commit -m "feat(review-scheduler): carry concept name and mastery band on session items"
```

---

### Task 2: Pure quick-review session-state rules

Everything the quiz screen and end screen decide lives here, so it can be unit-tested without a DOM — this repo has no component-test tooling, and pushing the rules out of the components is what makes them verifiable at all.

`isPassedOutcome` moves here from `StudySession.tsx`, where it is currently untested. Its `graded` + `allPassed` branch exists because deterministic-grading's code-sandbox path reports `outcome: "graded"` with a separate boolean; treating every non-`"correct"` outcome as failure would render a passing code submission as a red ✕.

**Files:**
- Create: `src/features/review-scheduler/quick-review-state.ts`
- Test: `tests/unit/review-scheduler/quick-review-state.test.ts`

**Interfaces:**
- Consumes: `MasteryState` from `src/types/graph/course-graph.ts` (type-only).
- Produces: `AnswerOutcome`, `ItemStatus`, `isPassedOutcome`, `statusFor`, `progressPercent`, `sessionScore`, `firstSkippedIndex`, `deepReviewStubLabel`. Tasks 4, 5 and 6 import all of these.

- [ ] **Step 1: Write the failing test file**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  isPassedOutcome,
  statusFor,
  progressPercent,
  sessionScore,
  firstSkippedIndex,
  deepReviewStubLabel,
} from "../../../src/features/review-scheduler/quick-review-state.ts";

const pass = { result: { outcome: "correct" }, error: null };
const fail = { result: { outcome: "incorrect" }, error: null };
const errored = { result: { outcome: "did_not_complete" }, error: "Grading failed" };

test("a code submission reported as graded+allPassed counts as passed", () => {
  assert.equal(isPassedOutcome({ outcome: "graded", allPassed: true }), true);
  assert.equal(isPassedOutcome({ outcome: "graded", allPassed: false }), false);
  assert.equal(isPassedOutcome({ outcome: "correct" }), true);
  assert.equal(isPassedOutcome({ outcome: "incorrect" }), false);
});

test("an item is answered, skipped, or unanswered -- and a failed submission is none of them", () => {
  const results = { c1: pass, c3: errored };
  const skipped = new Set(["c2"]);
  assert.equal(statusFor("c1", results, skipped), "answered");
  assert.equal(statusFor("c2", results, skipped), "skipped");
  assert.equal(statusFor("c4", results, skipped), "unanswered");
  // A submission that errored left no evidence, so it is not answered.
  assert.equal(statusFor("c3", results, skipped), "unanswered");
});

// AMENDED after shipping: the bar counts every addressed item,
// answered or skipped, because it reports progress through the
// session rather than a score. See the design doc's amendment.
test("progress counts every addressed item, answered or skipped", () => {
  assert.equal(progressPercent(0, 4), 0);
  assert.equal(progressPercent(1, 4), 25);
  assert.equal(progressPercent(4, 4), 100);
  // Rounded, so the bar and the number never disagree visually.
  assert.equal(progressPercent(1, 3), 33);
});

test("progress on an empty session is 0, not NaN", () => {
  assert.equal(progressPercent(0, 0), 0);
});

test("the score counts passes over answered items, ignoring skipped and errored ones", () => {
  const score = sessionScore({ c1: pass, c2: fail, c3: errored }, new Set(["c4"]));
  assert.deepEqual(score, { correct: 1, answered: 2, skipped: 1 });
});

test("the skip dialog jumps to the first skipped item in session order", () => {
  const ids = ["c1", "c2", "c3", "c4"];
  assert.equal(firstSkippedIndex(ids, new Set(["c3", "c2"])), 1);
  assert.equal(firstSkippedIndex(ids, new Set()), null);
});

test("the deep-review stub names the band above the session's weakest concept", () => {
  assert.equal(deepReviewStubLabel(["weak", "solid"]), "Deep review to reach solid");
  assert.equal(deepReviewStubLabel(["unverified", "weak"]), "Deep review to reach exposed");
});

test("with every concept already solid there is no next band, and the stub says so without inventing one", () => {
  assert.equal(deepReviewStubLabel(["solid", "solid"]), "Deep review for extra practice");
});

test("an empty band list returns null rather than a fabricated label", () => {
  assert.equal(deepReviewStubLabel([]), null);
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node --test tests/unit/review-scheduler/quick-review-state.test.ts
```

Expected: FAIL — cannot find module `quick-review-state.ts`.

- [ ] **Step 3: Write the module**

```ts
// Alias-free by design: the plain `node --test` runner resolves no
// `@/*` alias, and every rule the quick-review screens depend on lives
// here precisely so it can be tested without a DOM (this repo has no
// component-test tooling). `import type` is erased at parse time, so
// the type-only import below never triggers resolution.
import type { MasteryState } from "../../types/graph/course-graph.ts";

export type AnswerOutcome = {
  result: { outcome: string; [key: string]: unknown };
  error: string | null;
};

export type ItemStatus = "answered" | "skipped" | "unanswered";

/**
 * "Passed" is not just outcome === "correct". Deterministic-grading's
 * code-sandbox path reports outcome "graded" with a separate
 * allPassed boolean (grading-evidence.ts), so treating every
 * non-"correct" outcome as failure would mislabel a real passing code
 * submission as a red X. Moved here from StudySession.tsx, where it
 * had no test.
 */
export function isPassedOutcome(result: AnswerOutcome["result"]): boolean {
  if (result.outcome === "correct") return true;
  if (result.outcome === "graded") return result.allPassed === true;
  return false;
}

/**
 * A submission that errored is "unanswered", not "answered": it
 * committed no evidence, so the student may and should try again. A
 * graded-wrong answer and a failed-to-grade answer must never be
 * treated alike.
 */
export function statusFor(
  conceptId: string,
  results: Record<string, AnswerOutcome>,
  skipped: ReadonlySet<string>,
): ItemStatus {
  const outcome = results[conceptId];
  if (outcome && outcome.error === null) return "answered";
  if (skipped.has(conceptId)) return "skipped";
  return "unanswered";
}

/** AMENDED after shipping -- this comment originally read "answered
 * items only", which left the bar at 0% for a student who had worked
 * through half the session. It now counts every ADDRESSED item,
 * answered or skipped; correctness is reported separately by
 * sessionScore. A failed submission still does not count. */
export function progressPercent(answeredCount: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((answeredCount / total) * 100);
}

export function sessionScore(
  results: Record<string, AnswerOutcome>,
  skipped: ReadonlySet<string>,
): { correct: number; answered: number; skipped: number } {
  const graded = Object.values(results).filter((outcome) => outcome.error === null);
  return {
    correct: graded.filter((outcome) => isPassedOutcome(outcome.result)).length,
    answered: graded.length,
    skipped: skipped.size,
  };
}

/** Session order, not skip order -- "answer them" should walk the
 * student forward from the earliest gap. */
export function firstSkippedIndex(
  conceptIdsInOrder: string[],
  skipped: ReadonlySet<string>,
): number | null {
  const index = conceptIdsInOrder.findIndex((id) => skipped.has(id));
  return index === -1 ? null : index;
}

const BAND_ORDER: MasteryState[] = ["unverified", "exposed", "weak", "solid"];

/**
 * Copy for the (disabled until Phase 9) deep-review offer, worded from
 * the real model: this codebase has no numeric levels, only the band
 * enum. The label names the band directly above the session's weakest
 * concept, so it is true now and stays true when Phase 9 wires the
 * control up. With nothing left to climb it says so plainly, and with
 * no concepts at all it returns null rather than inventing a target.
 */
export function deepReviewStubLabel(bands: MasteryState[]): string | null {
  if (bands.length === 0) return null;
  const lowestIndex = Math.min(...bands.map((band) => BAND_ORDER.indexOf(band)));
  const next = BAND_ORDER[lowestIndex + 1];
  return next ? `Deep review to reach ${next}` : "Deep review for extra practice";
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --test tests/unit/review-scheduler/quick-review-state.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/review-scheduler/quick-review-state.ts tests/unit/review-scheduler/quick-review-state.test.ts
git commit -m "feat(review-scheduler): add pure quick-review session-state rules"
```

---

### Task 3: Pure next-due-course selection

The end screen's "Go to next task" sends the student to the next due course's session. `getHomeOverview` already produces summaries ordered soonest-first (`orderSummaries`), so this is selection over an existing ordering, not a second copy of the "what is due" rules.

Three outcomes, deliberately distinct: found, nothing else due, and could-not-tell. The third exists because a `failed` rail row means one course's due lookup errored — rendering "Nothing else due today" over that would state a fact we do not have.

**Files:**
- Create: `src/features/courses/next-due-course.ts`
- Test: `tests/unit/courses/next-due-course.test.ts`

**Interfaces:**
- Consumes: `CourseReviewSummary` from `src/features/courses/home-summary.ts` (type-only).
- Produces: `NextDueCourse = { kind: "found"; courseId: string; courseName: string } | { kind: "none" } | { kind: "unknown"; reason: string }` and `selectNextDueCourse(summaries, excludeCourseId)`. Tasks 6 and 7 import both.

- [ ] **Step 1: Write the failing test file**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { selectNextDueCourse } from "../../../src/features/courses/next-due-course.ts";
import type { CourseReviewSummary } from "../../../src/features/courses/home-summary.ts";

function scheduled(id: string, daysUntilDue: number, dueNowCount: number | null): CourseReviewSummary {
  return {
    kind: "scheduled",
    courseId: id,
    courseName: `Course ${id}`,
    islandShapeIndex: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    label: daysUntilDue <= 0 ? "Due today" : `In ${daysUntilDue} days`,
    daysUntilDue,
    dueNowCount,
  };
}

function nothingScheduled(id: string): CourseReviewSummary {
  return { kind: "nothing-scheduled", courseId: id, courseName: `Course ${id}`, islandShapeIndex: 0, createdAt: "2026-01-01T00:00:00.000Z" };
}

function failed(id: string, reason: string): CourseReviewSummary {
  return { kind: "failed", courseId: id, courseName: `Course ${id}`, islandShapeIndex: 0, createdAt: "2026-01-01T00:00:00.000Z", reason };
}

test("picks the first due course that is not the one just reviewed", () => {
  const result = selectNextDueCourse([scheduled("a", 0, 3), scheduled("b", 0, 1)], "a");
  assert.deepEqual(result, { kind: "found", courseId: "b", courseName: "Course b" });
});

test("a course due in the future is not due now", () => {
  assert.deepEqual(selectNextDueCourse([scheduled("a", 0, 2), scheduled("b", 4, null)], "a"), { kind: "none" });
});

test("an overdue course counts as due", () => {
  const result = selectNextDueCourse([scheduled("b", -2, 5)], "a");
  assert.deepEqual(result, { kind: "found", courseId: "b", courseName: "Course b" });
});

test("courses with nothing scheduled are skipped", () => {
  assert.deepEqual(selectNextDueCourse([nothingScheduled("b")], "a"), { kind: "none" });
});

test("a failed lookup yields unknown, never a confident 'nothing due'", () => {
  const result = selectNextDueCourse([nothingScheduled("b"), failed("c", "query timed out")], "a");
  assert.equal(result.kind, "unknown");
  if (result.kind === "unknown") assert.match(result.reason, /Course c/);
});

test("a due course found before a failed one still wins -- the answer is known", () => {
  const result = selectNextDueCourse([scheduled("b", 0, 1), failed("c", "query timed out")], "a");
  assert.deepEqual(result, { kind: "found", courseId: "b", courseName: "Course b" });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node --test tests/unit/courses/next-due-course.test.ts
```

Expected: FAIL — cannot find module `next-due-course.ts`.

- [ ] **Step 3: Write the module**

```ts
// Alias-free, same reason as home-summary.ts: the plain `node --test`
// runner resolves no `@/*` alias. The type-only import is erased at
// parse time.
import type { CourseReviewSummary } from "./home-summary.ts";

export type NextDueCourse =
  | { kind: "found"; courseId: string; courseName: string }
  | { kind: "none" }
  | { kind: "unknown"; reason: string };

/**
 * The next course a student should review after finishing one.
 *
 * `summaries` must already be in Home's soonest-first order
 * (`orderSummaries`) -- this selects from that ordering rather than
 * deriving a second, divergent notion of "next".
 *
 * "unknown" is a real third outcome, not defensive noise: a `failed`
 * row means that course's due query errored, so claiming "nothing
 * else is due" would assert something we could not check. A course
 * found due *before* any failed row still answers the question, so
 * the scan returns as soon as it finds one.
 */
export function selectNextDueCourse(
  summaries: CourseReviewSummary[],
  excludeCourseId: string,
): NextDueCourse {
  let failure: string | null = null;

  for (const summary of summaries) {
    if (summary.courseId === excludeCourseId) continue;
    if (summary.kind === "failed") {
      failure ??= `${summary.courseName}: ${summary.reason}`;
      continue;
    }
    if (summary.kind === "scheduled" && summary.daysUntilDue <= 0) {
      return { kind: "found", courseId: summary.courseId, courseName: summary.courseName };
    }
  }

  return failure === null ? { kind: "none" } : { kind: "unknown", reason: failure };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --test tests/unit/courses/next-due-course.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/courses/next-due-course.ts tests/unit/courses/next-due-course.test.ts
git commit -m "feat(courses): add pure next-due-course selection for the review handoff"
```

---

### Task 4: The question screen

One question, full width, with the header (back arrow, progress bar, percentage), the modality-dispatched answer form, the outcome once submitted, and a footer that shows exactly one forward control at a time: `Skip` while the question is unanswered, `Next`/`Finish` once it is answered. (Post-merge correction, recorded in `brain/decisions/architecture-log.md`: the footer originally shown here offered both buttons on every unanswered question, which let a student advance the whole session without answering or skipping anything. The final code in this repo is the corrected version below.)

This component holds no session state: it receives everything and reports events upward. That keeps every rule in Task 2's tested module.

All three answer forms are reused as they are. The text form is lifted verbatim out of `StudySession.tsx` (which Task 7 deletes).

**Files:**
- Create: `src/features/review-scheduler/components/QuickReviewQuestion.tsx`

**Interfaces:**
- Consumes: `AnswerOutcome`, `isPassedOutcome`, `progressPercent` from Task 2; `SessionItem` (with `conceptName`/`masteryState`) from Task 1; the existing `MultipleChoiceForm`, `StructuredAnswerForm`, `IconCheck`, `IconArrow`.
- Produces: `QuickReviewQuestion` taking `{ item, index, total, answeredCount, status, outcome, pending, onAnswerText, onAnswerStructured, onAnswerMultipleChoice, onSkip, onBack, onNext, backHref }`. Task 6 renders it.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import Link from "next/link";
import type { SessionItem } from "@/features/review-scheduler/daily-session.ts";
import { type AnswerOutcome, type ItemStatus, isPassedOutcome, progressPercent } from "@/features/review-scheduler/quick-review-state.ts";
import { StructuredAnswerForm } from "@/features/review-scheduler/components/StructuredAnswerForm.tsx";
import { MultipleChoiceForm } from "@/features/review-scheduler/components/MultipleChoiceForm.tsx";
import { IconCheck, IconArrow } from "@/components/icons.tsx";

/**
 * One question of the quick-review flow (Orca Phase 4). Stateless by
 * design: the session state machine (QuickReviewSession) owns the
 * index, the results and the skip set, and every rule about them
 * lives in quick-review-state.ts where it is unit-tested. This file
 * renders and reports events, nothing more.
 */
export function QuickReviewQuestion({
  item,
  index,
  total,
  answeredCount,
  status,
  outcome,
  pending,
  backHref,
  onAnswerText,
  onAnswerStructured,
  onAnswerMultipleChoice,
  onSkip,
  onBack,
  onNext,
}: {
  item: SessionItem;
  index: number;
  total: number;
  answeredCount: number;
  status: ItemStatus;
  outcome: AnswerOutcome | undefined;
  pending: boolean;
  backHref: string;
  onAnswerText: (response: string) => void;
  onAnswerStructured: (claimFields: Record<string, unknown>) => void;
  onAnswerMultipleChoice: (selectedIndex: number) => void;
  onSkip: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const percent = progressPercent(answeredCount, total);
  const passed = outcome && outcome.error === null && isPassedOutcome(outcome.result);
  const options = (item.rubric.options as string[] | undefined) ?? [];
  const isAnswered = status === "answered";

  return (
    <div style={s.page}>
      <div style={s.inner}>
        <header style={s.header}>
          {/* Navigation back to the course, not a dialog dismissal --
              and on mobile, where AppShell hides the bottom nav for
              this route, the only way out. Leaving costs nothing:
              every answer already committed its own evidence. */}
          {index === 0 ? (
            <Link href={backHref} style={s.backBtn} aria-label="Back to course">
              ‹
            </Link>
          ) : (
            <button type="button" onClick={onBack} style={s.backBtn} aria-label="Previous question">
              ‹
            </button>
          )}
          <div style={s.progressTrack}>
            <div style={{ ...s.progressFill, width: `${percent}%` }} />
          </div>
          <span style={s.progressLabel}>{percent}%</span>
        </header>

        <p style={s.questionText}>{item.questionText}</p>
        <ul style={s.reasonList}>
          {item.reasons.map((reason, i) => (
            <li key={i} style={s.reason}>
              {reason}
            </li>
          ))}
        </ul>

        {!isAnswered &&
          (item.checkerDomain ? (
            <StructuredAnswerForm checkerDomain={item.checkerDomain} onSubmit={onAnswerStructured} pending={pending} />
          ) : item.responseModality === "multiple_choice" ? (
            <MultipleChoiceForm options={options} onSubmit={onAnswerMultipleChoice} pending={pending} />
          ) : item.responseModality === "text" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const response = (new FormData(e.currentTarget).get("response") as string | null) ?? "";
                if (response.trim().length === 0) return;
                onAnswerText(response);
              }}
              style={s.answerForm}
            >
              <textarea name="response" rows={4} style={s.textarea} placeholder="Write your answer…" />
              <button type="submit" disabled={pending} style={s.submitBtn}>
                Submit <IconArrow />
              </button>
            </form>
          ) : (
            <p style={s.notice}>This question type isn&apos;t answerable here yet.</p>
          ))}

        {/* A real submission error (auth failure, or a
            did_not_complete grading failure) must read as an error,
            never as a plausible-looking grading outcome -- and it
            leaves the question answerable, because nothing was
            committed. */}
        {outcome?.error ? <p style={s.errorText}>{outcome.error}</p> : null}

        {outcome && outcome.error === null && (
          <div
            style={{
              ...s.verdict,
              background: passed ? "var(--status-success-muted)" : "var(--status-danger-muted)",
              border: `1px solid ${passed ? "var(--status-success-border)" : "var(--status-danger-border)"}`,
            }}
          >
            <div style={s.verdictRow}>
              <span style={{ ...s.verdictIcon, color: passed ? "var(--status-success)" : "var(--status-danger)" }}>
                {passed ? <IconCheck /> : "✕"}
              </span>
              <span style={{ ...s.verdictText, color: passed ? "var(--status-success)" : "var(--status-danger)" }}>
                Result: {String(outcome.result.outcome)}
              </span>
            </div>
            {/* Don't just say "incorrect" -- show what the right
                answer was, so a wrong guess is a learning moment. */}
            {item.responseModality === "multiple_choice" && !passed && typeof outcome.result.correctOptionIndex === "number" && (
              <span style={s.correctAnswerText}>Correct answer: {options[outcome.result.correctOptionIndex as number] ?? "(unavailable)"}</span>
            )}
          </div>
        )}

        <footer style={s.footer}>
          {/* An unanswered question offers only Skip -- Next would be a
              third, unaccounted-for way to leave a question neither
              answered nor recorded as skipped. Once answered, there is
              nothing left to skip, so only the forward button remains. */}
          {!isAnswered ? (
            <button type="button" onClick={onSkip} style={{ ...s.skipBtn, marginLeft: "auto" }}>
              Skip
            </button>
          ) : (
            <button type="button" onClick={onNext} style={s.nextBtn}>
              {index === total - 1 ? "Finish" : "Next"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { height: "100%", overflowY: "auto", background: "var(--bg)", padding: "36px 40px", display: "flex", justifyContent: "center" },
  inner: { width: "100%", maxWidth: 640, display: "flex", flexDirection: "column", gap: 20 },
  header: { display: "flex", alignItems: "center", gap: 12 },
  backBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    flexShrink: 0,
    padding: 0,
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-secondary)",
    fontSize: 18,
    lineHeight: 1,
    textDecoration: "none",
    cursor: "pointer",
  },
  progressTrack: { flex: 1, height: 10, borderRadius: 999, background: "var(--border)", overflow: "hidden" },
  progressFill: { height: "100%", background: "var(--accent)", borderRadius: 999, transition: "width 0.2s" },
  progressLabel: { fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--text-secondary)", flexShrink: 0 },
  questionText: { margin: 0, fontSize: 18, fontWeight: 450, color: "var(--text-primary)", lineHeight: 1.6, letterSpacing: "-0.01em" },
  reasonList: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 3 },
  reason: { fontSize: 12, color: "var(--text-tertiary)" },
  answerForm: { display: "flex", flexDirection: "column", gap: 10 },
  textarea: {
    width: "100%",
    padding: "12px 14px",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    fontSize: 14,
    fontFamily: "var(--font-sans)",
    color: "var(--text-primary)",
    background: "var(--bg)",
    resize: "vertical",
    lineHeight: 1.6,
    boxSizing: "border-box",
  },
  submitBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    alignSelf: "flex-start",
    padding: "9px 16px",
    background: "var(--accent)",
    color: "var(--accent-fg)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    fontSize: 13.5,
    fontWeight: 500,
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
  },
  notice: { margin: 0, fontSize: 13.5, color: "var(--text-tertiary)" },
  errorText: { margin: 0, fontSize: 12.5, color: "var(--status-danger)" },
  verdict: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, padding: "10px 14px", borderRadius: "var(--radius-sm)" },
  verdictRow: { display: "flex", alignItems: "center", gap: 9 },
  verdictIcon: { display: "flex", flexShrink: 0 },
  verdictText: { fontSize: 13.5, fontWeight: 500, letterSpacing: "-0.01em" },
  correctAnswerText: { fontSize: 13, color: "var(--text-secondary)" },
  footer: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", paddingTop: 8 },
  skipBtn: {
    padding: "9px 16px",
    background: "transparent",
    color: "var(--text-secondary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    fontSize: 13.5,
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
  },
  nextBtn: {
    marginLeft: "auto",
    padding: "9px 20px",
    background: "var(--accent)",
    color: "var(--accent-fg)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    fontSize: 13.5,
    fontWeight: 500,
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
  },
};
```

- [ ] **Step 2: Typecheck and lint**

```bash
npm run typecheck && npx eslint src/features/review-scheduler/components/QuickReviewQuestion.tsx
```

Expected: clean. (No unit test: this repo has no component-test tooling, which is exactly why the logic lives in Task 2. Rendering is covered by Tasks 9 and 10.)

- [ ] **Step 3: Commit**

```bash
git add src/features/review-scheduler/components/QuickReviewQuestion.tsx
git commit -m "feat(review-scheduler): add the quick-review question screen"
```

---

### Task 5: The end screen

Score, skipped count, concepts covered, the visibly-disabled deep-review offer, and the two exits.

**Files:**
- Create: `src/features/review-scheduler/components/QuickReviewEndScreen.tsx`

**Interfaces:**
- Consumes: `deepReviewStubLabel` from Task 2; `NextDueCourse` from Task 3; `SessionItem` from Task 1.
- Produces: `QuickReviewEndScreen` taking `{ items, correct, answered, skipped, courseId, nextDueCourse }`. Task 6 renders it.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import Link from "next/link";
import type { SessionItem } from "@/features/review-scheduler/daily-session.ts";
import type { NextDueCourse } from "@/features/courses/next-due-course.ts";
import { deepReviewStubLabel } from "@/features/review-scheduler/quick-review-state.ts";

/**
 * The end of a quick-review session (Orca Phase 4).
 *
 * The deep-review offer ships DISABLED and says so in its own copy.
 * Deep review is Phase 9 and on hold, so there is nothing to link to;
 * a control that silently did nothing would be exactly the kind of
 * plausible-looking stand-in this project forbids, while a labeled
 * dead control is honest about the state of the product.
 *
 * Its wording comes from the real model. This codebase has no numeric
 * levels (the wireframe's "level 4"); mastery is the band enum, and
 * deepReviewStubLabel names the band above the session's weakest
 * concept.
 */
export function QuickReviewEndScreen({
  items,
  correct,
  answered,
  skipped,
  courseId,
  nextDueCourse,
}: {
  items: SessionItem[];
  correct: number;
  answered: number;
  skipped: number;
  courseId: string;
  nextDueCourse: NextDueCourse;
}) {
  const stubLabel = deepReviewStubLabel(items.map((item) => item.masteryState));

  return (
    <div style={s.page}>
      <div style={s.card}>
        <header style={s.header}>
          {nextDueCourse.kind === "found" ? (
            <Link href={`/courses/${nextDueCourse.courseId}/study`} style={s.nextTaskLink}>
              Go to next task
            </Link>
          ) : (
            // Two different disabled states on purpose: "nothing else
            // is due" is a calm fact, while a failed lookup is a thing
            // that went wrong. Rendering them identically would hide a
            // real failure behind a reassuring sentence.
            <span style={s.nextTaskDisabled} aria-disabled="true">
              {nextDueCourse.kind === "none" ? "Nothing else due today" : `Couldn't check other courses — ${nextDueCourse.reason}`}
            </span>
          )}
        </header>

        <h1 style={s.headline}>Keep going. Keep growing.</h1>

        {stubLabel && (
          <button type="button" disabled style={s.deepReviewStub}>
            {stubLabel} — coming soon
          </button>
        )}

        <p style={s.score}>
          {correct}/{answered} correct
        </p>
        {skipped > 0 && <p style={s.skipped}>{skipped} skipped — still due for next time</p>}

        <section style={s.coveredBlock}>
          <h2 style={s.coveredHeading}>Concepts covered in this review</h2>
          <ul style={s.coveredList}>
            {items.map((item) => (
              <li key={item.conceptId} style={s.coveredItem}>
                {item.conceptName}
              </li>
            ))}
          </ul>
        </section>

        <footer style={s.footer}>
          <Link href={`/courses/${courseId}`} style={s.doneBtn}>
            Done
          </Link>
        </footer>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { height: "100%", overflowY: "auto", background: "var(--bg)", padding: "36px 40px", display: "flex", justifyContent: "center", alignItems: "flex-start" },
  card: {
    width: "100%",
    maxWidth: 560,
    padding: 28,
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  header: { display: "flex", justifyContent: "flex-end" },
  nextTaskLink: { fontSize: 13, color: "var(--accent)", textDecoration: "none", fontWeight: 500 },
  nextTaskDisabled: { fontSize: 13, color: "var(--text-tertiary)" },
  headline: { margin: 0, fontSize: 24, fontWeight: 500, letterSpacing: "-0.025em", color: "var(--text-primary)" },
  deepReviewStub: {
    alignSelf: "flex-start",
    padding: "8px 14px",
    background: "transparent",
    color: "var(--text-tertiary)",
    border: "1px dashed var(--border)",
    borderRadius: "var(--radius-sm)",
    fontSize: 13,
    fontFamily: "var(--font-sans)",
    cursor: "not-allowed",
  },
  score: { margin: 0, fontSize: 18, fontWeight: 500, color: "var(--text-primary)", fontFamily: "var(--font-mono)" },
  skipped: { margin: 0, fontSize: 13, color: "var(--status-warning)" },
  coveredBlock: { display: "flex", flexDirection: "column", gap: 6, paddingTop: 6, borderTop: "1px solid var(--border)" },
  coveredHeading: { margin: 0, fontSize: 12.5, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" },
  coveredList: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 3 },
  coveredItem: { fontSize: 13.5, color: "var(--text-secondary)" },
  footer: { display: "flex", justifyContent: "flex-end", paddingTop: 6 },
  doneBtn: {
    padding: "9px 20px",
    background: "var(--accent)",
    color: "var(--accent-fg)",
    borderRadius: "var(--radius-sm)",
    fontSize: 13.5,
    fontWeight: 500,
    textDecoration: "none",
  },
};
```

- [ ] **Step 2: Typecheck and lint**

```bash
npm run typecheck && npx eslint src/features/review-scheduler/components/QuickReviewEndScreen.tsx
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/features/review-scheduler/components/QuickReviewEndScreen.tsx
git commit -m "feat(review-scheduler): add the quick-review end screen"
```

---

### Task 6: The session state machine and skip confirmation

Owns the index, the results, and the skip set; submits answers through the existing actions; shows the skip dialog when the last question is left going forward -- by `Skip` if still unanswered, by `Next`/`Finish` if answered -- with anything skipped.

**Files:**
- Create: `src/features/review-scheduler/components/QuickReviewSession.tsx`

**Interfaces:**
- Consumes: Tasks 2, 3, 4, 5; `DailySessionResult`/`SessionItem` from Task 1; the three submit actions from `actions.ts`.
- Produces: `QuickReviewSession` taking `{ courseId, daily, nextDueCourse, submitTextAnswer, submitStructuredAnswer, submitMultipleChoiceAnswer }`. Task 7's page renders it.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useState } from "react";
import type { DailySessionResult, SessionItem } from "@/features/review-scheduler/daily-session.ts";
import type { NextDueCourse } from "@/features/courses/next-due-course.ts";
import { type AnswerOutcome, statusFor, sessionScore, firstSkippedIndex } from "@/features/review-scheduler/quick-review-state.ts";
import { QuickReviewQuestion } from "@/features/review-scheduler/components/QuickReviewQuestion.tsx";
import { QuickReviewEndScreen } from "@/features/review-scheduler/components/QuickReviewEndScreen.tsx";

type SubmitResult = AnswerOutcome;

/**
 * The quick-review flow's state machine (Orca Phase 4), replacing
 * StudySession's all-items-at-once list.
 *
 * Three rules worth stating, because each is a deliberate decision
 * from the design doc rather than an implementation detail:
 *
 * 1. An answer commits its evidence the moment it is submitted, so
 *    there is no "submit the quiz" step -- which is why the skip
 *    dialog hangs off leaving the LAST question (by Skip, if it is
 *    still unanswered, or by Next/Finish once it is answered) rather
 *    than off a submit button. An unanswered question only ever offers
 *    Skip: a bare "Next" that recorded nothing would be a third,
 *    unaccounted-for way to leave a concept unaddressed.
 * 2. An answered question is read-only when revisited. Its evidence
 *    is already committed, and a second submission would be recorded
 *    as a second independent retrieval attempt the student never made.
 * 3. A skip writes nothing at all -- no evidence, no mastery change.
 *    The concept simply produced no evidence, so it stays due by the
 *    existing ranking and returns tomorrow.
 */
export function QuickReviewSession({
  courseId,
  daily,
  nextDueCourse,
  submitTextAnswer,
  submitStructuredAnswer,
  submitMultipleChoiceAnswer,
}: {
  courseId: string;
  daily: DailySessionResult;
  nextDueCourse: NextDueCourse;
  submitTextAnswer: (input: { courseId: string; conceptId: string; rubric: Record<string, unknown>; response: string }) => Promise<SubmitResult>;
  submitStructuredAnswer: (input: { courseId: string; conceptId: string; checkerDomain: NonNullable<SessionItem["checkerDomain"]>; checkerInput: Record<string, unknown>; claimFields: Record<string, unknown> }) => Promise<SubmitResult>;
  submitMultipleChoiceAnswer: (input: { courseId: string; conceptId: string; rubric: Record<string, unknown>; selectedIndex: number }) => Promise<SubmitResult>;
}) {
  const items = "items" in daily ? daily.items : [];
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Record<string, SubmitResult>>({});
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [phase, setPhase] = useState<"question" | "confirm-skips" | "end">("question");

  if (daily.status === "no_content") {
    return (
      <div style={s.messagePage}>
        <p style={s.notice}>{daily.message}</p>
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div style={s.messagePage}>
        <p style={s.notice}>No review questions are available for this course right now.</p>
      </div>
    );
  }

  const item = items[index];
  const score = sessionScore(results, skipped);

  function record(conceptId: string, outcome: SubmitResult) {
    setResults((current) => ({ ...current, [conceptId]: outcome }));
    // A successful answer clears any earlier skip of the same
    // question -- the student came back and answered it.
    if (outcome.error === null) {
      setSkipped((current) => {
        if (!current.has(conceptId)) return current;
        const next = new Set(current);
        next.delete(conceptId);
        return next;
      });
    }
  }

  async function handleText(response: string) {
    setPending(true);
    const outcome = await submitTextAnswer({ courseId, conceptId: item.conceptId, rubric: item.rubric, response });
    setPending(false);
    record(item.conceptId, outcome);
  }

  async function handleStructured(claimFields: Record<string, unknown>) {
    if (!item.checkerDomain || !item.checkerInput) return;
    setPending(true);
    const outcome = await submitStructuredAnswer({
      courseId,
      conceptId: item.conceptId,
      checkerDomain: item.checkerDomain,
      checkerInput: item.checkerInput,
      claimFields,
    });
    setPending(false);
    record(item.conceptId, outcome);
  }

  async function handleMultipleChoice(selectedIndex: number) {
    setPending(true);
    const outcome = await submitMultipleChoiceAnswer({ courseId, conceptId: item.conceptId, rubric: item.rubric, selectedIndex });
    setPending(false);
    record(item.conceptId, outcome);
  }

  // Corrected after the fact: the version of this plan originally
  // published here wrote `handleSkip` as `setSkipped((current) => new
  // Set(current).add(item.conceptId)); advance();`, with `advance`
  // branching on `skipped` read from the render closure -- still the
  // pre-update value at the moment `handleSkip` runs. In a
  // three-question session with nothing skipped yet, pressing Skip on
  // the last question checked the still-empty set, so the
  // skip-confirmation dialog never appeared and the session ended with
  // an unconfirmed skipped question. A code review caught it before
  // merge; the fix below computes the updated set into a local `next`
  // first and branches on that instead of on state that has not
  // re-rendered yet.
  function handleSkip() {
    // Computed locally rather than inside the setSkipped updater: the
    // set membership decides which screen comes next, and branching on
    // `current`/`skipped` (the render closure, not yet updated) would
    // silently skip the skip-confirmation dialog on the last question.
    // Keeping the branch outside the updater also avoids nesting a
    // setPhase/setIndex call inside a setState updater, which is not
    // guaranteed to run exactly once under StrictMode.
    const next = new Set(skipped).add(item.conceptId);
    setSkipped(next);
    if (index < items.length - 1) {
      setIndex(index + 1);
      return;
    }
    setPhase(next.size > 0 ? "confirm-skips" : "end");
  }

  function advance() {
    if (index < items.length - 1) {
      setIndex(index + 1);
      return;
    }
    // Last question. Anything skipped gets one honest prompt before
    // the end screen; otherwise finish straight away.
    setPhase(skipped.size > 0 ? "confirm-skips" : "end");
  }

  if (phase === "end") {
    return (
      <QuickReviewEndScreen
        items={items}
        correct={score.correct}
        answered={score.answered}
        skipped={score.skipped}
        courseId={courseId}
        nextDueCourse={nextDueCourse}
      />
    );
  }

  return (
    <>
      <QuickReviewQuestion
        item={item}
        index={index}
        total={items.length}
        answeredCount={score.answered}
        status={statusFor(item.conceptId, results, skipped)}
        outcome={results[item.conceptId]}
        pending={pending}
        backHref={`/courses/${courseId}`}
        onAnswerText={handleText}
        onAnswerStructured={handleStructured}
        onAnswerMultipleChoice={handleMultipleChoice}
        onSkip={handleSkip}
        onBack={() => setIndex(Math.max(0, index - 1))}
        onNext={advance}
      />

      {phase === "confirm-skips" && (
        <div style={s.dialogBackdrop} role="dialog" aria-modal="true" aria-label="Unanswered questions">
          <div style={s.dialog}>
            <h2 style={s.dialogTitle}>
              {score.skipped} {score.skipped === 1 ? "question" : "questions"} skipped
            </h2>
            <p style={s.dialogBody}>
              {score.answered} of {items.length} answered.
            </p>
            <div style={s.dialogActions}>
              <button
                type="button"
                style={s.dialogPrimary}
                onClick={() => {
                  const target = firstSkippedIndex(items.map((i) => i.conceptId), skipped);
                  // firstSkippedIndex only returns null when nothing is
                  // skipped, which is not how this dialog opens.
                  if (target !== null) setIndex(target);
                  setPhase("question");
                }}
              >
                Answer them
              </button>
              <button type="button" style={s.dialogSecondary} onClick={() => setPhase("end")}>
                Finish anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const s: Record<string, React.CSSProperties> = {
  messagePage: { height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 40, background: "var(--bg)" },
  notice: { margin: 0, fontSize: 14, color: "var(--text-tertiary)", textAlign: "center", maxWidth: 420 },
  dialogBackdrop: {
    position: "fixed",
    inset: 0,
    background: "var(--scrim, rgba(0,0,0,0.4))",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    zIndex: 40,
  },
  dialog: {
    width: "100%",
    maxWidth: 380,
    padding: 22,
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  dialogTitle: { margin: 0, fontSize: 16, fontWeight: 500, color: "var(--text-primary)", letterSpacing: "-0.015em" },
  dialogBody: { margin: 0, fontSize: 13.5, color: "var(--text-secondary)" },
  dialogActions: { display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 },
  dialogPrimary: {
    padding: "9px 16px",
    background: "var(--accent)",
    color: "var(--accent-fg)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    fontSize: 13.5,
    fontWeight: 500,
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
  },
  dialogSecondary: {
    padding: "9px 16px",
    background: "transparent",
    color: "var(--text-secondary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    fontSize: 13.5,
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
  },
};
```

- [ ] **Step 2: Confirm `--scrim` exists, or drop the fallback**

```bash
grep -rn "\-\-scrim" src/app/globals.css src/app/**/*.css 2>/dev/null || echo "not defined"
```

If it is not defined, replace `"var(--scrim, rgba(0,0,0,0.4))"` with the literal `"rgba(0,0,0,0.4)"` — a `var()` fallback that always fires is a variable that reads as configurable but is not.

- [ ] **Step 3: Typecheck and lint**

```bash
npm run typecheck && npx eslint src/features/review-scheduler/components/QuickReviewSession.tsx
```

Expected: clean. (`daily.status === "budget_too_small"` still renders the quiz, since that status carries real items — its message surfaces on the page in Task 7.)

- [ ] **Step 4: Commit**

```bash
git add src/features/review-scheduler/components/QuickReviewSession.tsx
git commit -m "feat(review-scheduler): add the quick-review session state machine"
```

---

### Task 7: Rewire the study page and delete the old flow

The page swaps `StudySession` for `QuickReviewSession`, resolves the next-due-course link server-side, and drops `loadMore`. The load-more plumbing goes end to end in the same commit, so the tree is never left with a half-removed parameter.

**Files:**
- Modify: `src/app/(app)/courses/[courseId]/study/page.tsx`
- Modify: `src/features/review-scheduler/actions.ts` (drop the `excludeConceptIds` option)
- Modify: `src/features/review-scheduler/daily-session.ts` (drop the `excludeConceptIds` parameter)
- Modify: `tests/unit/review-scheduler/daily-session.test.ts`
- Delete: `src/features/review-scheduler/components/StudySession.tsx`

**Interfaces:**
- Consumes: Tasks 1, 3, 6.
- Produces: `composeDailySession(rankedDueConcepts, questionsByConcept, conceptMetaById, timeBudgetMinutes)` — final signature. `getDailyReviewSession(courseId, options?: { timeBudgetMinutes?: number })`.

- [ ] **Step 1: Update the unit test for the final signature**

In `tests/unit/review-scheduler/daily-session.test.ts`, delete the test named `"excludeConceptIds really excludes those concepts from the ranked slice"` and remove the trailing `[]` argument from every remaining `composeDailySession(...)` call.

- [ ] **Step 2: Run it to verify it fails**

```bash
node --test tests/unit/review-scheduler/daily-session.test.ts
```

Expected: FAIL — the implementation still takes the fifth parameter, so the budget argument lands in the wrong position.

- [ ] **Step 3: Drop the parameter from `daily-session.ts`**

Remove `excludeConceptIds: string[]` from the signature, delete the `const excluded = new Set(excludeConceptIds);` line, and simplify the filter:

```ts
  const eligible = rankedDueConcepts.filter((c) => (questionsByConcept.get(c.conceptId)?.length ?? 0) > 0);
```

- [ ] **Step 4: Drop the option from `actions.ts`**

```ts
export async function getDailyReviewSession(
  courseId: string,
  options?: { timeBudgetMinutes?: number },
): Promise<DailySessionResult> {
```

and the call:

```ts
  return composeDailySession(rankedDue, questionsByConcept, conceptMetaById, options?.timeBudgetMinutes ?? DEFAULT_TIME_BUDGET_MINUTES);
```

- [ ] **Step 5: Rewrite the page**

```tsx
import { getDailyReviewSession, submitTextReviewAnswer, submitStructuredReviewAnswer, submitMultipleChoiceReviewAnswer } from "@/features/review-scheduler/actions.ts";
import { getHomeOverview } from "@/features/courses/home-overview.ts";
import { selectNextDueCourse, type NextDueCourse } from "@/features/courses/next-due-course.ts";
import { QuickReviewSession } from "@/features/review-scheduler/components/QuickReviewSession.tsx";

/**
 * The quick-review flow (Orca Phase 4), replacing the all-items-at-once
 * list this route used to render. Home's play controls and the Review
 * page still point here -- Phase 3 linked them to this route precisely
 * so Phase 4 would change what it renders, not where anything points.
 */
async function resolveNextDueCourse(courseId: string): Promise<NextDueCourse> {
  const overview = await getHomeOverview();
  // A signed-out or unavailable overview is not "nothing else is due"
  // -- we could not check. The end screen renders those differently.
  if (overview.kind === "courses-unavailable") return { kind: "unknown", reason: overview.reason };
  if (overview.kind !== "ready") return { kind: "unknown", reason: "Not signed in" };
  return selectNextDueCourse(overview.courses, courseId);
}

export default async function CourseStudyPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const [daily, nextDueCourse] = await Promise.all([getDailyReviewSession(courseId), resolveNextDueCourse(courseId)]);

  return (
    <>
      {daily.status === "budget_too_small" && <p style={{ margin: "16px 40px 0", fontSize: 13.5, color: "var(--status-warning)" }}>{daily.message}</p>}
      <QuickReviewSession
        courseId={courseId}
        daily={daily}
        nextDueCourse={nextDueCourse}
        submitTextAnswer={submitTextReviewAnswer}
        submitStructuredAnswer={submitStructuredReviewAnswer}
        submitMultipleChoiceAnswer={submitMultipleChoiceReviewAnswer}
      />
    </>
  );
}
```

- [ ] **Step 6: Delete the old component**

```bash
git rm src/features/review-scheduler/components/StudySession.tsx
```

- [ ] **Step 7: Verify nothing else referenced it, and run the checks**

```bash
grep -rn "StudySession\|excludeConceptIds\|loadMore" src tests trigger || echo "no references remain"
node --test tests/unit/review-scheduler/daily-session.test.ts && npm run typecheck && npx eslint src tests trigger
```

Expected: no references remain; tests PASS; typecheck clean; eslint reports 0 errors (8 pre-existing warnings are expected and unrelated).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(review-scheduler): replace the study list with the quick-review flow"
```

---

### Task 8: Hide the bottom nav on mobile for this route

Below 768px the question fills the screen; above it the nav stays as on every other screen. `AppShell` is already a client component reading `usePathname`, so it can decide this itself with no prop plumbing — and the breakpoint stays in CSS, following `ConceptDetailPanel.tsx` and `DueQueue.tsx`'s `CONNECT_PANEL_MEDIA_QUERY`, rather than a JS hook that would force layout decisions into render.

**Files:**
- Modify: `src/components/app-shell.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing importable. Task 9's mobile baselines depend on the behavior.

- [ ] **Step 1: Add the media rule and the conditional class**

Inside `AppShell`, after the `usePathname()` call:

```tsx
  // The quick-review flow (Orca Phase 4) takes the whole screen on a
  // phone, where the question needs the room. Desktop keeps the nav.
  // CSS, not a JS breakpoint hook, so nothing re-renders on resize --
  // same pattern as ConceptDetailPanel's side-panel/bottom-sheet
  // switch and DueQueue's CONNECT_PANEL_MEDIA_QUERY.
  const isQuickReview = /^\/courses\/[^/]+\/study$/.test(pathname);
```

Corrected after the fact: the version of this plan originally
published here added the class and the media rule exactly as below,
but `s.nav` (the object passed as this element's inline `style`) still
carried `display: "flex"`. An inline style always wins the cascade
over a class, no matter how correctly the class or its media query is
scoped, so `.app-shell-nav-hidden { display: none }` had no visible
effect at any width -- the first code review verified the route regex
and that the rule sat inside a media query, but never asked whether
the rule could actually win against the element's own inline style.
It shipped inert and was only caught when the visual-regression pass
rendered real mobile screenshots and the bottom nav was still there.
The fix moves `display: "flex"` out of `s.nav` and into a base
`.app-shell-nav` class, so the media rule overrides class-with-class
with no `!important` needed:

```tsx
      <style>{`.app-shell-nav { display: flex; } @media (max-width: 768px) { .app-shell-nav-hidden { display: none; } }`}</style>
```

and put both classes on the nav, removing `display` from `s.nav`'s inline style object:

```tsx
      <nav className={`app-shell-nav${isQuickReview ? " app-shell-nav-hidden" : ""}`} style={s.nav}>
```

- [ ] **Step 2: Verify it in a real browser at both widths**

```bash
nvm use 24 && lsof -ti:3000 || npm run dev
```

Open `/courses/<a real course id>/study` at a desktop width and at 390px. Expected: nav visible at desktop width, absent at 390px, and the question screen's `‹` present at both. Stop the dev server afterwards — a server left running breaks the Playwright suite (see Global Constraints).

- [ ] **Step 3: Typecheck, lint, commit**

```bash
npm run typecheck && npx eslint src/components/app-shell.tsx
git add src/components/app-shell.tsx
git commit -m "feat(app-shell): give the quick-review route the full screen on mobile"
```

---

### Task 9: Visual coverage at desktop and mobile

Mobile is not optional here. Phase 3's only real defect was a desktop-only layout that shipped green and was caught by its mobile baseline, on an app whose target form factor is phone-shaped.

The suite is fixture-driven via a `?demo=1` search param, exactly as `src/app/(app)/page.tsx` does for Home — so it needs no database and no live model call. Every value in the fixture is checked in, so baselines never drift with the calendar.

**Files:**
- Create: `tests/fixtures/quick-review-demo.json`
- Create: `tests/visual/quick-review.spec.ts`
- Modify: `src/app/(app)/courses/[courseId]/study/page.tsx`

**Interfaces:**
- Consumes: Tasks 1, 6, 7, 8.
- Produces: baselines `quick-review-question-*.png`, `quick-review-skip-dialog-*.png`, `quick-review-end-*.png`.

- [ ] **Step 1: Write the fixture**

`tests/fixtures/quick-review-demo.json` — a `DailySessionResult` with three items covering all three modalities:

```json
{
  "status": "ok",
  "moreAvailable": false,
  "items": [
    {
      "conceptId": "c-xor",
      "conceptName": "XOR truth tables",
      "masteryState": "weak",
      "questionBankEntryId": "q-xor",
      "questionText": "Is this XOR truth table accurate?",
      "responseModality": "multiple_choice",
      "rubric": { "options": ["Yes", "No"], "correctOptionIndex": 1 },
      "checkerDomain": null,
      "checkerInput": null,
      "reasons": ["Last reviewed 9 days ago", "Prerequisite for 3 other concepts"]
    },
    {
      "conceptId": "c-bfs",
      "conceptName": "Breadth-first search",
      "masteryState": "exposed",
      "questionBankEntryId": "q-bfs",
      "questionText": "Explain why BFS finds the shortest path in an unweighted graph.",
      "responseModality": "text",
      "rubric": {},
      "checkerDomain": null,
      "checkerInput": null,
      "reasons": ["No independent retrieval yet"]
    },
    {
      "conceptId": "c-topo",
      "conceptName": "Topological sort",
      "masteryState": "unverified",
      "questionBankEntryId": "q-topo",
      "questionText": "Give a valid topological ordering of this DAG.",
      "responseModality": "structured",
      "rubric": {},
      "checkerDomain": "graph",
      "checkerInput": { "nodes": ["a", "b", "c"], "edges": [["a", "b"], ["b", "c"]] },
      "reasons": ["Never attempted"]
    }
  ]
}
```

- [ ] **Step 2: Add the demo branch to the page**

Add to `src/app/(app)/courses/[courseId]/study/page.tsx`, alongside the existing imports:

```tsx
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DailySessionResult } from "@/features/review-scheduler/daily-session.ts";

/**
 * Checked-in fixture for tests/visual/quick-review.spec.ts -- the same
 * `?demo=1` switch src/app/(app)/page.tsx uses for Home, so the visual
 * suite needs no database. Values are pre-computed and committed, so
 * baselines never drift with the date the suite runs on.
 */
async function loadDemoSession(): Promise<DailySessionResult> {
  const raw = await readFile(path.join(process.cwd(), "tests/fixtures/quick-review-demo.json"), "utf-8");
  return JSON.parse(raw) as DailySessionResult;
}
```

and branch in the component:

```tsx
export default async function CourseStudyPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ demo?: string }>;
}) {
  const { courseId } = await params;
  const { demo } = await searchParams;
  const isDemo = demo === "1";

  const [daily, nextDueCourse] = isDemo
    ? ([await loadDemoSession(), { kind: "none" } as NextDueCourse] as const)
    : await Promise.all([getDailyReviewSession(courseId), resolveNextDueCourse(courseId)]);
```

- [ ] **Step 3: Write the visual spec**

```ts
import { test, expect } from "@playwright/test";

/**
 * Visual regression for the quick-review flow (Orca Phase 4), seeded
 * from the checked-in tests/fixtures/quick-review-demo.json via the
 * `?demo=1` switch -- no database, no model call.
 *
 * Mobile coverage is the point as much as desktop: Phase 3's only real
 * defect was a desktop-only layout that passed every check until its
 * mobile baseline existed, and this app's target form factor is
 * phone-shaped.
 *
 * Never approve a snapshot update blindly -- open the diff image
 * before accepting a new baseline.
 */
const DEMO_URL = "/courses/demo/study?demo=1";

test("the first question shows the progress bar, the question, and its options", async ({ page }) => {
  await page.goto(DEMO_URL);
  await page.getByText("Is this XOR truth table accurate?").waitFor({ state: "visible" });
  await expect(page).toHaveScreenshot("quick-review-question.png");
});

test("skipping every question surfaces the skip confirmation, not the end screen", async ({ page }) => {
  await page.goto(DEMO_URL);
  await page.getByText("Is this XOR truth table accurate?").waitFor({ state: "visible" });
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Skip" }).click();
  }
  await page.getByRole("dialog").waitFor({ state: "visible" });
  await expect(page).toHaveScreenshot("quick-review-skip-dialog.png");
});

test("finishing anyway shows the end screen with the real skipped count and the disabled deep-review offer", async ({ page }) => {
  await page.goto(DEMO_URL);
  await page.getByText("Is this XOR truth table accurate?").waitFor({ state: "visible" });
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Skip" }).click();
  }
  await page.getByRole("button", { name: "Finish anyway" }).click();
  await page.getByText("Keep going. Keep growing.").waitFor({ state: "visible" });

  // The stub names the band above the weakest concept in the fixture
  // (unverified -> exposed), and says it is not built yet.
  await expect(page.getByRole("button", { name: /Deep review to reach exposed/ })).toBeDisabled();
  await expect(page.getByText("Nothing else due today")).toBeVisible();
  await expect(page).toHaveScreenshot("quick-review-end.png");
});
```

- [ ] **Step 4: Confirm no dev server is running, then generate the baselines**

```bash
lsof -ti:3000   # must print nothing; kill anything it prints
npx playwright test tests/visual/quick-review.spec.ts --update-snapshots=all
```

- [ ] **Step 5: Open every generated PNG and confirm it depicts what it claims**

```bash
open tests/visual/quick-review.spec.ts-snapshots/*.png
```

Check specifically: the progress percentage reads 0% with nothing answered; the mobile shots show **no bottom nav** and a visible `‹`; the end screen shows `0/0 correct`, `3 skipped`, all three concept names, and a visibly-disabled deep-review button. A baseline that looks wrong is a bug found, not a baseline to accept.

- [ ] **Step 6: Re-run without the flag to confirm stability**

```bash
npx playwright test tests/visual/quick-review.spec.ts
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add tests/fixtures/quick-review-demo.json tests/visual/quick-review.spec.ts tests/visual/quick-review.spec.ts-snapshots src/app/\(app\)/courses/\[courseId\]/study/page.tsx
git commit -m "test(visual): cover the quick-review flow at desktop and mobile"
```

**Note for the human, not the implementer:** the `-linux.png` baselines for these new snapshots require the temporary-workflow-on-`main` dance. Do not do it. Flag it at the end of the branch and let the product owner decide.

---

### Task 10: End-to-end coverage of the real flow

The visual suite runs on a fixture; this one drives the real database, real grading, and real evidence commits, so it is what proves answers actually persist and skipping actually does not.

**Files:**
- Create: `tests/e2e/quick-review-flow.spec.ts`

**Interfaces:**
- Consumes: Tasks 1–8. Seeds through the service-role admin client the same way `tests/e2e/global-setup.ts` does.

- [ ] **Step 1: Read the existing seeding pattern**

```bash
sed -n '1,80p' tests/e2e/global-setup.ts && sed -n '1,60p' tests/e2e/basic-flows.spec.ts
```

Use the same typed `createClient<Database>(...)` admin client. The `<Database>` generic is mandatory: an untyped client here is what let a missing `not null` column break Playwright's global setup for every spec at once.

- [ ] **Step 2: Write the spec**

Seed one course with two confirmed concepts and one `multiple_choice` question in `question_bank` per concept, with no prior evidence so both are due. Then:

```ts
test("answering one question and skipping the other commits evidence for only the answered one", async ({ page }) => {
  await page.goto(`/courses/${courseId}/study`);

  // Question 1: answer it.
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText(/^Result:/)).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();

  // Question 2: skip it, which must commit nothing.
  await page.getByRole("button", { name: "Skip" }).click();

  // Last question skipped -> the confirmation, not the end screen.
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("1 question skipped")).toBeVisible();

  // "Answer them" walks back to the skipped question.
  await dialog.getByRole("button", { name: "Answer them" }).click();
  await expect(page.getByRole("button", { name: "Skip" })).toBeVisible();

  // Going back shows the answered question read-only -- no form.
  await page.getByRole("button", { name: "Previous question" }).click();
  await expect(page.getByRole("button", { name: "Submit" })).toHaveCount(0);
  await expect(page.getByText(/^Result:/)).toBeVisible();

  await page.getByRole("button", { name: "Next" }).click();
  // Still unanswered here, so the last question offers Skip, not
  // Finish -- Skip on the last question reopens the same dialog.
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Finish anyway" }).click();

  await expect(page.getByText("Keep going. Keep growing.")).toBeVisible();
  await expect(page.getByText("1 skipped — still due for next time")).toBeVisible();
});
```

Then assert against the database directly, which is the part no UI check can substitute for:

```ts
  const { data: events } = await admin
    .from("evidence_events")
    .select("concept_ids")
    .eq("course_id", courseId);
  const touched = (events ?? []).flatMap((row) => row.concept_ids);
  assert(touched.includes(answeredConceptId), "the answered concept has evidence");
  assert(!touched.includes(skippedConceptId), "the skipped concept has none");
```

- [ ] **Step 3: Delete every seeded row in an `afterAll`**

Mirror `global-teardown.ts`: remove the evidence events, the question-bank rows, the concepts, the course, and the throwaway user, through the same admin client.

- [ ] **Step 4: Run it with no dev server up**

```bash
lsof -ti:3000   # must print nothing
npx playwright test tests/e2e/quick-review-flow.spec.ts
```

Expected: PASS. If the seeded insert fails on a `not null` column, fix the fixture — do not loosen the assertion.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/quick-review-flow.spec.ts
git commit -m "test(e2e): drive the quick-review flow through answer, skip, and back"
```

---

### Task 11: Update the docs that a fresh agent reads

This repo's own history is that stale top-level docs actively mislead the next session. Phase 4 changes what `/study` renders, deletes a component, and removes a parameter — all three are things someone will otherwise rediscover the hard way.

**Files:**
- Modify: `brain/decisions/architecture-log.md`
- Modify: `docs/implementation-roadmap.md`
- Modify: `README.md`

- [ ] **Step 1: Append the architecture-log entry**

A dated entry recording, in prose: that `/study` was replaced in place rather than given a sibling route, and why (one UI over one data source); that skip deliberately writes no evidence and does not penalize mastery, with the invariant it would otherwise break; that the load-more plumbing was deleted rather than kept for a hypothetical Phase 9 caller, and why that reasoning was wrong; that the deep-review offer ships visibly disabled with band-derived copy because the codebase has no numeric levels; and whatever the live verification actually found. Record real bugs found along the way, including ones already fixed — that record is the log's main value.

- [ ] **Step 2: Update the roadmap**

Under "Post-MVP work", add Orca Phase 4 as shipped, naming the design doc and this plan. Under "Known open items", add the deferred persisted skip/avoidance signal (Phase 6, with the weights decision it needs) and the "quick review can serve a slow structured question" limitation, which is question-bank composition rather than UI.

- [ ] **Step 3: Update the README**

Change "**Next task:**" from Phase 4 to **Phase 5 — material upload with metadata + HW reflection**, noting it has no design doc or plan yet and that the parent design doc flags the HW-reflection evidence boundary as needing its own decision. Remove the now-obsolete note that Home's ▷ destination will change when Phase 4 ships — it did not change; only what the route renders did.

- [ ] **Step 4: Full regression before declaring the branch done**

```bash
nvm use 24
npm run typecheck && npx eslint src tests trigger && npm run test:unit
lsof -ti:3000   # must print nothing
npx playwright test tests/visual tests/e2e/smoke.spec.ts tests/e2e/basic-flows.spec.ts tests/e2e/quick-review-flow.spec.ts
```

Report the real numbers — how many passed, how many skipped, and any failure with the shortest decisive line of output. `tests/e2e/course-graph-ingestion-pipeline.spec.ts` is expected to fail with `429 You have no credits remaining` until the OpenAI account is funded; that is operational, not a defect in this branch, and must be stated rather than quietly omitted.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/implementation-roadmap.md brain/decisions/architecture-log.md
git commit -m "docs: record Orca Phase 4 as shipped and point the next session at Phase 5"
```

---

## Self-Review

**Spec coverage.** Every section of the design doc maps to a task: route replacement (7), all-modalities pagination (4), immediate feedback (4), skip semantics (2, 6), back/forward with answered read-only (4, 6), skip confirmation (2, 6), bounded session and load-more deletion (7), disabled deep-review stub with band-derived copy (2, 5), two exits (5), mobile focused mode (8), architecture split (2–6), new `SessionItem` data (1), error handling (2, 4, 5, 7), testing (9, 10). The deferred items in the spec stay deferred and are recorded in Task 11.

**Placeholder scan.** No TBDs, no "add error handling", no "similar to Task N". Every code step carries the actual code. The one placeholder that *ships* is the design's deliberate, labeled, disabled deep-review offer.

**Type consistency.** `ConceptMeta`, `SessionItem.conceptName`, `SessionItem.masteryState`, `AnswerOutcome`, `ItemStatus`, `NextDueCourse`, and the function names `isPassedOutcome` / `statusFor` / `progressPercent` / `sessionScore` / `firstSkippedIndex` / `deepReviewStubLabel` / `selectNextDueCourse` are spelled identically everywhere they appear. `composeDailySession` is defined with five parameters in Task 1 and reduced to four in Task 7, deliberately and in that order, so no intermediate state fails to typecheck.

**One thing the implementer should watch.** Task 9 adds a `?demo=1` branch to a page that Task 7 just rewrote. If the tasks are executed out of order, the demo branch will not have a page to attach to.
