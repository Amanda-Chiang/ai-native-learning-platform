---

description: "Task list template for feature implementation"
---

# Tasks: Course Graph Ingestion

**Input**: Design documents from `/specs/004-course-graph-ingestion/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ingestion-actions.md, quickstart.md

**Tests**: Included, same reasoning as Phase 2 (`concept-atlas-renderer`):
the pure-logic pieces (reconciliation classification, materialization,
extraction-schema validation) don't need a browser or live OpenAI key to
verify meaningfully, so they get `node --test` unit tests written
test-first. The review-queue UI gets Playwright visual regression, same
pattern as the atlas renderer. Extraction itself (the actual OpenAI call)
is only verifiable live (quickstart.md Group C) — no test task pretends
otherwise.

**Organization**: Tasks are grouped by user story (spec.md priorities:
US1/US2 = P1, US3 = P2, US4 = P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US4)
- Every task includes its exact file path

## Path Conventions

Single Next.js project (per plan.md's Project Structure):
`src/features/course-graph-ingestion/`, `trigger/`, `src/lib/openai/`,
`supabase/migrations/`, `tests/unit/course-graph-ingestion/`,
`tests/visual/`, `scripts/`.

---

## Phase 1: Setup

- [X] T001 Add `openai` to `package.json` dependencies (`npm install openai`)
- [X] T002 Add `OPENAI_API_KEY` documentation to `.env.example` if not
  already present from Phase 2's OpenAI-key discussion — confirm the
  comment matches how the key is actually consumed by this feature (not
  copy-pasted boilerplate). Already present from Phase 2's setup;
  confirmed accurate as written.
- [X] T003 [P] Create `src/lib/openai/client.ts`: a thin factory
  returning a configured `OpenAI` client, same shape as
  `src/lib/supabase/client.ts`/`server.ts` — must NOT throw at import
  time if `OPENAI_API_KEY` is unset (mirrors Phase 1's "every shared
  entrypoint must tolerate missing credentials" rule); callers check for
  a configured client explicitly, per research.md's missing-key decision

**Checkpoint**: Dependency installed, credential plumbing in place, no
feature logic yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema and shared types every user story writes to or reads
from. No user story can be implemented before this phase completes.

- [X] T004 Write `supabase/migrations/0003_course_ontology.sql` per
  data-model.md: `course_units`, `course_concepts`, `concept_edges`,
  `extraction_runs`, `reconciliation_decisions`, `concept_flags`, all
  columns/check constraints/RLS policies exactly as specified (including
  the database-level `source_anchors` non-empty check and the
  `concept_edges` self-reference check — these are hard invariants, not
  optional hardening)
- [X] T005 Push the migration (`npx supabase db push`) and verify RLS: an
  anon-key query against each new table returns `status=200, rows=0` for
  a signed-out session (quickstart.md B1) — do not proceed until this is
  confirmed against the live project, not just read from the SQL file.
  Pushed and verified live: all six tables return `status=200, rows=0`.
- [X] T006 Extend `src/lib/supabase/database.types.ts` with the six new
  tables' row/insert/update types, same pattern used for `graph_layouts`
  in Phase 2
- [X] T007 [P] Create `src/features/course-graph-ingestion/extraction-schema.ts`:
  the Structured Outputs JSON schema for one extraction call (candidate
  concepts + candidate edges, matching `CourseConcept`/`ConceptEdge`'s
  shape minus `id`/`status`/`extraction_run_id`, which the pipeline
  assigns) plus a narrowing function that validates a raw OpenAI response
  against it before any code treats the response as real data — an
  unparseable/schema-violating response must produce a distinct error,
  never a value that looks like a valid empty result
- [X] T008 [P] Write `tests/unit/course-graph-ingestion/extraction-schema.test.ts`:
  a well-formed sample response parses into candidates; a response
  missing a required field is rejected, not silently coerced; a response
  with zero candidates parses as a valid empty list (spec Edge Cases —
  distinguishable from a parse failure). Also found and fixed: the "@/"
  tsconfig path alias only resolves under Next.js's bundler, not plain
  `node --test`, for a real (non-type-only) runtime import — switched to
  a relative import in extraction-schema.ts.

**Checkpoint**: Schema live and RLS-verified; the shape every extraction
call must conform to is defined and tested. No extraction logic yet.

---

## Phase 3: User Story 1 - Extract concepts and relationships from an uploaded artifact (Priority: P1)

**Goal**: Trigger extraction against one artifact; get back source-anchored
candidate concepts/edges at `proposed` status.

**Independent Test**: Upload a single artifact, run extraction, confirm at
least one concept and one relationship are produced, each with a
non-empty source anchor into that artifact (spec.md).

**Depends on**: Phase 2 (schema, extraction-schema.ts).

### Implementation for User Story 1

- [X] T009 [US1] Create `trigger/extract-course-graph.ts`: reads the
  artifact via Supabase Storage (same admin-client pattern as
  `trigger/ingest-artifact.ts`), calls OpenAI with `extraction-schema.ts`'s
  schema and the artifact's file content (direct file/image input per
  research.md — no separate OCR step), writes an `extraction_runs` row
  tracking status through `queued` → `processing` → `completed`/`failed`
- [X] T010 [US1] In `extract-course-graph.ts`: guard on
  `OPENAI_API_KEY` being configured before any OpenAI call — if unset,
  write `extraction_runs.status = "failed"` with the exact
  `failure_reason` string from research.md, and return without a
  fabricated empty-success result
- [X] T011 [US1] In `extract-course-graph.ts`: if the artifact can't be
  read from Storage, write a distinct `"failed"` status with a specific
  reason (FR-012) — reuse the same file-existence check pattern already
  proven in `trigger/ingest-artifact.ts`, don't reimplement it
  differently
- [X] T012 [US1] In `extract-course-graph.ts`: for a course with zero
  existing `course_concepts` rows (the true first-artifact case — nothing
  to reconcile against, not a stubbed-out shortcut), write every
  validated candidate directly as a `proposed` `course_concepts`/
  `concept_edges` row with `extraction_run_id` set and `source_anchors`
  populated from the schema's per-candidate anchor field
- [X] T013 [US1] Idempotency guard in `extract-course-graph.ts`: on
  start, check for an existing `extraction_runs` row for this
  `artifactId` already in `"completed"` or `"failed"` status; if found,
  return `{ skipped: true, reason: "already terminal" }` without calling
  OpenAI again (research.md)
- [X] T014 [US1] In `trigger/ingest-artifact.ts`: after setting an
  artifact's status to `"ready"`, trigger `extractCourseGraphTask` with
  `{ artifactId, courseId }` — additive change to the existing task, does
  not alter its own tested status-transition logic
- [X] T015 [P] [US1] Write `tests/unit/course-graph-ingestion/extraction-run-status.test.ts`:
  the missing-key path produces `status: "failed"` with the exact
  documented reason (not empty/zero-concepts indistinguishable from real
  extraction); the unreadable-artifact path produces a distinct `"failed"`
  reason from the missing-key path (two different failures must not
  collapse into one message); zero extractable content produces
  `status: "completed"` with `concepts_extracted: 0` (spec Edge Cases —
  genuinely different from both failure cases). Note on scope: the task
  function itself is tightly coupled to a live Supabase admin client and
  the OpenAI SDK, with no fake/mock for either in this project yet — the
  test file honestly covers what's unit-testable without one (the two
  failure-reason constants are distinct strings; a zero-candidate result
  is a valid non-failure parse) and documents that full status-transition
  verification is quickstart.md Group C's job (live-credential manual
  verification), not claimed as covered here.

**Checkpoint**: An uploaded artifact can be turned into source-anchored
proposed concepts/edges. Nothing is visible to a reviewer yet (that's
US3) and no reconciliation runs yet against pre-existing concepts (US2).

---

## Phase 4: User Story 2 - Reconcile new extractions against the existing course ontology (Priority: P1)

**Goal**: A second (or later) artifact's overlapping candidates merge as
aliases onto existing concepts instead of duplicating them.

**Independent Test**: Extract from two artifacts discussing the same
concept under different phrasing; confirm one concept results, with
source anchors into both artifacts, not two concepts (spec.md).

**Depends on**: Phase 3 (US1 — reconciliation only applies to candidates
US1's extraction already produced).

### Implementation for User Story 2

- [X] T016 [US2] Create `src/features/course-graph-ingestion/reconciliation.ts`:
  given one candidate (concept or edge) and the course's current
  concept list (canonical names, aliases, short descriptions — not full
  source text, per research.md), calls OpenAI with a Structured Outputs
  schema constrained to exactly `{ decision: "merge" | "distinct" | "uncertain", matchedConceptId?: string, reasoning: string }`
  and returns that decision — no numeric threshold anywhere in this
  function's contract
- [X] T017 [P] [US2] Write `tests/unit/course-graph-ingestion/reconciliation.test.ts`:
  using a fixture course concept list built from
  `benchmark/dsa-course/concepts.json`'s "Breadth-First Search"/"BFS"
  pair (the corpus's own `multiAliasConcept` edge case), a mocked
  `"merge"` response resolves to the existing concept's id; a mocked
  `"uncertain"` response is distinguishable in the returned type from
  `"distinct"` (not just a comment — the type itself must make "the
  system wasn't sure" impossible to accidentally treat the same as
  "confidently different")
- [X] T018 [US2] Wire `reconciliation.ts` into
  `trigger/extract-course-graph.ts`: when the course already has
  `course_concepts` rows (proposed or confirmed), call reconciliation for
  each candidate concept before writing it; on `"merge"`, update the
  matched existing concept's `aliases` and append the new artifact's
  entry to its `source_anchors` instead of inserting a new row; on
  `"distinct"`/`"uncertain"`, insert as a new `proposed` row as in T012;
  write one `reconciliation_decisions` row per candidate evaluated,
  including the model's `reasoning` verbatim
- [X] T019 [US2] In `extract-course-graph.ts`: after reconciliation
  resolves both endpoints of a candidate edge to their final concept ids
  (following any merge), if source and target are now equal, drop the
  edge before writing it, increment
  `extraction_runs.edges_dropped_self_referential`, and do not write a
  `concept_edges` row for it (FR-011, research.md)
- [X] T020 [P] [US2] Write `tests/unit/course-graph-ingestion/self-referential-edge.test.ts`:
  a candidate edge whose two endpoints both reconcile (merge) onto the
  same existing concept is dropped and counted, not written; an ordinary
  edge between two genuinely distinct concepts is unaffected by this
  check

**Checkpoint**: A second artifact covering overlapping material no longer
creates duplicate concepts. `reconciliation_decisions` gives an auditable
record of every merge/keep-separate/uncertain call.

---

## Phase 5: User Story 3 - Review queue for extracted candidates (Priority: P2)

**Goal**: A reviewer can see, confirm, edit, or reject proposed
concepts/edges; only confirmed ones reach the rendered atlas.

**Independent Test**: With pending proposed concepts/edges, confirm one
and reject another; verify only the confirmed one renders (spec.md).

**Depends on**: Phase 3 (US1, produces candidates to review) and Phase 4
(US2, so reconciliation context is available to show reviewers) — this
story's UI is meaningless with nothing in the queue, and its
"reconciliation reasoning visible" requirement needs US2's data to exist.

### Implementation for User Story 3

- [ ] T021 [US3] Create `src/features/course-graph-ingestion/materialize-course-graph.ts`
  per data-model.md: pure function, `course_units` + `status: "confirmed"`
  concepts/edges only → `CourseGraph` DTO, baseline `masteryState:
  "unverified"` / `learnerState: "strong"` for every entry, `crossUnit`
  computed from differing `unit_id`s, throws if a confirmed concept's
  `unit_id` doesn't resolve to any given unit (never silently omits or
  defaults it)
- [ ] T022 [P] [US3] Write `tests/unit/course-graph-ingestion/materialize-course-graph.test.ts`:
  a confirmed concept/edge appear in the output at the baseline states
  above (never a higher/fabricated state); a `proposed` or `archived`
  concept/edge is excluded; zero confirmed units/concepts/edges produces
  `{ units: [], concepts: [], relationships: [] }`, not an error; a
  confirmed concept with an unresolvable `unit_id` throws
- [ ] T023 [US3] Create `src/features/course-graph-ingestion/actions.ts`
  with `getReviewQueue(courseId)` per contracts/ingestion-actions.md:
  RLS-scoped read of `proposed` concepts/edges, each joined with its
  `reconciliation_decisions` entry (if any) and any `concept_flags`
  referencing it
- [ ] T024 [US3] In `actions.ts`: `confirmCandidate(kind, id)` — sets
  `status: "confirmed"`, returns a specific error (not generic) if the
  row isn't currently `"proposed"`
- [ ] T025 [US3] In `actions.ts`: `editCandidate(kind, id, edits)` —
  applies a reviewer correction, re-validates against `isCourseConcept`/
  `isConceptEdge`'s existing rules (never allows editing
  `source_anchors`/`status`/`confidence` directly), rejects an edit that
  would produce an invalid record with the specific validation failure
- [ ] T026 [US3] In `actions.ts`: `rejectCandidate(kind, id)` — sets
  `status: "archived"` (never a hard delete, FR-007)
- [ ] T027 [US3] In `actions.ts`: `getCourseGraph(courseId)` — calls
  `materializeCourseGraph` against that course's confirmed
  units/concepts/edges
- [ ] T028 [US3] Update `src/app/courses/[courseId]/atlas/page.tsx` to
  call `getCourseGraph(courseId)` instead of reading
  `tests/fixtures/concept-atlas-demo.json` — the fixture file itself
  stays in place for `concept-atlas-renderer`'s own tests, which
  continue to read it directly and are unaffected by this change
- [ ] T029 [US3] Create `src/features/course-graph-ingestion/components/ReviewQueue.tsx`:
  lists proposed concepts/edges from `getReviewQueue`, shows each one's
  reconciliation reasoning (when present) and flags (when present)
  visibly distinguished from an item with neither, with confirm/edit/
  reject controls wired to T024-T026
- [ ] T030 [P] [US3] Write `tests/visual/review-queue.spec.ts`: a
  proposed-concepts screenshot (queue populated via a seeded fixture, not
  live OpenAI), and a post-confirm screenshot showing the item removed
  from the queue

**Checkpoint**: The full extract → review → render pipeline works
end-to-end for a course with existing data. This is the first point
students would actually see anything from this feature.

---

## Phase 6: User Story 4 - Student flags a concept or relationship (Priority: P3)

**Goal**: A flag is recorded as feedback without altering canonical data.

**Independent Test**: Submit a flag with a reason; confirm it's recorded
and the flagged item is unchanged for other viewers immediately after
(spec.md).

**Depends on**: Phase 5 (US3 — flags are surfaced in the review queue
built there; flagging something not yet reviewable has no UI to flag
from).

### Implementation for User Story 4

- [ ] T031 [US4] In `actions.ts`: `submitFlag(targetKind, targetId, reason)`
  per contracts/ingestion-actions.md — rejects an empty/whitespace-only
  reason client- and server-side, sets `reporter_id` from the
  authenticated session only (never accepted as a parameter, matching
  `courses/actions.ts`'s `owner_id` convention), does not touch
  `course_concepts`/`concept_edges` in any way
- [ ] T032 [US4] Add a flag affordance to
  `src/features/concept-atlas/components/ConceptDetailPanel.tsx`: an
  optional `onFlag?: (reason: string) => void` prop (same optional-prop
  pattern already used for `onFlagEdge`-style extensions in that file),
  rendered as a small reason-entry control in both `ConceptDetail` and
  `RelationshipDetail` — wired to `submitFlag` from the page/course level,
  not hardcoded into the renderer feature itself (keeps
  `concept-atlas-renderer` unaware of `course-graph-ingestion`,
  consistent with Constitution Principle I's renderer-neutral boundary)
- [ ] T033 [US4] Update `ReviewQueue.tsx` (T029) to visibly surface a
  candidate's flag count/reasons if any exist by the time it's reviewed
  (data already included via `getReviewQueue`'s join from T023 — this
  task is the UI rendering of it, not new data plumbing)
- [ ] T034 [P] [US4] Write
  `tests/unit/course-graph-ingestion/submit-flag.test.ts` (or an
  integration-style test against a seeded Supabase project, per this
  feature's Testing conventions): submitting a flag inserts exactly one
  `concept_flags` row and leaves the target's `course_concepts`/
  `concept_edges` row byte-for-byte unchanged (FR-010) — assert on the
  row before and after, not just on the flag's own insertion succeeding

**Checkpoint**: All four user stories complete. A course's ontology can be
extracted, reconciled, reviewed, rendered, and corrected by feedback —
closing the loop spec.md's exit criterion describes.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T035 Create `scripts/score-extraction.ts` per research.md's
  "Extraction scoring" decision: runs extraction (via the same
  `extract-course-graph.ts`/`reconciliation.ts` logic, not a parallel
  reimplementation) against `benchmark/dsa-course/sources/*.md`, computes
  precision/recall against `concepts.json`/`edges.json` using
  reconciliation itself as the matching function, writes/reads a recorded
  baseline file, exits non-zero only on regression — requires `US1` and
  `US2` both complete since it exercises both
- [ ] T036 Run `npm run typecheck` across the whole repository — expect
  PASS with no regressions outside this feature
- [ ] T037 Run `npm run test:unit` — expect PASS (all prior phases' tests
  plus this feature's extraction-schema/reconciliation/materialization/
  self-referential-edge/submit-flag tests)
- [ ] T038 Run `tests/visual/review-queue.spec.ts` and manually open each
  diff image before accepting any baseline — per the same "never approve
  blindly" rule already followed throughout `concept-atlas-renderer`
- [ ] T039 Walk through `quickstart.md` Groups A and B end to end
  (Group C requires a live `OPENAI_API_KEY` and is documented as a manual
  verification step, not automated here — do not claim it was run
  without actually running it against a live key)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational only — the MVP:
  extraction alone, no reconciliation, no review UI.
- **User Story 2 (Phase 4)**: Depends on US1 (reconciliation only applies
  to candidates US1's pipeline already produces) — both are P1 because a
  second artifact is expected almost immediately in real use, but they
  are still separately testable per their own Independent Test criteria.
- **User Story 3 (Phase 5)**: Depends on US1 AND US2 (a review queue with
  nothing in it, or with reconciliation context missing, doesn't
  demonstrate this story's actual behavior).
- **User Story 4 (Phase 6)**: Depends on US3 (flags need something
  reviewable to flag against).
- **Polish (Phase 7)**: Depends on all four user stories (the scoring
  script specifically needs both US1 and US2).

### Within Each User Story

- US1: task scaffolding and each failure-mode guard in sequence (same
  file, `extract-course-graph.ts`, so not parallelizable with itself),
  then the idempotency guard, then wiring from `ingest-artifact.ts`
  (different file, but logically last since it's what makes US1 actually
  reachable end-to-end), then its test.
- US2: reconciliation logic and its test can be written together
  (T016/T017), then wired into the same `extract-course-graph.ts` file
  US1 already built (sequential, same file), then the self-referential
  check and its test.
- US3: the pure materialization function and its test first (no
  dependency on anything else in this phase), then the four server
  actions (same file, `actions.ts`, sequential), then the page wiring,
  then the component, then its screenshot.
- US4: extends `actions.ts` (T031) and `ConceptDetailPanel.tsx` (T032) —
  different files, but both depend on US3's `ReviewQueue.tsx`/`actions.ts`
  already existing.

### Parallel Opportunities

- T003 (openai client) can happen alongside T001/T002 — different files.
- T007/T008 (extraction-schema + its test) in parallel once T004-T006
  exist — no dependency on each other's completion, only on the schema
  existing conceptually.
- T015 (US1's test), T017/T020 (US2's tests), T022 (US3's test), T034
  (US4's test) can each be written in parallel with their story's
  non-test tasks once the function/action they test has a defined
  signature, even before the implementation is finished (test-first).

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (T004-T005 — blocks everything; must be
   verified live against Supabase, not just written)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: upload one real artifact, confirm an
   `extraction_runs` row reaches `"completed"` with at least one
   source-anchored concept, `npm run typecheck` and this story's unit
   tests pass
5. This alone proves the core extraction loop works before any
   reconciliation, review, or rendering exists

### Incremental Delivery

1. Setup + Foundational → schema live, RLS-verified
2. US1 → an artifact produces source-anchored proposed candidates (MVP)
3. US2 → a second overlapping artifact doesn't duplicate concepts
4. US3 → a reviewer can actually see and act on candidates; the atlas
   renders real course data for the first time (not the static fixture)
5. US4 → students can flag without corrupting canonical ontology
6. Polish → offline scoring harness, full test suite, quickstart walkthrough

### Solo Build Note

Same as prior phases: `[P]` markers mark ordering-independence, not
parallel staffing. Commit after each task or tight cluster, solo-authored,
no AI co-author trailer, per project convention.

---

## Notes

- No task in this file treats "OpenAI wasn't configured" or "extraction
  returned nothing" as equivalent to a genuine empty result — every such
  path has a distinct, tested status, per the no-silent-placeholders rule
  (`brain/decisions/architecture-log.md`, 2026-09-01).
- `scripts/score-extraction.ts` (T035) is deliberately last, not part of
  US1, because it needs reconciliation (US2) to do concept matching —
  building it before US2 exists would mean either a fake matching
  algorithm now thrown away later, or blocking US1's own checkpoint on
  work that isn't US1's job. Called out explicitly here rather than left
  as an unexplained ordering choice.
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that
  aren't called out explicitly (US3's dependency on both US1 and US2, and
  US4's dependency on US3, are documented above, not hidden).
