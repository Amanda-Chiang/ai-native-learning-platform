# Multiple Exams Per Course Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a student configure more than one exam per course (currently `configureExam` silently overwrites any existing exam for that course), with a way to switch between, edit, and delete individual exams.

**Architecture:** `exam_configs` already permits multiple rows per `(user_id, course_id)` — no migration needed. The one-exam limit lives entirely in `src/features/exam-planner/actions.ts`'s CRUD logic and in every caller's "there is exactly one config" assumption. This plan removes that assumption layer by layer: actions first (insert-only `configureExam` + new `updateExamConfig`/`deleteExamConfig`/`listExamConfigs`, and `getExamPlan`/`getExamReadiness` keyed by `examConfigId` instead of `courseId`), then the Exam Plan page/component (a dropdown over all of a course's exams, with Add/Edit/Delete), then Today's dashboard aggregation (every exam competes for the nearest/upcoming slots, not just one per course).

**Tech Stack:** Next.js 16 App Router (Server Actions + Server Components), Supabase (Postgres + RLS), React (Client Components for interactive pieces), `node --test` for pure-logic unit tests, Playwright for live end-to-end verification.

**Design doc:** `docs/superpowers/specs/2026-09-26-multiple-exams-per-course-design.md`

## Global Constraints

- No database migration — `supabase/migrations/0008_exam_planner.sql`'s `exam_configs` table has no unique constraint blocking multiple rows per `(user_id, course_id)`.
- No name/label field on an exam — exams are distinguished purely by date (design decision).
- Past exams stay selectable in the dropdown (marked "(past)"), never hidden.
- Every exam (not just one per course) competes for Today's "nearest exam" banner and "Upcoming" top-3 sidebar.
- Pure-logic modules in `src/features/exam-planner/` use relative imports (`../foo/bar.ts`), never `@/`-aliased ones, so they stay loadable/testable without a live Supabase client — matches this feature's existing files (`stage-boundaries.ts`, `scoped-selection.ts`, etc.).
- Server Actions are passed into Client Components as props from the Server Component page, never imported directly into a `"use client"` file — matches this codebase's existing convention (`StudySession.tsx`, `ExamPlanner.tsx` today).
- Every mutation-then-refresh flow (Add/Edit/Delete) uses `window.location.reload()`, matching `handleConfigure`'s existing pattern — no new client-side refetch-the-list mechanism.

---

### Task 1: `configureExam` becomes insert-only; add `listExamConfigs`

**Files:**
- Modify: `src/features/exam-planner/actions.ts:118-181` (the `configureExam` function body, and remove `getExamConfig` at `183-190`)

**Interfaces:**
- Consumes: `resolveScopeExists(supabase, courseId, scopeConceptIds, scopeUnitIds)` (existing, unchanged, returns `{ unresolved: string[] }`), `rowToView(row: ExamConfigRow): ExamConfigView` (existing, unchanged).
- Produces: `configureExam(courseId, examDate, scopeConceptIds, scopeUnitIds): Promise<{ examConfigId: string | null; error: string | null }>` (same signature as today, new body), `listExamConfigs(courseId: string): Promise<ExamConfigView[]>` (new).

This task has no new pure logic (it's Supabase-coupled CRUD), so there's no failing-test-first cycle — verify with `tsc --noEmit` instead, matching how every other action in this codebase is verified before its live-verification pass at the end of this plan.

- [ ] **Step 1: Replace `configureExam`'s body to always insert**

Open `src/features/exam-planner/actions.ts`. Find the `configureExam` function (currently lines 118-181) and replace the whole function with:

```ts
export async function configureExam(
  courseId: string,
  examDate: string,
  scopeConceptIds: string[],
  scopeUnitIds: string[],
): Promise<{ examConfigId: string | null; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { examConfigId: null, error: "You must be signed in to configure an exam." };
  }

  // Rejects before writing anything (FR-001) -- same "resolve to a
  // real row before writing anything" discipline
  // assessment-generation-pipeline's requestQuestionGeneration already
  // established.
  const { unresolved } = await resolveScopeExists(supabase, courseId, scopeConceptIds, scopeUnitIds);
  if (unresolved.length > 0) {
    return {
      examConfigId: null,
      error: `Exam scope references concepts/units that aren't real, confirmed rows in this course: ${unresolved.join(", ")}.`,
    };
  }

  // Always a new row -- a course can have any number of exams
  // (2026-09-26 design). Editing an already-configured exam goes
  // through updateExamConfig instead, which targets one specific row.
  const { data: inserted, error } = await supabase
    .from("exam_configs")
    .insert({
      user_id: user.id,
      course_id: courseId,
      exam_date: examDate,
      scope_concept_ids: scopeConceptIds,
      scope_unit_ids: scopeUnitIds,
    })
    .select("id")
    .single();

  return { examConfigId: inserted?.id ?? null, error: error?.message ?? null };
}
```

- [ ] **Step 2: Delete `getExamConfig`**

Immediately below the function you just replaced, delete this whole function (it becomes unused once Task 5 moves its callers to `listExamConfigs`):

```ts
export async function getExamConfig(courseId: string): Promise<{ config: ExamConfigView | null; error: string | null }> {
  const supabase = await createClient();

  // RLS-scoped, no userId parameter accepted, same convention as every
  // other server action in this codebase.
  const { data, error } = await supabase.from("exam_configs").select("*").eq("course_id", courseId).maybeSingle();

  return { config: data ? rowToView(data) : null, error: error?.message ?? null };
}
```

(Its two callers — `exam-plan/page.tsx` and `today.ts` — still reference it right now; that's fine, they get fixed in Tasks 5 and 8. `tsc --noEmit` will show those two errors until then — expected and temporary.)

- [ ] **Step 3: Add `listExamConfigs`**

Add this new function right after `listScopeableConcepts` (currently ending around line 90):

```ts
/**
 * Every exam configured for a course, oldest date first -- powers the
 * Exam Plan page's dropdown and Today's per-course aggregation. RLS-
 * scoped (exam_configs_select_own), same convention as every other
 * list action in this codebase.
 */
