# Orca Phase 2 — Concepts Screen, Chat Entry, Create-Course Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the per-course concept path the course landing page, add a
top-level AI Chat tab with a course picker, and move course creation into
a modal — all over existing server actions plus one thin new read action.

**Architecture:** The concept path is a server component composing three
reads (`listUnits`, a new `listCourseConceptsWithMastery`, existing
`getDueQueue`) through one pure grouping function. The existing Material
page moves verbatim to `/courses/[courseId]/material` so `/courses/[courseId]`
can host the path. Chat reuses `startConversation(courseId)` unchanged;
the picker exists because `tutor_conversations.course_id` is NOT NULL and
that grounding constraint is deliberately preserved.

**Tech Stack:** Next.js App Router (server components + server actions),
React, plain CSS custom properties (the Orca token system from Phase 1),
Supabase Postgres via `@/lib/supabase`, `node:test` for unit tests,
Playwright for e2e/visual. No new npm dependency.

## Global Constraints

- No new npm dependency (`CLAUDE.md`: don't add one when an existing
  project dependency already solves the problem).
- No schema change, no new table, no migration in this phase
  (`docs/superpowers/specs/2026-09-28-orca-phase2-concepts-chat-design.md`,
  Scope).
- Every color comes from the Orca token system in `src/app/globals.css`
  (`--accent*`, `--status-*`, `--text-*`, `--surface`, `--border`).
  Never a raw hex, never a re-introduced `--clay`/`--denim`/`--teal`.
- Both ▷ controls (concept rows and the due rail) ship **disabled with a
  visible reason**. Never wire them to Quick review as a stand-in, never
  render a silently inert button (`CLAUDE.md` no-silent-placeholders).
- Concepts with a null `unit_id` render under an explicit "Unassigned"
  header — never dropped, never folded into an unrelated unit.
- Dates, if any are rendered, go through `@/lib/format-date.ts` — never
  a bare `toLocaleDateString()` (architecture-log 2026-09-28).
- Solo-authored commits, no AI co-author trailer, commit after each task.
- Run `npm run dev` / Playwright / typecheck under Node 24 (`nvm use 24`);
  the default shell `node` is v16 and `next dev` refuses to start on it.
  Do **not** leave a dev server running while running the e2e suite — a
  reused server misses `TUTOR_AGENT_USE_TEST_DOUBLE` and `tutor-agent`
  will fail for unrelated reasons (architecture-log 2026-09-28).

---

## File Structure

**Create:**
- `src/features/courses/concept-path.ts` — pure grouping/ordering logic.
- `src/features/courses/concept-path-actions.ts` — the one new read action.
- `src/features/courses/components/ConceptPath.tsx` — the path UI.
- `src/features/courses/components/DueRail.tsx` — Due today/tomorrow rail.
- `src/features/courses/components/CreateCourseModal.tsx` — modal wrapper.
- `src/app/(app)/courses/[courseId]/material/page.tsx` — relocated Material.
- `src/app/(app)/chat/page.tsx` — chat entry + course picker.
- `src/features/tutor-agent/components/CoursePicker.tsx` — picker UI.
- `tests/unit/courses/concept-path.test.ts` — grouping tests.

**Modify:**
- `src/app/(app)/courses/[courseId]/page.tsx` — becomes the path page.
- `src/components/course-shell.tsx` — `SUB_NAV`: add Concepts, move Material.
- `src/components/app-shell.tsx` — add the Chat nav entry.
- `src/components/icons.tsx` — add `IconPlay`.
- `src/app/(app)/courses/page.tsx` — inline form → modal trigger.
- `tests/visual/review-queue.spec.ts` — retarget to `/courses/demo/material`.
- `tests/e2e/basic-flows.spec.ts` — course-detail assertions follow the move.

---

## Task 1: Pure concept-path grouping

Pure logic first, with no database or React in the way, so the ordering
rules are pinned by tests before any UI depends on them.

**Files:**
- Create: `src/features/courses/concept-path.ts`
- Test: `tests/unit/courses/concept-path.test.ts`

**Interfaces:**
- Produces:
  - `type ConceptPathConcept = { id: string; name: string; unitId: string | null; masteryState: "unverified" | "exposed" | "weak" | "solid" }`
  - `type ConceptPathUnit = { id: string; title: string }`
  - `type ConceptPathSection = { unitId: string | null; title: string; concepts: ConceptPathConcept[] }`
  - `groupConceptsByUnit(concepts: ConceptPathConcept[], units: ConceptPathUnit[]): ConceptPathSection[]`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/courses/concept-path.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupConceptsByUnit } from "../../../src/features/courses/concept-path.ts";

const units = [
  { id: "u1", title: "Graphs" },
  { id: "u2", title: "Trees" },
];

const concepts = [
  { id: "c1", name: "BFS", unitId: "u1", masteryState: "solid" as const },
  { id: "c2", name: "DFS", unitId: "u1", masteryState: "weak" as const },
  { id: "c3", name: "Heap", unitId: "u2", masteryState: "unverified" as const },
];