export async function listExamConfigs(courseId: string): Promise<ExamConfigView[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("exam_configs").select("*").eq("course_id", courseId).order("exam_date");
  return (data ?? []).map(rowToView);
}
```

- [ ] **Step 4: Verify the file's own logic typechecks in isolation**

Run: `cd /Users/amandachiang/Downloads/School/Projects/ai-native-learning-platform && npx tsc --noEmit 2>&1 | grep "exam-planner/actions.ts"`

Expected: only errors about `getExamConfig` not existing, from `exam-plan/page.tsx` and `today.ts` (their own lines, not `actions.ts`'s). `actions.ts` itself should report no errors. If `actions.ts` itself has errors, fix them before continuing.

- [ ] **Step 5: Commit**

```bash
git add src/features/exam-planner/actions.ts
git commit -m "feat(exam-planner): configureExam always inserts; add listExamConfigs"
```

---

### Task 2: Add `updateExamConfig` and `deleteExamConfig`

**Files:**
- Modify: `src/features/exam-planner/actions.ts` (add two new exported functions after `listExamConfigs`)

**Interfaces:**
- Consumes: `resolveScopeExists` (existing).
- Produces: `updateExamConfig(examConfigId, examDate, scopeConceptIds, scopeUnitIds): Promise<{ error: string | null }>`, `deleteExamConfig(examConfigId: string): Promise<{ error: string | null }>`.

- [ ] **Step 1: Add `updateExamConfig`**

Add this function after `listExamConfigs`:

```ts
/**
 * Updates one specific exam by id -- unlike configureExam (always
 * inserts), this targets an already-existing row. Fetches the row's
 * own course_id first rather than trusting a separately-passed one
 * (there isn't one here at all -- the id is the only input, so the
 * scope-validity check below is always run against the row's real
 * course). RLS (exam_configs_update_own, user_id = auth.uid()) is the
 * authorization boundary, same as every other student-owned-row action
 * in this codebase.
 */
export async function updateExamConfig(
  examConfigId: string,
  examDate: string,
  scopeConceptIds: string[],
  scopeUnitIds: string[],
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("exam_configs")
    .select("course_id")
    .eq("id", examConfigId)
    .maybeSingle();
  if (fetchError || !existing) {
    return { error: `No exam found with id "${examConfigId}".` };
  }

  const { unresolved } = await resolveScopeExists(supabase, existing.course_id, scopeConceptIds, scopeUnitIds);
  if (unresolved.length > 0) {
    return {
      error: `Exam scope references concepts/units that aren't real, confirmed rows in this course: ${unresolved.join(", ")}.`,
    };
  }

  const { error } = await supabase
    .from("exam_configs")
    .update({
      exam_date: examDate,
      scope_concept_ids: scopeConceptIds,
      scope_unit_ids: scopeUnitIds,
      updated_at: new Date().toISOString(),
    })
    .eq("id", examConfigId);

  return { error: error?.message ?? null };
}
```

- [ ] **Step 2: Add `deleteExamConfig`**

Add this function right after `updateExamConfig`:

```ts
/**
 * Deletes one exam by id. Fetches first and reports an honest "not
 * found" rather than silently succeeding on a delete that matched zero
 * rows (a wrong or already-deleted id) -- same "confirm the row is
 * really there before acting" discipline confirmCandidate/
 * rejectCandidate use elsewhere in this codebase. RLS
 * (exam_configs_delete_own) still bounds this to the caller's own rows
 * regardless.
 */