test("groups concepts under their unit, preserving the given unit order", () => {
  const sections = groupConceptsByUnit(concepts, units);
  assert.deepEqual(
    sections.map((s) => [s.title, s.concepts.map((c) => c.name)]),
    [
      ["Graphs", ["BFS", "DFS"]],
      ["Trees", ["Heap"]],
    ],
  );
});

test("a concept with no unit lands under an explicit Unassigned section, never dropped", () => {
  const orphan = { id: "c4", name: "Orphan", unitId: null, masteryState: "exposed" as const };
  const sections = groupConceptsByUnit([...concepts, orphan], units);
  const unassigned = sections.find((s) => s.unitId === null);
  assert.ok(unassigned, "expected an Unassigned section");
  assert.equal(unassigned.title, "Unassigned");
  assert.deepEqual(unassigned.concepts.map((c) => c.name), ["Orphan"]);
  // Nothing is lost in grouping.
  assert.equal(sections.flatMap((s) => s.concepts).length, 4);
});

test("a concept referencing a unit that no longer exists is Unassigned, not silently dropped", () => {
  const stale = { id: "c5", name: "Stale", unitId: "deleted-unit", masteryState: "weak" as const };
  const sections = groupConceptsByUnit([stale], units);
  assert.deepEqual(sections.map((s) => s.unitId), [null]);
  assert.deepEqual(sections[0].concepts.map((c) => c.name), ["Stale"]);
});

test("Unassigned sorts last, after every real unit", () => {
  const orphan = { id: "c4", name: "Orphan", unitId: null, masteryState: "exposed" as const };
  const sections = groupConceptsByUnit([orphan, ...concepts], units);
  assert.equal(sections[sections.length - 1].unitId, null);
});

test("a unit with no concepts is omitted, and an empty course yields no sections", () => {
  assert.deepEqual(groupConceptsByUnit([], units), []);
  const onlyU1 = groupConceptsByUnit([concepts[0]], units);
  assert.deepEqual(onlyU1.map((s) => s.title), ["Graphs"]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH" && node --test tests/unit/courses/concept-path.test.ts`
Expected: FAIL — cannot find module `concept-path.ts`.

- [ ] **Step 3: Write the implementation**

Create `src/features/courses/concept-path.ts`:

```ts
export type ConceptMasteryState = "unverified" | "exposed" | "weak" | "solid";

export type ConceptPathConcept = {
  id: string;
  name: string;
  unitId: string | null;
  masteryState: ConceptMasteryState;
};

export type ConceptPathUnit = { id: string; title: string };

export type ConceptPathSection = {
  unitId: string | null;
  title: string;
  concepts: ConceptPathConcept[];
};

/** Label for concepts with no unit, or whose unit no longer exists. */
export const UNASSIGNED_SECTION_TITLE = "Unassigned";

/**
 * Groups a course's concepts under their unit headers, units in the
 * order given (listUnits already orders by created_at).
 *
 * Two rules worth stating because they're easy to get wrong:
 *
 * 1. A concept whose `unitId` is null -- or points at a unit that isn't
 *    in `units` (archived or deleted since extraction) -- goes into an
 *    explicit "Unassigned" section. It is never dropped and never
 *    folded into an unrelated unit: a concept vanishing from this
 *    screen because of a stale foreign key would be exactly the kind of
 *    silent, plausible-looking gap CLAUDE.md forbids.
 * 2. Units with no concepts are omitted rather than rendered empty --
 *    an empty header communicates nothing, and a freshly-created course
 *    has many of them.
 */
export function groupConceptsByUnit(
  concepts: ConceptPathConcept[],
  units: ConceptPathUnit[],
): ConceptPathSection[] {
  const knownUnitIds = new Set(units.map((u) => u.id));
  const byUnit = new Map<string | null, ConceptPathConcept[]>();

  for (const concept of concepts) {
    const key = concept.unitId !== null && knownUnitIds.has(concept.unitId) ? concept.unitId : null;
    const list = byUnit.get(key) ?? [];
    list.push(concept);
    byUnit.set(key, list);
  }

  const sections: ConceptPathSection[] = [];
  for (const unit of units) {
    const unitConcepts = byUnit.get(unit.id);
    if (!unitConcepts || unitConcepts.length === 0) continue;
    sections.push({ unitId: unit.id, title: unit.title, concepts: unitConcepts });
  }

  const unassigned = byUnit.get(null);
  if (unassigned && unassigned.length > 0) {
    sections.push({ unitId: null, title: UNASSIGNED_SECTION_TITLE, concepts: unassigned });
  }

  return sections;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH" && node --test tests/unit/courses/concept-path.test.ts`
Expected: PASS, 5/5.

- [ ] **Step 5: Register the test directory**

In `package.json`, the `test:unit` script lists test globs explicitly.
Add `tests/unit/courses/*.test.ts` immediately after
`tests/unit/lib/*.test.ts` (it is not picked up otherwise).

Run: `export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH" && npm run test:unit`
Expected: PASS, 360 tests (355 existing + 5 new).

- [ ] **Step 6: Commit**

```bash
git add src/features/courses/concept-path.ts tests/unit/courses/concept-path.test.ts package.json
git commit -m "feat: pure concept-path grouping by course unit"
```

---

## Task 2: The concept + mastery read action

**Files:**
- Create: `src/features/courses/concept-path-actions.ts`

**Interfaces:**
- Consumes: `ConceptPathConcept` from Task 1.
- Produces: `listCourseConceptsWithMastery(courseId: string): Promise<ConceptPathConcept[]>`

- [ ] **Step 1: Write the action**

Create `src/features/courses/concept-path-actions.ts`:

```ts
"use server";

import { createClient } from "@/lib/supabase/server.ts";
import type { ConceptPathConcept, ConceptMasteryState } from "@/features/courses/concept-path.ts";

/**
 * Every concept in a course with the signed-in learner's mastery state.
 *
 * This exists because nothing else answers this question.
 * `getDailyReviewSession` selects only concepts that are *due*, ranked
 * and time-budgeted; `getDueQueue` likewise only returns ranked due
 * items. The Concepts screen shows the whole course, due or not.
 *
 * Statuses 'confirmed' and 'proposed' are both included, matching what
 * getDailyReviewSession already treats as quiz-eligible -- a concept
 * still awaiting review is real and belongs on this screen. 'archived'
 * is excluded.
 *
 * A concept with no learner_concept_state row has genuinely never been
 * touched, which is exactly what 'unverified' means in that column's
 * own CHECK constraint -- so this is a real state, not a stand-in for
 * missing data.
 */
export async function listCourseConceptsWithMastery(courseId: string): Promise<ConceptPathConcept[]> {
  const supabase = await createClient();

  const [conceptsRes, stateRes] = await Promise.all([
    supabase
      .from("course_concepts")
      .select("id, canonical_name, unit_id")
      .eq("course_id", courseId)
      .in("status", ["confirmed", "proposed"])
      .order("created_at", { ascending: true }),
    supabase.from("learner_concept_state").select("concept_id, mastery_state").eq("course_id", courseId),
  ]);

  const concepts = conceptsRes.data ?? [];
  const masteryByConceptId = new Map<string, ConceptMasteryState>(
    (stateRes.data ?? []).map((row) => [row.concept_id as string, row.mastery_state as ConceptMasteryState]),
  );

  return concepts.map((row) => ({
    id: row.id as string,
    name: row.canonical_name as string,
    unitId: (row.unit_id as string | null) ?? null,
    masteryState: masteryByConceptId.get(row.id as string) ?? "unverified",
  }));
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH" && npm run typecheck`
Expected: PASS.

Note: `learner_concept_state` is RLS-scoped to `user_id = auth.uid()`
(migration `0004_learner_evidence.sql`), so this read returns only the
signed-in learner's own rows without an explicit user filter. Do not add
one — it would duplicate the policy, not strengthen it.

- [ ] **Step 3: Commit**

```bash
git add src/features/courses/concept-path-actions.ts
git commit -m "feat: read a course's concepts with the learner's mastery state"
```

---

## Task 3: Move Material to its own route

Done before the landing page changes so `/courses/[courseId]` is never
broken in between — Material keeps working at its new URL first.

**Files:**
- Create: `src/app/(app)/courses/[courseId]/material/page.tsx`
- Modify: `src/components/course-shell.tsx` (its `SUB_NAV` array)
- Modify: `tests/visual/review-queue.spec.ts`
- Modify: `tests/e2e/basic-flows.spec.ts`

**Interfaces:**
- Produces: route `/courses/[courseId]/material` rendering exactly what
  `/courses/[courseId]` renders today, including its `courseId === "demo"`
  fixture branch.

- [ ] **Step 1: Move the page file verbatim**

```bash
mkdir -p "src/app/(app)/courses/[courseId]/material"
git mv "src/app/(app)/courses/[courseId]/page.tsx" "src/app/(app)/courses/[courseId]/material/page.tsx"
```

Change nothing inside the file. It already reads `params.courseId`, which
resolves identically at the deeper route. Its `loadDemoReviewQueue`
fixture branch moves with it, which is required — `tests/visual/review-queue.spec.ts`
depends on it.

Rename the exported component for accuracy:

```tsx
export default async function CourseMaterialPage({
```

- [ ] **Step 2: Add Concepts to the tab bar and move Material**

In `src/components/course-shell.tsx`, replace the `SUB_NAV` array:

```tsx
const SUB_NAV = [
  { path: "", label: "Concepts", icon: <IconCourses /> },
  { path: "material", label: "Material", icon: <IconMaterial /> },
  { path: "atlas", label: "Atlas", icon: <IconAtlas /> },
  { path: "review", label: "Review", icon: <IconReview /> },
  { path: "tutor", label: "Tutor", icon: <IconTutor /> },
  { path: "exam-plan", label: "Exam plan", icon: <IconExam /> },
];
```

Add `IconCourses` to the existing `@/components/icons.tsx` import in
that file. Leave the "No Study tab here by design" comment above
`SUB_NAV` untouched — it documents a separate, still-valid decision.

- [ ] **Step 3: Retarget the visual spec**

In `tests/visual/review-queue.spec.ts`, every `page.goto` that targets
`/courses/demo` becomes `/courses/demo/material`. Run:
`grep -n "courses/demo" tests/visual/review-queue.spec.ts` and update each
hit. Change no assertion — the spec asserts the same thing at a new path.

- [ ] **Step 4: Update the e2e course-detail assertions**

Run: `grep -n "courses/\${courseId}\`\|courses/\${courseId}'" tests/e2e/basic-flows.spec.ts`

In `tests/e2e/basic-flows.spec.ts`, the sub-nav walk asserts each tab's
`href` and resulting URL. Add `material` to the list of paths it walks,
and make the assertion that the course root shows material-page content
instead target `/courses/${courseId}/material`. The existing regression
guard asserting no "Study" link in the nav stays exactly as-is.

- [ ] **Step 5: Verify**

Run: `export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH" && npm run typecheck` — expect PASS.
Run (no dev server running): `npx playwright test tests/visual/review-queue.spec.ts tests/e2e/basic-flows.spec.ts` — expect PASS.

- [ ] **Step 6: Commit**

```bash
git add -A "src/app/(app)/courses/[courseId]" src/components/course-shell.tsx tests/visual/review-queue.spec.ts tests/e2e/basic-flows.spec.ts
git commit -m "refactor: move course Material to its own route, add Concepts tab"
```

---

## Task 4: Add the play icon and the disabled-action affordance

Shared by both ▷ surfaces, so it lands once, before either consumer.

**Files:**
- Modify: `src/components/icons.tsx`
- Create: `src/features/courses/components/PendingActionButton.tsx`

**Interfaces:**
- Produces:
  - `IconPlay(): JSX.Element`
  - `PendingActionButton({ reason }: { reason: string }): JSX.Element`

- [ ] **Step 1: Add `IconPlay`**

Append to `src/components/icons.tsx`, matching the existing icons' shape
(16×16, `currentColor`, `stroke-width` 1.5):

```tsx
export function IconPlay() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M5.5 3.5L12 8l-6.5 4.5V3.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
```

- [ ] **Step 2: Create the disabled-action button**

Create `src/features/courses/components/PendingActionButton.tsx`:

```tsx
import { IconPlay } from "@/components/icons.tsx";

/**
 * A play control for a flow that genuinely does not exist yet (Deep
 * review is Phase 9; the Quick review quiz flow is Phase 4).
 *
 * It is deliberately a real, visibly-disabled button carrying its own
 * reason rather than either (a) a button wired to some other flow as a
 * stand-in or (b) a silently inert control. Both alternatives were
 * considered and rejected: this project's no-silent-placeholders rule
 * says an unavailable thing must look unavailable, and a button that
 * quietly does nothing is indistinguishable from one that is broken.
 *
 * `title` gives the reason on hover; `aria-label` folds it into the
 * accessible name so a screen-reader user gets the same explanation a
 * sighted user does, rather than hearing an unexplained "dimmed button".
 */
export function PendingActionButton({ reason }: { reason: string }) {
  return (
    <button type="button" disabled aria-label={reason} title={reason} style={s.button}>
      <IconPlay />
    </button>
  );
}

const s: Record<string, React.CSSProperties> = {
  button: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    flexShrink: 0,
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text-tertiary)",
    cursor: "not-allowed",
  },
};
```

- [ ] **Step 3: Verify**

Run: `export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH" && npm run typecheck` — expect PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/icons.tsx src/features/courses/components/PendingActionButton.tsx
git commit -m "feat: add play icon and an explicit pending-action button"
```

---

## Task 5: The Concepts screen

**Files:**
- Create: `src/features/courses/components/ConceptPath.tsx`
- Create: `src/features/courses/components/DueRail.tsx`
- Create: `src/app/(app)/courses/[courseId]/page.tsx`

**Interfaces:**
- Consumes: `groupConceptsByUnit`, `ConceptPathSection` (Task 1);
  `listCourseConceptsWithMastery` (Task 2); `PendingActionButton`
  (Task 4); existing `listUnits(courseId)` from
  `@/features/course-graph-ingestion/actions.ts` and existing
  `getDueQueue(courseId)` from `@/features/review-scheduler/due-queue.ts`.
- Produces: route `/courses/[courseId]` rendering the path.

- [ ] **Step 1: Build the due rail**

Create `src/features/courses/components/DueRail.tsx`:

```tsx
import type { DueQueueItem } from "@/features/review-scheduler/due-queue.ts";
import { PendingActionButton } from "@/features/courses/components/PendingActionButton.tsx";

const QUICK_REVIEW_PENDING = "Quick review is not built yet";

/**
 * "Due today" / "Due tomorrow" cards. The labels are not computed here:
 * due-queue-bucketing.ts's `bucketFor` already returns exactly the
 * strings "Due today" and "Due tomorrow" for daysUntilDue 0 and 1, so
 * this reuses `dueLabel` verbatim rather than re-deriving a second,
 * divergent copy of the same rule.
 */
export function DueRail({ items }: { items: DueQueueItem[] }) {
  const due = items.filter((i) => i.urgencyBucket === "today" || i.urgencyBucket === "overdue");

  return (
    <aside style={s.rail} aria-label="Due for review">
      {due.length === 0 ? (
        <p style={s.empty}>Nothing due right now.</p>
      ) : (
        due.map((item) => (
          <div key={item.conceptId} style={s.card}>
            <div style={s.cardText}>
              <span style={s.cardLabel}>{item.label}</span>
              <span style={s.cardDue}>{item.dueLabel}</span>
            </div>
            <PendingActionButton reason={QUICK_REVIEW_PENDING} />
          </div>
        ))
      )}
    </aside>
  );
}

const s: Record<string, React.CSSProperties> = {
  rail: { width: 240, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 },
  empty: { margin: 0, fontSize: 13, color: "var(--text-tertiary)" },
  card: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "10px 12px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
  },
  cardText: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
  cardLabel: { fontSize: 13.5, fontWeight: 500, color: "var(--text-primary)" },
  cardDue: { fontSize: 12, color: "var(--text-secondary)" },
};
```

- [ ] **Step 2: Build the path**

Create `src/features/courses/components/ConceptPath.tsx`:

```tsx
import type { ConceptPathSection, ConceptMasteryState } from "@/features/courses/concept-path.ts";
import { PendingActionButton } from "@/features/courses/components/PendingActionButton.tsx";

const DEEP_REVIEW_PENDING = "Deep review is not built yet";

/** Mastery is shown as a word, not only a color -- color alone would
 *  carry the whole meaning for a state this important. */
const MASTERY_LABEL: Record<ConceptMasteryState, string> = {
  unverified: "Not started",
  exposed: "Seen",
  weak: "Weak",
  solid: "Solid",
};

const MASTERY_COLOR: Record<ConceptMasteryState, string> = {
  unverified: "var(--text-tertiary)",
  exposed: "var(--accent-secondary)",
  weak: "var(--status-warning)",
  solid: "var(--status-success)",
};

export function ConceptPath({ sections }: { sections: ConceptPathSection[] }) {
  if (sections.length === 0) {
    return (
      <p style={s.empty}>
        No concepts yet. Upload course material and Orca will extract them.
      </p>
    );
  }

  return (
    <div style={s.path}>
      {sections.map((section) => (
        <section key={section.unitId ?? "unassigned"} style={s.section}>
          <h2 style={s.unitTitle}>{section.title}</h2>
          <ul style={s.list}>
            {section.concepts.map((concept) => (
              <li key={concept.id} style={s.row}>
                <div style={s.rowText}>
                  <span style={s.conceptName}>{concept.name}</span>
                  <span style={{ ...s.mastery, color: MASTERY_COLOR[concept.masteryState] }}>
                    {MASTERY_LABEL[concept.masteryState]}
                  </span>
                </div>
                <PendingActionButton reason={DEEP_REVIEW_PENDING} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  path: { display: "flex", flexDirection: "column", gap: 28, flex: 1, minWidth: 0 },
  empty: { margin: 0, fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.55 },
  section: { display: "flex", flexDirection: "column", gap: 10 },
  unitTitle: {
    margin: 0,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-tertiary)",
  },
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "12px 14px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
  },
  rowText: { display: "flex", flexDirection: "column", gap: 3, minWidth: 0 },
  conceptName: { fontSize: 14, fontWeight: 500, color: "var(--text-primary)", letterSpacing: "-0.01em" },
  mastery: { fontSize: 12, fontWeight: 500 },
};
```

- [ ] **Step 3: Create the landing page**

Create `src/app/(app)/courses/[courseId]/page.tsx`:

```tsx
import { listUnits } from "@/features/course-graph-ingestion/actions.ts";
import { getDueQueue } from "@/features/review-scheduler/due-queue.ts";
import { listCourseConceptsWithMastery } from "@/features/courses/concept-path-actions.ts";
import { groupConceptsByUnit } from "@/features/courses/concept-path.ts";
import { ConceptPath } from "@/features/courses/components/ConceptPath.tsx";
import { DueRail } from "@/features/courses/components/DueRail.tsx";

export default async function CourseConceptsPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;

  const [concepts, units, dueItems] = await Promise.all([
    listCourseConceptsWithMastery(courseId),
    listUnits(courseId),
    getDueQueue(courseId),
  ]);

  const sections = groupConceptsByUnit(
    concepts,
    units.map((u) => ({ id: u.id, title: u.title })),
  );

  return (
    <div style={s.page}>
      <div style={s.inner}>
        <ConceptPath sections={sections} />
        <DueRail items={dueItems} />
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    height: "100%",
    overflowY: "auto",
    background: "var(--bg)",
    padding: "36px 40px",
    display: "flex",
    justifyContent: "center",
  },
  inner: { width: "100%", maxWidth: 900, display: "flex", gap: 32, alignItems: "flex-start" },
};
```

- [ ] **Step 4: Verify**

Run: `export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH" && npm run typecheck` — expect PASS.
Run: `npx eslint src` — expect 0 errors.

- [ ] **Step 5: Manual visual check**

Run `nvm use 24 && npm run dev`, sign in, open a course with real
extracted concepts. Confirm: concepts appear grouped under their unit
headers; each row has a dimmed ▷ whose tooltip reads "Deep review is not
built yet"; the right rail shows due items (or "Nothing due right now.");
the Material tab still opens the upload/review page. Stop the dev server
before running any Playwright suite.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/courses/[courseId]/page.tsx" src/features/courses/components/ConceptPath.tsx src/features/courses/components/DueRail.tsx
git commit -m "feat: concept path as the course landing page"
```

---

## Task 6: AI Chat tab with course picker

**Files:**
- Create: `src/features/tutor-agent/components/CoursePicker.tsx`
- Create: `src/app/(app)/chat/page.tsx`
- Modify: `src/components/app-shell.tsx`

**Interfaces:**
- Consumes: existing `listCourses()` from `@/features/courses/actions.ts`.
- Produces: route `/chat`; a third bottom-nav entry.

- [ ] **Step 1: Build the picker**

Create `src/features/tutor-agent/components/CoursePicker.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import type { Course } from "@/features/courses/actions.ts";

/**
 * Chat needs a course before it can start.
 *
 * `tutor_conversations.course_id` is a NOT NULL foreign key, and that is
 * deliberate rather than incidental: every tutor answer is grounded in
 * one course's confirmed material, so a course-less conversation has no
 * grounding to check itself against. Rather than relax the column, this
 * asks which course first, then hands off to the existing per-course
 * tutor route unchanged.
 */
export function CoursePicker({ courses }: { courses: Course[] }) {
  const router = useRouter();

  if (courses.length === 0) {
    return (
      <p style={s.empty}>
        You need a course first — Orca grounds every answer in your own material.
      </p>
    );
  }

  return (
    <div style={s.wrap}>
      <p style={s.prompt}>Which course?</p>
      <div style={s.options}>
        {courses.map((course) => (
          <button
            key={course.id}
            type="button"
            onClick={() => router.push(`/courses/${course.id}/tutor`)}
            style={s.option}
          >
            {course.name}
          </button>
        ))}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 10, alignItems: "center" },
  prompt: { margin: 0, fontSize: 13.5, color: "var(--text-secondary)" },
  empty: { margin: 0, fontSize: 13.5, color: "var(--text-secondary)", textAlign: "center", lineHeight: 1.55 },
  options: { display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  option: {
    padding: "8px 14px",
    background: "var(--surface)",
    color: "var(--text-primary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    fontSize: 13.5,
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
  },
};
```

- [ ] **Step 2: Create the chat page**

Create `src/app/(app)/chat/page.tsx`:

```tsx
import { listCourses } from "@/features/courses/actions.ts";
import { CoursePicker } from "@/features/tutor-agent/components/CoursePicker.tsx";

export default async function ChatPage() {
  const courses = await listCourses();

  return (
    <div style={s.page}>
      <div style={s.inner}>
        <h1 style={s.heading}>What would you like to learn today?</h1>
        <CoursePicker courses={courses} />
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    height: "100%",
    overflowY: "auto",
    background: "var(--bg)",
    padding: "36px 40px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  inner: { width: "100%", maxWidth: 560, display: "flex", flexDirection: "column", gap: 24, alignItems: "center" },
  heading: {
    margin: 0,
    fontSize: 24,
    fontWeight: 500,
    letterSpacing: "-0.03em",
    color: "var(--text-primary)",
    textAlign: "center",
  },
};
```

Note: the wireframe draws a message input on this screen. It is not built
here on purpose — typing a message before a course is chosen has nowhere
to go, since `startConversation` requires a course id. The input lives on
the existing per-course tutor screen the picker routes to.

- [ ] **Step 3: Add the Chat nav entry**

In `src/components/app-shell.tsx`, extend `NAV_MAIN` and its import:

```tsx
import { IconToday, IconCourses, IconTutor } from "@/components/icons.tsx";

const NAV_MAIN = [
  { href: "/", label: "Today", icon: <IconToday />, exact: true },
  { href: "/courses", label: "Courses", icon: <IconCourses />, exact: false },
  { href: "/chat", label: "Chat", icon: <IconTutor />, exact: false },
];
```

Change nothing else in that file — the bar is already a flex row whose
items are `flex: 1`, so a third item lays out correctly with no CSS change.

- [ ] **Step 4: Verify**

Run: `export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH" && npm run typecheck` — expect PASS.

- [ ] **Step 5: Manual visual check**

`npm run dev`, sign in, tap Chat. Confirm the empty state renders, the
course list appears, and picking one lands on that course's tutor page
with a working conversation. Confirm the bottom bar now shows three
evenly-spaced items at both desktop and phone widths. Stop the dev
server afterwards.

- [ ] **Step 6: Commit**

```bash
git add src/features/tutor-agent/components/CoursePicker.tsx "src/app/(app)/chat/page.tsx" src/components/app-shell.tsx
git commit -m "feat: top-level AI Chat tab with a course picker"
```

---

## Task 7: Create-course modal

**Files:**
- Create: `src/features/courses/components/CreateCourseModal.tsx`
- Modify: `src/app/(app)/courses/page.tsx`

**Interfaces:**
- Consumes: existing `createCourse` server action and the existing
  `CreateCourseForm` component, both unchanged.

- [ ] **Step 1: Build the modal**

Create `src/features/courses/components/CreateCourseModal.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { Course } from "@/features/courses/actions.ts";
import { CreateCourseForm } from "@/features/courses/components/CreateCourseForm.tsx";
import { IconPlus, IconClose } from "@/components/icons.tsx";

/**
 * Wraps the existing CreateCourseForm in a modal so the course list
 * isn't dominated by a form that's used once per course. The form and
 * its server action are untouched -- this only changes where it lives.
 */
export function CreateCourseModal({
  createCourse,
}: {
  // Exactly the prop type CreateCourseForm already declares -- this
  // component only forwards it, so the two must not drift.
  createCourse: (name: string) => Promise<{ course: Course } | { error: string }>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={s.trigger}>
        <IconPlus />
        Add class
      </button>

      {open && (
        <div style={s.backdrop} role="dialog" aria-modal="true" aria-label="Add a class">
          <div style={s.panel}>
            <div style={s.header}>
              <h2 style={s.title}>Class name</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" style={s.close}>
                <IconClose />
              </button>
            </div>
            <CreateCourseForm createCourse={createCourse} />
          </div>
        </div>
      )}
    </>
  );
}

const s: Record<string, React.CSSProperties> = {
  trigger: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 14px",
    background: "var(--accent)",
    color: "var(--accent-fg)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    fontSize: 13.5,
    fontFamily: "var(--font-sans)",
    fontWeight: 500,
    cursor: "pointer",
  },
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgb(0 0 0 / 0.35)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    zIndex: 50,
  },
  panel: {
    width: "100%",
    maxWidth: 420,
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  title: { margin: 0, fontSize: 16, fontWeight: 500, letterSpacing: "-0.02em", color: "var(--text-primary)" },
  close: {
    display: "flex",
    alignItems: "center",
    background: "transparent",
    border: "none",
    color: "var(--text-tertiary)",
    cursor: "pointer",
    padding: 4,
  },
};
```

- [ ] **Step 2: Swap the inline form for the modal trigger**

In `src/app/(app)/courses/page.tsx`:
- Replace the import of `CreateCourseForm` with `CreateCourseModal`.
- Replace `<CreateCourseForm createCourse={createCourse} />` with
  `<CreateCourseModal createCourse={createCourse} />`, and move it inside
  the existing `s.pageHeader` div (after the title block) so the trigger
  sits beside the heading rather than above the list.

Leave `CreateCourseForm` itself in place — the modal renders it.

- [ ] **Step 3: Verify**

Run: `export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH" && npm run typecheck` — expect PASS.
Run: `npx playwright test tests/e2e/basic-flows.spec.ts` — this suite
creates a course through the UI. If it fails because the form is now
behind a trigger, add a click on "Add class" before the form
interaction; change no assertion.

- [ ] **Step 4: Manual visual check**

`npm run dev`, open Courses, click "Add class", create a course, confirm
it appears in the list and the modal closes. Stop the dev server after.

- [ ] **Step 5: Commit**

```bash
git add src/features/courses/components/CreateCourseModal.tsx "src/app/(app)/courses/page.tsx" tests/e2e/basic-flows.spec.ts
git commit -m "feat: move course creation into a modal over the course list"
```

---

## Task 8: Full regression, visual re-baseline, and docs

**Files:**
- Modify: `tests/visual/*-snapshots/*` (regenerated)
- Modify: `brain/design-context/page-map.md`
- Modify: `brain/design-context/navigation-flow.md`
- Modify: `docs/implementation-roadmap.md`
- Modify: `brain/decisions/architecture-log.md`

- [ ] **Step 1: Full local suite**

Run, with no dev server running:

```bash
export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"
npm run typecheck
npx eslint src tests trigger
npm run test:unit
npx playwright test tests/visual/ tests/e2e/smoke.spec.ts tests/e2e/basic-flows.spec.ts
```

Expected: typecheck clean; eslint 0 errors; 360/360 unit; e2e/visual pass.
`course-graph-ingestion-pipeline.spec.ts` fails on a credit-less OpenAI
account — a known operational failure, not caused by this work
(architecture-log 2026-09-28).

- [ ] **Step 2: Re-baseline visual snapshots**

Run: `npx playwright test tests/visual/ --update-snapshots=all`

Use `=all`, not the bare flag: the bare flag only rewrites baselines
whose comparison *failed*, and a small uniform change can pass under
Playwright's per-pixel threshold while leaving committed baselines
depicting stale UI (architecture-log 2026-09-28).

Open at least two regenerated PNGs and confirm they show the intended
screens, not a broken render. Then run `npx playwright test tests/visual/`
again (no flag) and expect PASS.

- [ ] **Step 3: Regenerate the Linux baselines**

`--update-snapshots=all` on macOS regenerates only `-darwin` baselines.
Real `-linux` ones can only be produced on CI's own `ubuntu-latest`
runner. Restore the one-off workflow from git history, run it once,
download the artifact, eyeball the PNGs, commit them, then delete the
workflow again:

```bash
git checkout de2071b -- .github/workflows/regen-linux-snapshots.yml
git add .github && git commit -m "ci: temporarily re-add Linux baseline regen workflow"
git push origin <branch>
gh workflow run regen-linux-snapshots.yml -f ref=<branch>
```

Then `gh run download <id> -n linux-visual-baselines`, copy the PNGs over
`tests/visual/**`, `git rm` the workflow, and commit.

- [ ] **Step 4: Update the design-context docs**

In `brain/design-context/page-map.md`, add entries for
`/courses/[courseId]` (now the concept path), `/courses/[courseId]/material`,
and `/chat`, and correct the old `/courses/[courseId]` description.

In `brain/design-context/navigation-flow.md`, update the click-path: the
bottom bar now has three entries, and a course opens on Concepts rather
than Material.

- [ ] **Step 5: Update the roadmap**

In `docs/implementation-roadmap.md`, mark Phase 2 of the Orca redesign as
shipped in the same paragraph that records Phase 1, naming what landed
(concept path, chat entry, create-course modal) and what is explicitly
still pending (both ▷ controls, awaiting Phases 4 and 9).

- [ ] **Step 6: Log the decisions**

Append an entry to `brain/decisions/architecture-log.md` covering: the
route move and why the visual spec moved with it; why the ▷ controls ship
disabled rather than wired to Quick review; why the chat picker exists
instead of relaxing `tutor_conversations.course_id`; and that the parent
design doc's "compatible as-is" audit for this screen was optimistic —
`getDailyReviewSession` only returns *due* concepts, so one new read
action was genuinely required.

- [ ] **Step 7: Commit**

```bash
git add tests/visual brain docs
git commit -m "docs: record Orca Phase 2 as shipped"
```

---

## Self-Review

**Spec coverage:** Concepts screen as landing page (Tasks 3, 5); grouping
under unit headers with explicit Unassigned (Task 1); due rail from
`bucketFor`'s existing labels (Task 5); both ▷ disabled with a visible
reason, exposed to assistive tech (Task 4); the one new read action
(Task 2); chat tab + picker preserving the NOT NULL grounding constraint
(Task 6); create-course modal (Task 7); route move carrying the `demo`
fixture branch and its visual spec (Task 3); unit tests test-first
(Task 1); visual re-baseline with `=all` on both platforms (Task 8).
Every spec section maps to a task.

**Placeholder scan:** No TBD/TODO. The two deliberate incomplete states
(the disabled ▷ controls) are explicit, justified in code comments, and
surfaced to users and screen readers — they are the spec's requirement,
not a plan gap.

**Type consistency:** `ConceptPathConcept`/`ConceptPathUnit`/
`ConceptPathSection` are defined once in Task 1 and consumed with those
exact names in Tasks 2 and 5. `listCourseConceptsWithMastery` is named
identically in Tasks 2 and 5. `PendingActionButton({ reason })` is
defined in Task 4 and called with that one prop in both Task 5
components. `DueQueueItem`'s fields (`conceptId`, `label`, `dueLabel`,
`urgencyBucket`) match `due-queue.ts` as read during planning.
`CreateCourseModal`'s `createCourse` prop was corrected during this
self-review to `(name: string) => Promise<{ course: Course } | { error:
string }>`, matching both the real server action and the prop type
`CreateCourseForm` already declares -- an earlier draft had invented a
`{ courseId, error }` shape that does not exist.