export async function deleteExamConfig(examConfigId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("exam_configs")
    .select("id")
    .eq("id", examConfigId)
    .maybeSingle();
  if (fetchError || !existing) {
    return { error: `No exam found with id "${examConfigId}".` };
  }

  const { error } = await supabase.from("exam_configs").delete().eq("id", examConfigId);
  return { error: error?.message ?? null };
}
```

- [ ] **Step 3: Typecheck**

Run: `cd /Users/amandachiang/Downloads/School/Projects/ai-native-learning-platform && npx tsc --noEmit 2>&1 | grep "exam-planner/actions.ts"`

Expected: no output (no errors in this file).

- [ ] **Step 4: Commit**

```bash
git add src/features/exam-planner/actions.ts
git commit -m "feat(exam-planner): add updateExamConfig and deleteExamConfig"
```

---

### Task 3: `getExamPlan`/`getExamReadiness` key off `examConfigId`, not `courseId`

**Files:**
- Modify: `src/features/exam-planner/actions.ts` (the `getExamPlan` and `getExamReadiness` functions)

**Interfaces:**
- Consumes: `resolveScopedConceptIds(supabase, courseId, config)` (existing, unchanged signature — still takes `courseId` as an explicit param, now supplied from `config.course_id` instead of a function parameter).
- Produces: `getExamPlan(examConfigId: string): Promise<GetExamPlanResult>` (signature changes from `courseId` to `examConfigId`), `getExamReadiness(examConfigId: string): Promise<GetExamReadinessResult>` (same change). Return types (`GetExamPlanResult`, `GetExamReadinessResult`) are unchanged — callers that already check `"error" in plan` etc. don't need to change.

- [ ] **Step 1: Change `getExamPlan`'s parameter and lookup**

Find `export async function getExamPlan(courseId: string): Promise<GetExamPlanResult> {` and its first few lines:

```ts
export async function getExamPlan(courseId: string): Promise<GetExamPlanResult> {
  const supabase = await createClient();
  const now = new Date();

  const { data: config } = await supabase.from("exam_configs").select("*").eq("course_id", courseId).maybeSingle();
  if (!config) {
    return { error: "no_exam_configured" };
  }
```

Replace with:

```ts
export async function getExamPlan(examConfigId: string): Promise<GetExamPlanResult> {
  const supabase = await createClient();
  const now = new Date();

  const { data: config } = await supabase.from("exam_configs").select("*").eq("id", examConfigId).maybeSingle();
  if (!config) {
    return { error: "no_exam_configured" };
  }
  const courseId = config.course_id;
```

Nothing else in the function body changes — every remaining use of `courseId` below this point (in `resolveScopedConceptIds(supabase, courseId, config)`, the `course_concepts`/`concept_edges`/`question_bank` queries, and `getConceptState(courseId, ...)`/`getEdgeState(courseId, ...)`) now reads the local `const courseId` you just added instead of the removed parameter — same name, so nothing below this point needs editing.

- [ ] **Step 2: Change `getExamReadiness`'s parameter and lookup the same way**

Find:

```ts
export async function getExamReadiness(courseId: string): Promise<GetExamReadinessResult> {
  const supabase = await createClient();

  const { data: config } = await supabase.from("exam_configs").select("*").eq("course_id", courseId).maybeSingle();
  if (!config) {
    return { error: "no_exam_configured" };
  }
```

Replace with:

```ts
export async function getExamReadiness(examConfigId: string): Promise<GetExamReadinessResult> {
  const supabase = await createClient();

  const { data: config } = await supabase.from("exam_configs").select("*").eq("id", examConfigId).maybeSingle();
  if (!config) {
    return { error: "no_exam_configured" };
  }
  const courseId = config.course_id;
```

Again, nothing below this point in the function changes.

- [ ] **Step 3: Typecheck**

Run: `cd /Users/amandachiang/Downloads/School/Projects/ai-native-learning-platform && npx tsc --noEmit 2>&1 | grep "exam-planner/actions.ts"`

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/features/exam-planner/actions.ts
git commit -m "feat(exam-planner): key getExamPlan/getExamReadiness off examConfigId, not courseId"
```

---

### Task 4: `pickDefaultExamConfig` (new pure module + unit test)

**Files:**
- Create: `src/features/exam-planner/default-exam-selection.ts`
- Test: `tests/unit/exam-planner/default-exam-selection.test.ts`

**Interfaces:**
- Consumes: `ExamConfigView` (type-only import from `./actions.ts` — a `"use server"` file; type-only imports are erased at compile time and carry no runtime coupling, same pattern `scoped-selection.ts` already uses for `LearnerEdgeState`/`WeakConnectionItem`).
- Produces: `pickDefaultExamConfig(configs: ExamConfigView[], now: Date): ExamConfigView | null` — used by Task 5's `exam-plan/page.tsx`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/exam-planner/default-exam-selection.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { pickDefaultExamConfig } from "../../../src/features/exam-planner/default-exam-selection.ts";

const NOW = new Date("2026-09-26T12:00:00Z");

function config(id: string, examDate: string) {
  return { id, courseId: "course-1", examDate, scopeConceptIds: [], scopeUnitIds: [] };
}

test("picks the nearest upcoming exam when one or more are upcoming", () => {
  const result = pickDefaultExamConfig(
    [config("far", "2026-12-01"), config("near", "2026-10-01"), config("past", "2026-01-01")],
    NOW,
  );
  assert.equal(result?.id, "near");
});

test("falls back to the most recent past exam when none are upcoming", () => {
  const result = pickDefaultExamConfig([config("older", "2026-01-01"), config("recent", "2026-08-01")], NOW);
  assert.equal(result?.id, "recent");
});

test("returns null when there are no exams at all", () => {
  assert.equal(pickDefaultExamConfig([], NOW), null);
});

test("an exam dated exactly now counts as past, not upcoming (matches getExamPlan's own passed-check boundary)", () => {
  const result = pickDefaultExamConfig([config("today", NOW.toISOString())], NOW);
  assert.equal(result?.id, "today");
  // Confirmed via the "falls back to past" path, not the upcoming one --
  // a second, later-dated exam should win if one exists, since "today"
  // is not upcoming:
  const withLater = pickDefaultExamConfig(
    [config("today", NOW.toISOString()), config("later", "2026-12-01")],
    NOW,
  );
  assert.equal(withLater?.id, "later");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /Users/amandachiang/Downloads/School/Projects/ai-native-learning-platform && source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test tests/unit/exam-planner/default-exam-selection.test.ts`

Expected: FAIL — `Cannot find module '../../../src/features/exam-planner/default-exam-selection.ts'`.

- [ ] **Step 3: Write the implementation**

Create `src/features/exam-planner/default-exam-selection.ts`:

```ts
import type { ExamConfigView } from "./actions.ts";

/**
 * Picks which exam the Exam Plan page shows by default when no
 * `?exam=<id>` was requested: the nearest upcoming exam if any exist,
 * else the most recent past one, else null (no exams configured at
 * all). "Passed" uses the exact same boundary getExamPlan itself uses
 * (`examDate.getTime() <= now.getTime()`) so this pick and
 * getExamPlan's own "exam_date_passed" check can never disagree --
 * e.g. this never defaults to an exam that getExamPlan would
 * immediately report as already passed.
 */
export function pickDefaultExamConfig(configs: ExamConfigView[], now: Date): ExamConfigView | null {
  const upcoming = configs
    .filter((c) => new Date(c.examDate).getTime() > now.getTime())
    .sort((a, b) => new Date(a.examDate).getTime() - new Date(b.examDate).getTime());
  if (upcoming.length > 0) return upcoming[0];

  const past = configs
    .filter((c) => new Date(c.examDate).getTime() <= now.getTime())
    .sort((a, b) => new Date(b.examDate).getTime() - new Date(a.examDate).getTime());
  return past[0] ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/amandachiang/Downloads/School/Projects/ai-native-learning-platform && source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test tests/unit/exam-planner/default-exam-selection.test.ts`

Expected: PASS, 4 tests.

- [ ] **Step 5: Run the full unit suite to confirm nothing else broke**

Run: `cd /Users/amandachiang/Downloads/School/Projects/ai-native-learning-platform && source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && npm run test:unit 2>&1 | tail -10`

Expected: all tests pass (345 existing + 4 new = 349).

- [ ] **Step 6: Commit**

```bash
git add src/features/exam-planner/default-exam-selection.ts tests/unit/exam-planner/default-exam-selection.test.ts
git commit -m "feat(exam-planner): add pickDefaultExamConfig for the Exam Plan page's default selection"
```

---

### Task 5: `ConceptScopeSelect` gets an `initialSelectedIds` prop

**Files:**
- Modify: `src/features/exam-planner/components/ConceptScopeSelect.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ConceptScopeSelect({ name, concepts, initialSelectedIds }: { name: string; concepts: ScopeableConcept[]; initialSelectedIds?: string[] })` — `initialSelectedIds` is optional and defaults to `[]` (today's exact behavior when omitted), so this is backward compatible with every other caller if any existed.

- [ ] **Step 1: Add the prop and use it to seed `selected`**

Find:

```ts
export function ConceptScopeSelect({ name, concepts }: { name: string; concepts: ScopeableConcept[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
```

Replace with:

```ts
export function ConceptScopeSelect({
  name,
  concepts,
  initialSelectedIds = [],
}: {
  name: string;
  concepts: ScopeableConcept[];
  initialSelectedIds?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelectedIds));
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/amandachiang/Downloads/School/Projects/ai-native-learning-platform && npx tsc --noEmit 2>&1 | grep "ConceptScopeSelect"`

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/features/exam-planner/components/ConceptScopeSelect.tsx
git commit -m "feat(exam-planner): let ConceptScopeSelect open pre-populated for editing"
```

---

### Task 6: `exam-plan/page.tsx` loads every exam and picks/resolves the selected one

**Files:**
- Modify: `src/app/(app)/courses/[courseId]/exam-plan/page.tsx` (full rewrite — it's a short file)

**Interfaces:**
- Consumes: `listExamConfigs`, `updateExamConfig`, `deleteExamConfig`, `getExamPlan`, `getExamReadiness`, `configureExam`, `listScopeableConcepts` (all from Tasks 1-3), `pickDefaultExamConfig` (Task 4).
- Produces: passes `examConfigs: ExamConfigView[]`, `selectedExamConfigId: string | null`, `updateExamConfig`, `deleteExamConfig`, `loadExamPlanAndReadiness: (examConfigId: string) => Promise<{ plan: GetExamPlanResult; readiness: GetExamReadinessResult }>` as new props into `ExamPlanner` (Task 7 makes `ExamPlanner` accept them — this task's props won't fully typecheck until Task 7 lands; that's expected and temporary, same as Task 1's note about `getExamConfig`).

- [ ] **Step 1: Replace the whole file**

Replace the entire contents of `src/app/(app)/courses/[courseId]/exam-plan/page.tsx` with:

```tsx
import {
  listExamConfigs,
  getExamPlan,
  getExamReadiness,
  configureExam,
  updateExamConfig,
  deleteExamConfig,
  listScopeableConcepts,
} from "@/features/exam-planner/actions.ts";
import { pickDefaultExamConfig } from "@/features/exam-planner/default-exam-selection.ts";
import { submitTextReviewAnswer, submitStructuredReviewAnswer } from "@/features/review-scheduler/actions.ts";
import { ExamPlanner } from "@/features/exam-planner/components/ExamPlanner.tsx";

export default async function CourseExamPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { courseId } = await params;
  const { exam: examParam } = await searchParams;

  // scopeableConcepts is now needed unconditionally -- Add/Edit are
  // both reachable regardless of how many exams already exist, unlike
  // the old single-exam page where the form only ever appeared once,
  // before the first exam existed.
  const [examConfigs, scopeableConcepts] = await Promise.all([
    listExamConfigs(courseId),
    listScopeableConcepts(courseId),
  ]);

  // ?exam=<id> deep-links to one specific exam (Today's "Upcoming"
  // sidebar uses this) -- validated against the real list rather than
  // trusted blindly; an unknown or foreign id just falls back to the
  // same default-pick logic below, never an error page.
  const requestedId = typeof examParam === "string" ? examParam : undefined;
  const requestedConfig = requestedId ? (examConfigs.find((c) => c.id === requestedId) ?? null) : null;
  const selectedConfig = requestedConfig ?? pickDefaultExamConfig(examConfigs, new Date());

  const [plan, readiness] = await Promise.all([
    selectedConfig ? getExamPlan(selectedConfig.id) : Promise.resolve(null),
    selectedConfig ? getExamReadiness(selectedConfig.id) : Promise.resolve(null),
  ]);

  return (
    <ExamPlanner
      courseId={courseId}
      examConfigs={examConfigs}
      selectedExamConfigId={selectedConfig?.id ?? null}
      initialPlan={plan}
      initialReadiness={readiness}
      scopeableConcepts={scopeableConcepts}
      configureExam={configureExam}
      updateExamConfig={updateExamConfig}
      deleteExamConfig={deleteExamConfig}
      loadExamPlanAndReadiness={async (examConfigId) => {
        "use server";
        const [plan, readiness] = await Promise.all([getExamPlan(examConfigId), getExamReadiness(examConfigId)]);
        return { plan, readiness };
      }}
      submitTextAnswer={submitTextReviewAnswer}
      submitStructuredAnswer={submitStructuredReviewAnswer}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/(app)/courses/[courseId]/exam-plan/page.tsx"
git commit -m "feat(exam-planner): exam-plan page loads every exam and supports ?exam= deep-linking"
```

(Typecheck is deferred to the end of Task 7, since `ExamPlanner`'s prop types don't match yet until then.)

---

### Task 7: `ExamPlanner.tsx` — dropdown selector, Add/Edit/Delete

**Files:**
- Modify: `src/features/exam-planner/components/ExamPlanner.tsx` (full rewrite of the component function; the `gaugeColor`/`gaugeLabel` helpers and the `g`/`s` style objects at the bottom are unchanged except for new style entries added in Step 2)

**Interfaces:**
- Consumes: `ExamConfigView`, `GetExamPlanResult`, `GetExamReadinessResult`, `ScopeableConcept` (types, unchanged), `ConceptScopeSelect` with its new `initialSelectedIds` prop (Task 5).
- Produces: `ExamPlanner`'s new prop shape (see Step 1) — this is the component `exam-plan/page.tsx` (Task 6) already renders.

- [ ] **Step 1: Replace the component's props, state, and handlers**

Find the whole block from `export function ExamPlanner({` through the end of `handleStructuredAnswer` (i.e. everything up to but not including the `// Derived display metric` comment). Replace it with:

```tsx
export function ExamPlanner({
  courseId,
  examConfigs,
  selectedExamConfigId,
  initialPlan,
  initialReadiness,
  scopeableConcepts,
  configureExam,
  updateExamConfig,
  deleteExamConfig,
  loadExamPlanAndReadiness,
  submitTextAnswer,
  submitStructuredAnswer,
}: {
  courseId: string;
  examConfigs: ExamConfigView[];
  selectedExamConfigId: string | null;
  initialPlan: GetExamPlanResult | null;
  initialReadiness: GetExamReadinessResult | null;
  scopeableConcepts: ScopeableConcept[];
  configureExam: (courseId: string, examDate: string, scopeConceptIds: string[], scopeUnitIds: string[]) => Promise<{ examConfigId: string | null; error: string | null }>;
  updateExamConfig: (examConfigId: string, examDate: string, scopeConceptIds: string[], scopeUnitIds: string[]) => Promise<{ error: string | null }>;
  deleteExamConfig: (examConfigId: string) => Promise<{ error: string | null }>;
  loadExamPlanAndReadiness: (examConfigId: string) => Promise<{ plan: GetExamPlanResult; readiness: GetExamReadinessResult }>;
  submitTextAnswer: (input: { courseId: string; conceptId: string; rubric: Record<string, unknown>; response: string }) => Promise<SubmitResult>;
  submitStructuredAnswer: (input: { courseId: string; conceptId: string; checkerDomain: NonNullable<SessionItem["checkerDomain"]>; checkerInput: Record<string, unknown>; claimFields: Record<string, unknown> }) => Promise<SubmitResult>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(selectedExamConfigId);
  const [plan, setPlan] = useState(initialPlan);
  const [readiness, setReadiness] = useState(initialReadiness);
  // "add" is the initial mode only when there's nothing to show in the
  // dropdown yet -- same "form shown immediately" behavior the old
  // single-exam page had for a course's very first exam.
  const [mode, setMode] = useState<"view" | "add" | "edit">(examConfigs.length === 0 ? "add" : "view");
  const [configError, setConfigError] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, SubmitResult>>({});
  const [switching, setSwitching] = useState(false);

  const selectedConfig = examConfigs.find((c) => c.id === selectedId) ?? null;

  async function handleSelectExam(examConfigId: string) {
    setSelectedId(examConfigId);
    setMode("view");
    setConfigError(null);
    setSwitching(true);
    const outcome = await loadExamPlanAndReadiness(examConfigId);
    setPlan(outcome.plan);
    setReadiness(outcome.readiness);
    setSwitching(false);
  }

  async function handleAdd(formData: FormData) {
    const examDate = (formData.get("examDate") as string | null) ?? "";
    const scopeConceptIds = formData.getAll("scopeConceptIds") as string[];
    if (scopeConceptIds.length === 0) {
      setConfigError("Select at least one concept to scope the exam to.");
      return;
    }
    const outcome = await configureExam(courseId, examDate, scopeConceptIds, []);
    if (outcome.error) {
      setConfigError(outcome.error);
      return;
    }
    setConfigError(null);
    window.location.reload();
  }

  async function handleEdit(formData: FormData) {
    if (!selectedConfig) return;
    const examDate = (formData.get("examDate") as string | null) ?? "";
    const scopeConceptIds = formData.getAll("scopeConceptIds") as string[];
    if (scopeConceptIds.length === 0) {
      setConfigError("Select at least one concept to scope the exam to.");
      return;
    }
    // scopeUnitIds is passed through unchanged (the form has no unit-
    // scope UI, same as create) rather than hardcoded to [] -- editing
    // must never silently wipe a scope dimension the form doesn't let
    // the student touch.
    const outcome = await updateExamConfig(selectedConfig.id, examDate, scopeConceptIds, selectedConfig.scopeUnitIds);
    if (outcome.error) {
      setConfigError(outcome.error);
      return;
    }
    setConfigError(null);
    window.location.reload();
  }

  async function handleDelete() {
    if (!selectedConfig) return;
    const confirmed = window.confirm(
      `Delete the exam dated ${new Date(selectedConfig.examDate).toLocaleDateString()}? This can't be undone.`,
    );
    if (!confirmed) return;
    const outcome = await deleteExamConfig(selectedConfig.id);
    if (outcome.error) {
      setConfigError(outcome.error);
      return;
    }
    window.location.reload();
  }

  async function handleAnswer(item: SessionItem, response: string) {
    if (response.trim().length === 0) return;
    const outcome = await submitTextAnswer({ courseId, conceptId: item.conceptId, rubric: item.rubric, response });
    setResults((current) => ({ ...current, [item.conceptId]: outcome }));
  }

  async function handleStructuredAnswer(item: SessionItem, claimFields: Record<string, unknown>) {
    if (!item.checkerDomain || !item.checkerInput) return;
    const outcome = await submitStructuredAnswer({
      courseId,
      conceptId: item.conceptId,
      checkerDomain: item.checkerDomain,
      checkerInput: item.checkerInput,
      claimFields,
    });
    setResults((current) => ({ ...current, [item.conceptId]: outcome }));
  }
```

- [ ] **Step 2: Replace the "Exam configuration" JSX section**

Find:

```tsx
        <section style={s.section}>
          <span style={s.sectionLabel}>Exam configuration</span>
          {config ? (
            <p style={s.configuredNote}>Exam date: {new Date(config.examDate).toLocaleDateString()}</p>
          ) : (
            <form
              action={async (formData) => {
                await handleConfigure(formData);
              }}
              style={s.configForm}
            >
              <label style={s.field}>
                <span style={s.fieldLabel}>Exam date</span>
                <input type="date" name="examDate" required style={s.input} />
              </label>
              <label style={s.field}>
                <span style={s.fieldLabel}>Scope concepts</span>
                <ConceptScopeSelect name="scopeConceptIds" concepts={scopeableConcepts} />
              </label>
              <button type="submit" style={s.primaryButton}>
                Configure exam
              </button>
            </form>
          )}
          {configError && <p style={s.errorText}>{configError}</p>}
        </section>
```

Replace with:

```tsx
        <section style={s.section}>
          <span style={s.sectionLabel}>Exam configuration</span>

          {examConfigs.length > 0 && mode === "view" && (
            <div style={s.configRow}>
              <select
                value={selectedId ?? ""}
                onChange={(e) => handleSelectExam(e.target.value)}
                disabled={switching}
                style={s.select}
              >
                {examConfigs.map((c) => {
                  const isPast = new Date(c.examDate).getTime() <= Date.now();
                  return (
                    <option key={c.id} value={c.id}>
                      {new Date(c.examDate).toLocaleDateString()}
                      {isPast ? " (past)" : ""}
                    </option>
                  );
                })}
              </select>
              <button type="button" onClick={() => setMode("add")} style={s.secondaryButton}>
                + Add exam
              </button>
              {selectedConfig && (
                <>
                  <button type="button" onClick={() => setMode("edit")} style={s.secondaryButton}>
                    Edit
                  </button>
                  <button type="button" onClick={handleDelete} style={s.dangerButton}>
                    Delete
                  </button>
                </>
              )}
            </div>
          )}

          {(mode === "add" || mode === "edit") && (
            <form
              action={async (formData) => {
                if (mode === "add") await handleAdd(formData);
                else await handleEdit(formData);
              }}
              style={s.configForm}
            >
              <label style={s.field}>
                <span style={s.fieldLabel}>Exam date</span>
                <input
                  type="date"
                  name="examDate"
                  required
                  defaultValue={mode === "edit" ? selectedConfig?.examDate : undefined}
                  style={s.input}
                />
              </label>
              <label style={s.field}>
                <span style={s.fieldLabel}>Scope concepts</span>
                {/* Keyed on mode+selected exam so React remounts this
                    (and re-runs its useState initializer) every time a
                    genuinely different form target opens -- avoids a
                    stale-selection bug if this ever gets a direct
                    add<->edit toggle that skips the "view" state this
                    version always passes through between them. */}
                <ConceptScopeSelect
                  key={`${mode}-${selectedConfig?.id ?? "new"}`}
                  name="scopeConceptIds"
                  concepts={scopeableConcepts}
                  initialSelectedIds={mode === "edit" ? (selectedConfig?.scopeConceptIds ?? []) : []}
                />
              </label>
              <div style={s.formActions}>
                <button type="submit" style={s.primaryButton}>
                  {mode === "add" ? "Configure exam" : "Save changes"}
                </button>
                {examConfigs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("view");
                      setConfigError(null);
                    }}
                    style={s.secondaryButton}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          )}

          {configError && <p style={s.errorText}>{configError}</p>}
        </section>
```

- [ ] **Step 3: Add the three new style entries**

Find the `s.configuredNote` line in the `s` style object (near the bottom of the file):

```ts
  configuredNote: { margin: 0, fontSize: 13.5, color: "var(--text-secondary)" },
```

Replace it with (keeping it, plus three new entries):

```ts
  configuredNote: { margin: 0, fontSize: 13.5, color: "var(--text-secondary)" },
  configRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  select: {
    padding: "8px 10px",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    fontSize: 13.5,
    fontFamily: "var(--font-sans)",
    color: "var(--text-primary)",
    background: "var(--surface)",
  },
  secondaryButton: {
    padding: "8px 14px",
    background: "var(--surface)",
    color: "var(--text-secondary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    fontSize: 13.5,
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
  },
  dangerButton: {
    padding: "8px 14px",
    background: "var(--surface)",
    color: "var(--clay)",
    border: "1px solid var(--clay-border)",
    borderRadius: "var(--radius-sm)",
    fontSize: 13.5,
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
  },
  formActions: { display: "flex", gap: 8 },
```

- [ ] **Step 4: Typecheck the whole project**

Run: `cd /Users/amandachiang/Downloads/School/Projects/ai-native-learning-platform && npx tsc --noEmit 2>&1 | head -60`

Expected: no output. If there are errors referencing `today.ts` or `TodayDashboard.tsx`, that's expected until Tasks 8-9 land — everything under `src/features/exam-planner/` and `src/app/(app)/courses/[courseId]/exam-plan/` must be clean at this point.

- [ ] **Step 5: Run the full unit suite**

Run: `cd /Users/amandachiang/Downloads/School/Projects/ai-native-learning-platform && source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && npm run test:unit 2>&1 | tail -10`

Expected: all 349 tests pass (unaffected by this task, but confirms no import-time breakage).

- [ ] **Step 6: Commit**

```bash
git add src/features/exam-planner/components/ExamPlanner.tsx
git commit -m "feat(exam-planner): ExamPlanner dropdown selector plus Add/Edit/Delete"
```

---

### Task 8: `today-selection.ts`/`today.ts` — every exam competes, not just one per course

**Files:**
- Modify: `src/features/courses/today-selection.ts` (add `examConfigId` to `NearestExam`)
- Modify: `tests/unit/courses/today-selection.test.ts` (add `examConfigId` to every `NearestExam` object literal)
- Modify: `src/features/courses/today.ts` (replace the one-`getExamConfig`-per-course aggregation with a flattened `listExamConfigs` one)

**Interfaces:**
- Consumes: `listExamConfigs` (Task 1).
- Produces: `NearestExam` gains `examConfigId: string` — consumed by Task 9's `TodayDashboard.tsx`.

- [ ] **Step 1: Add `examConfigId` to the `NearestExam` type**

In `src/features/courses/today-selection.ts`, find:

```ts
export type NearestExam = {
  courseId: string;
  courseName: string;
  examDate: string;
  daysLeft: number;
};
```

Replace with:

```ts
export type NearestExam = {
  courseId: string;
  courseName: string;
  examConfigId: string;
  examDate: string;
  daysLeft: number;
};
```

(`pickNearestExam` itself needs no changes — it only ever reads `daysLeft`, and multiple entries sharing a `courseId` was always something it handled correctly, it just never arose before now.)

- [ ] **Step 2: Update the existing test's object literals**

In `tests/unit/courses/today-selection.test.ts`, every `NearestExam`-shaped object literal needs an `examConfigId` field now (TypeScript will otherwise reject the whole file). Replace the file's contents with:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { daysUntil, pickNearestExam } from "../../../src/features/courses/today-selection.ts";

const NOW = new Date("2026-09-05T00:00:00Z");

test("daysUntil counts whole days between now and a future exam date", () => {
  assert.equal(daysUntil("2026-09-09T00:00:00Z", NOW), 4);
});

test("daysUntil is negative for a date already in the past", () => {
  assert.equal(daysUntil("2026-09-01T00:00:00Z", NOW), -4);
});

test("pickNearestExam picks the smallest non-negative daysLeft, ignoring past exams", () => {
  const result = pickNearestExam([
    { courseId: "past", courseName: "Past Course", examConfigId: "exam-past", examDate: "2026-08-01", daysLeft: -30 },
    { courseId: "far", courseName: "Far Course", examConfigId: "exam-far", examDate: "2026-10-01", daysLeft: 26 },
    { courseId: "near", courseName: "Near Course", examConfigId: "exam-near", examDate: "2026-09-09", daysLeft: 4 },
  ]);
  assert.equal(result?.courseId, "near");
});

test("pickNearestExam returns null when every exam is in the past or none exist", () => {
  assert.equal(pickNearestExam([]), null);
  assert.equal(
    pickNearestExam([
      { courseId: "past", courseName: "Past Course", examConfigId: "exam-past", examDate: "2026-08-01", daysLeft: -1 },
    ]),
    null,
  );
});

test("pickNearestExam picks the nearer of two exams from the SAME course (multiple exams per course)", () => {
  const result = pickNearestExam([
    { courseId: "course-1", courseName: "Course One", examConfigId: "exam-a", examDate: "2026-12-01", daysLeft: 87 },
    { courseId: "course-1", courseName: "Course One", examConfigId: "exam-b", examDate: "2026-09-09", daysLeft: 4 },
  ]);
  assert.equal(result?.examConfigId, "exam-b");
});
```

(The last test is new — it's the one real behavior this whole plan exists to enable: two exams sharing a `courseId` are compared purely on `daysLeft`, exactly like two exams from different courses always were.)

- [ ] **Step 3: Run the test to verify it passes**

Run: `cd /Users/amandachiang/Downloads/School/Projects/ai-native-learning-platform && source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test tests/unit/courses/today-selection.test.ts`

Expected: PASS, 6 tests.

- [ ] **Step 4: Replace `today.ts`'s aggregation**

In `src/features/courses/today.ts`, find:

```ts
import { getExamConfig } from "@/features/exam-planner/actions.ts";
```

Replace with:

```ts
import { listExamConfigs } from "@/features/exam-planner/actions.ts";
```

Then find:

```ts
  const configuredExams = (
    await Promise.all(
      courses.map(async (course) => {
        const { config } = await getExamConfig(course.id);
        if (!config) return null;
        return { courseId: course.id, courseName: course.name, examDate: config.examDate, daysLeft: daysUntil(config.examDate, now) };
      }),
    )
  ).filter((exam): exam is NearestExam => exam !== null);
```

Replace with:

```ts
  // Every exam competes for the nearest-exam banner and the Upcoming
  // sidebar now, not just one per course (2026-09-26 design) -- a
  // course with two near-term exams can occupy two Today slots.
  const configuredExams = (
    await Promise.all(
      courses.map(async (course) => {
        const configs = await listExamConfigs(course.id);
        return configs.map((config) => ({
          courseId: course.id,
          courseName: course.name,
          examConfigId: config.id,
          examDate: config.examDate,
          daysLeft: daysUntil(config.examDate, now),
        }));
      }),
    )
  ).flat();
```

- [ ] **Step 5: Typecheck**

Run: `cd /Users/amandachiang/Downloads/School/Projects/ai-native-learning-platform && npx tsc --noEmit 2>&1 | grep -E "today\.ts|today-selection"`

Expected: no output. (`TodayDashboard.tsx` will still show an error for its own `key={exam.courseId}` line reading `examConfigId` — that's Task 9.)

- [ ] **Step 6: Commit**

```bash
git add src/features/courses/today-selection.ts tests/unit/courses/today-selection.test.ts src/features/courses/today.ts
git commit -m "feat(courses): every configured exam competes for Today's nearest/upcoming slots"
```

---

### Task 9: `TodayDashboard.tsx` — key by `examConfigId`, deep-link with `?exam=`

**Files:**
- Modify: `src/features/courses/components/TodayDashboard.tsx`

**Interfaces:**
- Consumes: `NearestExam.examConfigId` (Task 8).

- [ ] **Step 1: Fix the Upcoming list's key and link**

Find:

```tsx
          {upcomingExams.map((exam) => (
            <Link key={exam.courseId} href={`/courses/${exam.courseId}/exam-plan`} style={s.examCardLink}>
```

Replace with:

```tsx
          {upcomingExams.map((exam) => (
            <Link
              key={exam.examConfigId}
              href={`/courses/${exam.courseId}/exam-plan?exam=${exam.examConfigId}`}
              style={s.examCardLink}
            >
```

- [ ] **Step 2: Typecheck the whole project**

Run: `cd /Users/amandachiang/Downloads/School/Projects/ai-native-learning-platform && npx tsc --noEmit 2>&1`

Expected: no output at all — every task's temporary cross-file errors should be resolved now.

- [ ] **Step 3: Run the full unit suite**

Run: `cd /Users/amandachiang/Downloads/School/Projects/ai-native-learning-platform && source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && npm run test:unit 2>&1 | tail -10`

Expected: all 349 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/features/courses/components/TodayDashboard.tsx
git commit -m "feat(courses): Today's Upcoming exams deep-link to the specific exam"
```

---

### Task 10: Live verification and docs

**Files:**
- Modify: `brain/decisions/architecture-log.md` (append an entry)
- No code files — this task is verification plus the log entry the project's own conventions require for a change like this.

- [ ] **Step 1: Start the dev server**

Run (in the background, or a separate terminal): `cd /Users/amandachiang/Downloads/School/Projects/ai-native-learning-platform && source ~/.nvm/nvm.sh && nvm use 24 && npm run dev`

- [ ] **Step 2: Live-verify multiple exams for one course, in a real signed-in browser session**

Using a real test account and course (create one through the actual UI, or reuse the admin-client + Playwright pattern already established in `tests/e2e/basic-flows.spec.ts` for a throwaway script — not committed, deleted after use):

1. Configure a first exam (date A, some scope). Confirm the dropdown appears with exactly that one exam once a second exam exists (it won't show for just one — `examConfigs.length > 0 && mode === "view"` — confirm this specific case: with exactly one exam configured, the dropdown DOES render, showing that single option; only zero exams skips straight to the create form).
2. Click "+ Add exam", configure a second exam (date B, different scope). Confirm both now appear in the dropdown, sorted by date.
3. Select each one in turn; confirm the staged plan and readiness gauge genuinely differ between them (matching each exam's own distinct scope) and that no page reload occurs when switching (`switching` disables the `<select>` briefly, then re-enables).
4. Click "Edit" on the currently-selected exam, confirm the form opens with that exam's real date pre-filled and its real scoped concepts pre-checked (not empty, not the other exam's). Change the date, save, confirm the dropdown reflects the new date after reload and the OTHER exam is untouched.
5. Click "Delete" on one exam, confirm the browser's confirm dialog appears, confirm it, confirm that exam is gone from the dropdown after reload and the remaining one still shows correctly.
6. Configure exams for two different courses with near-term dates. Visit `/` (Today). Confirm both appear in the "Upcoming" sidebar (previously only one per course would have been possible; verify a single course with two near-term exams can also show up twice, if time permits seeding that case). Click one of the Upcoming cards; confirm the URL carries `?exam=<id>` and the Exam Plan page opens directly on that specific exam, not whichever one the page's own default pick would have chosen.

- [ ] **Step 3: Run the full Playwright suite to confirm no regressions**

Run: `cd /Users/amandachiang/Downloads/School/Projects/ai-native-learning-platform && source ~/.nvm/nvm.sh && nvm use 24 && npx playwright test tests/e2e/basic-flows.spec.ts tests/visual/ --project=chromium --project=mobile --reporter=line`

Expected: same pass/skip counts as before this plan (19 passed, 3 skipped) — this plan touches no shared nav/layout, so no visual baseline changes are expected.

- [ ] **Step 4: Append the architecture-log entry**

Add to the end of `brain/decisions/architecture-log.md`:

```markdown
## 2026-09-26 -- Exam planner now supports multiple exams per course

A student could only ever configure one exam per course --
`configureExam` looked up an existing `exam_configs` row by
`(user_id, course_id)` and updated it in place, silently overwriting
any prior exam's date/scope. The `exam_configs` table itself never had
a unique constraint forcing this -- it was purely an application-logic
assumption, repeated across `configureExam`, `getExamConfig`,
`getExamPlan`, and `getExamReadiness` (all `.maybeSingle()`'d by
`course_id` alone). No migration was needed to lift it.

Brainstormed interactively before touching code (design:
`docs/superpowers/specs/2026-09-26-multiple-exams-per-course-design.md`):
no name/label field (exams are distinguished by date only), a dropdown
selector on the Exam Plan page rather than a new route, past exams stay
selectable rather than disappearing, and -- a second real gap found
while investigating, fixed in the same pass -- the UI never exposed a
way to edit or delete an already-configured exam at all (the form just
disappeared once one existed), even though the server action's own
update path existed unreachably.

`getExamPlan`/`getExamReadiness` now key off `examConfigId` instead of
`courseId`, deriving `courseId` from the fetched row itself rather than
trusting a second, separately-passed copy of it -- closes a latent gap
where the two could disagree, the same "derive the trusted value from
the row you already fetched" pattern `extract-course-graph.ts`'s
`target_unit_id` handling already established elsewhere in this
codebase. A new pure `pickDefaultExamConfig` (nearest upcoming, else
most recent past, else null) picks which exam the page shows with no
`?exam=` query param -- Today's "Upcoming" sidebar now links with that
param so a specific exam card deep-links to itself rather than
whichever exam the page's own default happens to land on.

Today's dashboard aggregation changed from "one exam per course" to
"every exam across every course competes for the nearest-exam banner
and the Upcoming top-3" -- a course with two near-term exams can now
occupy two Today slots. `NearestExam` gained an `examConfigId` field;
`TodayDashboard.tsx`'s Upcoming list now keys on it instead of
`courseId` (a real key-collision bug this change would otherwise have
introduced, since two exams from the same course used to be impossible
and are now a real case).

Verified live: configured two real exams for one course, confirmed
each has its own distinct staged plan and readiness in the dropdown
with zero page reload when switching, confirmed Edit/Delete both act
on the correct row, and confirmed a Today Upcoming card's `?exam=`
link opens the exact exam clicked. Full 349-test unit suite (345 +
`pickDefaultExamConfig`'s 4 + the new multi-exam-same-course
`pickNearestExam` case), `tsc --noEmit`, and the full visual +
basic-flows e2e suite (chromium + mobile) all clean.
```

- [ ] **Step 5: Commit**

```bash
git add brain/decisions/architecture-log.md
git commit -m "docs: log multiple-exams-per-course support"
git push
```

---

## Self-Review Notes

- **Spec coverage:** every design-doc section has a task — actions layer (Tasks 1-3), Exam Plan page/component (Tasks 5-7), Today aggregation (Tasks 8-9), the two "found during self-review" implementation notes (Task 5 for `ConceptScopeSelect`, Task 9's key fix), and the design's testing-plan section (Task 4's new unit tests plus Task 10's live verification).
- **Type consistency checked:** `ExamConfigView` (id/courseId/examDate/scopeConceptIds/scopeUnitIds) is used identically in Task 4's test helper, Task 6's page, and Task 7's component. `GetExamPlanResult`/`GetExamReadinessResult` are never restructured, only re-keyed by parameter. `NearestExam`'s new `examConfigId` field name matches between Task 8 (produced) and Task 9 (consumed).
- **Scope check:** single cohesive enhancement to one already-shipped feature plus its two integration points (Today, the shared review-scheduler answer actions it already reused) — not decomposed further, matches the design doc's own stated scope.
