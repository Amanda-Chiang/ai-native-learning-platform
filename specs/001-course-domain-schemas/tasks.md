---

description: "Task list template for feature implementation"
---

# Tasks: Course Domain Schemas & Benchmark Corpus

**Input**: Design documents from `/specs/001-course-domain-schemas/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md (all present; no `contracts/` — this feature has no external interface)

**Tests**: Included. This feature's own functional requirements (FR-009–FR-013) and quickstart validation scenarios are automated tests, not optional TDD scaffolding — the benchmark corpus's entire purpose is to be mechanically checkable.

**Organization**: Tasks are grouped by user story (spec.md priorities P1/P1/P2) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Every task includes its exact file path

## Path Conventions

Single project (per plan.md's Project Structure): `src/types/domain/`,
`benchmark/dsa-course/`, `tests/unit/domain/` at repository root.

---

## Phase 1: Setup

**Purpose**: Create the directories this feature's files live in.

- [X] T001 Create `src/types/domain/`, `benchmark/dsa-course/rubrics/`, and `tests/unit/domain/` directories (all already scaffolded as empty except `src/types/`, which needs the `domain/` subfolder)

**Checkpoint**: Directories exist; no code yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The one shape shared by three of the four domain schemas (per data-model.md's "SourceAnchor (shared shape, not a top-level entity)"). Must exist before `CourseConcept`, `ConceptEdge`, or `Assessment` can be typed.

**⚠️ CRITICAL**: No User Story 1 schema task can begin until T002 is complete.

- [X] T002 Define the `SourceAnchor` type (`artifactId: string`, `locator: string`, `excerpt: string`) in `src/types/domain/source-anchor.ts`, per data-model.md's SourceAnchor table

**Checkpoint**: Shared type ready; schema implementation can begin.

---

## Phase 3: User Story 1 - Stable domain vocabulary to build every later phase against (Priority: P1) 🎯 MVP

**Goal**: Four TypeScript domain-schema modules (`CourseConcept`, `ConceptEdge`, `EvidenceEvent`, `Assessment`) that structurally enforce Constitution Principles I, II, III, and V (renderer-neutral, evidence append-only, exposure≠mastery, source-anchored).

**Independent Test**: `npm run typecheck` passes, and each schema's shape test (below) passes against one real hand-written example instance.

### Tests for User Story 1

> Write these first; they must fail (module not found) before the schemas exist.

- [X] T003 [P] [US1] Write shape test in `tests/unit/domain/concept.test.ts`: one valid `CourseConcept` example passes; an example missing `sourceAnchors` fails; an example with `canonicalName` duplicated inside its own `aliases` fails (data-model.md validation rules)
- [X] T004 [P] [US1] Write shape test in `tests/unit/domain/concept-edge.test.ts`: one valid `ConceptEdge` example passes; an example with `relationType: "other"` and no `relationTypeNote` fails; an example with `relationType` other than `"other"` that *has* a `relationTypeNote` fails (the conditional-field rule from data-model.md)
- [X] T005 [P] [US1] Write shape test in `tests/unit/domain/evidence-event.test.ts`: one valid `EvidenceEvent` example passes; an example with both `conceptIds` and `edgeIds` empty fails; an example with none of `sourceArtifactId`/`assessmentAttemptId`/`conversationTurnId` set fails; assert the type has no exported update/delete function (Constitution Principle II — append-only by construction)
- [X] T006 [P] [US1] Write shape test in `tests/unit/domain/assessment.test.ts`: one valid `Assessment` example passes; an example with both `targetConceptIds` and `targetEdgeIds` empty fails

- [X] T007 Run `node --test tests/unit/domain/concept.test.ts tests/unit/domain/concept-edge.test.ts tests/unit/domain/evidence-event.test.ts tests/unit/domain/assessment.test.ts` — expect FAIL (`Cannot find module '../../../src/types/domain/...'`)

### Implementation for User Story 1

- [X] T008 [P] [US1] Implement `CourseConcept` in `src/types/domain/concept.ts` (fields per data-model.md: `id`, `courseId`, `unitId`, `canonicalName`, `aliases`, `description`, `importanceScore`, `sourceAnchors: SourceAnchor[]`, `status`, `confidence`) — depends on T002
- [X] T009 [P] [US1] Implement `ConceptEdge` in `src/types/domain/concept-edge.ts` (fields per data-model.md, including the `relationType` union with `"other"` plus optional `relationTypeNote`) — depends on T002
- [X] T010 [P] [US1] Implement `EvidenceEvent` in `src/types/domain/evidence-event.ts` (fields per data-model.md, closed `evidenceType` enum separating `exposure` from `retrieval`/`application`/`transfer`/etc.) — no dependency on T002
- [X] T011 [P] [US1] Implement `Assessment` in `src/types/domain/assessment.ts` (fields per data-model.md) — depends on T002
- [X] T012 [US1] Create barrel export `src/types/domain/index.ts` re-exporting all four schemas plus `SourceAnchor` — depends on T008, T009, T010, T011
- [X] T013 [US1] Run `npm run typecheck` and `node --test tests/unit/domain/concept.test.ts tests/unit/domain/concept-edge.test.ts tests/unit/domain/evidence-event.test.ts tests/unit/domain/assessment.test.ts` — expect PASS

**Checkpoint**: Schemas exist, typecheck cleanly, and each has a passing shape test. This is the MVP — every later roadmap phase can now be typed against something real.

---

## Phase 4: User Story 2 - A benchmark to detect regressions before any generation prompt exists (Priority: P1)

**Goal**: A hand-labeled benchmark corpus (30 concepts, 30 relationships, 20 Q&A pairs, 4 required edge cases) built from the real MIT OCW 6.006 material already saved at `benchmark/dsa-course/sources/`, plus a scoring test proving it's usable without modification.

**Independent Test**: `node --test tests/unit/domain/benchmark-corpus.test.ts` passes, confirming every corpus entry conforms to its schema and a trivial baseline extraction can be scored against it.

**Depends on**: Phase 3 (US1) — the corpus data is authored against the schema types, and the validation test imports them from `src/types/domain/`.

### Implementation for User Story 2

- [ ] T014 [P] [US2] Author `benchmark/dsa-course/artifacts.json`: 7 `SourceArtifact` entries (`id`, `title`, `artifactType`, `unit`, `date`), one per file in `benchmark/dsa-course/sources/` (5 `"lecture"` + 2 `"homework"`, per spec FR-008)
- [ ] T015 [US2] Author `benchmark/dsa-course/concepts.json`: at least 30 `CourseConcept` entries drawn from `benchmark/dsa-course/sources/lecture-02-data-structures.md`, `lecture-06-binary-trees-1.md`, `lecture-08-binary-heaps.md`, `lecture-09-breadth-first-search.md`, and `lecture-10-depth-first-search.md` (e.g. Sequence interface, Set interface, dynamic array, linked list, amortized analysis, binary tree, BST property, tree traversal order, subtree augmentation, max-heap property, complete binary tree, heap insert, heap delete-max, graph, directed/undirected edge, adjacency list, path, distance, level set, BFS, DFS, topological order, connected component — pick 30 real ones), each with a `sourceAnchors` entry pointing at its `artifacts.json` id and a locator/excerpt from the actual lecture text — depends on T014
- [ ] T016 [US2] Author `benchmark/dsa-course/edges.json`: at least 30 `ConceptEdge` entries relating concepts from T015 (e.g. `dynamic array` `part_of` `Sequence interface`; `FIFO/level-set ordering` `mechanism_for` `Breadth-First Search`; `Max-Heap Property` `mechanism_for` `heap delete-max`; `binary tree` `generalizes_to` `binary search tree`; `Full-DFS finishing order` `used_in` `topological sort`), **including at least one `relationType: "other"` entry with a `relationTypeNote`** for a relationship that doesn't cleanly fit the standard taxonomy (spec Edge Cases) — depends on T015
- [ ] T017 [US2] Author `benchmark/dsa-course/qa-pairs.json`: at least 20 `LabeledQAPair` entries drawn from `benchmark/dsa-course/sources/problem-set-3.md` and `problem-set-4.md` (e.g. Problem 3-1 Hash Practice → `retrieval`, Problem 4-2 Heap Practice → `retrieval`/`application`, Problem 4-3 Gardening Contest → `application`, Problem 3-4 Pushing Paper → `connection`, Problem 4-6 πz²a Optimization → `transfer`), tagged with `targetConceptIds`/`targetEdgeIds` from T015/T016, **with at least one entry marked `isAmbiguous: true`** — depends on T015, T016
- [ ] T018 [US2] Author `benchmark/dsa-course/edge-cases.json`: the 4 required edge-case entries from spec.md (a non-standard relation type, a multi-alias concept — e.g. "BFS" vs "breadth-first search" vs "graph traversal using queue", evidence attached to multiple concepts/edges at once, one deliberately ambiguous question), each referencing the actual entries from T015–T017 that satisfy it — depends on T015, T016, T017
- [ ] T019 [P] [US2] Write `tests/unit/domain/benchmark-corpus.test.ts`: assert `concepts.json` has ≥30 entries and every entry conforms to `CourseConcept`; assert `edges.json` has ≥30 entries, every entry conforms to `ConceptEdge`, and the `relationTypeNote` conditional rule holds; assert `qa-pairs.json` has ≥20 entries with at least one `isAmbiguous: true`; assert `edge-cases.json` contains all 4 required cases; assert every `sourceAnchors[].artifactId` resolves to a real `artifacts.json` entry (no dangling references); include one trivial baseline "extraction" function scored against `concepts.json` to prove the scoring mechanism works offline with no network/model calls (Constitution Principle IV) — depends on T012, T014–T018
- [ ] T020 [US2] Run `node --test tests/unit/domain/benchmark-corpus.test.ts` — expect PASS

**Checkpoint**: The benchmark corpus exists, is schema-valid, and is provably scoreable — Phase 2 (`course-graph-ingestion`) can build its extraction pipeline against it later without redoing this labeling work.

---

## Phase 5: User Story 3 - Evaluation rubrics defined before generation prompts exist (Priority: P2)

**Goal**: A written pass/fail rubric for each of the ten PRD §23.2 evaluation areas.

**Independent Test**: `grep -c '^## ' benchmark/dsa-course/rubrics/evaluation-rubrics.md` returns `10`, and each section states a concrete, checkable criterion (manually reviewed).

**Depends on**: Phase 1 (Setup) only — independent of US1 and US2, can be done in parallel with either.

### Implementation for User Story 3

- [ ] T021 [P] [US3] Write `benchmark/dsa-course/rubrics/evaluation-rubrics.md` with 10 `##` sections — concept extraction, concept deduplication, relation classification, homework/course-style extraction, question correctness, question ambiguity, source grounding, text grading, visual-structure extraction, misconception detection — each with at least one concrete pass/fail criterion phrased independently of any specific prompt or model (spec FR-012; e.g. for "source grounding": *"every generated concept's `sourceAnchors[].excerpt` must be a substring, or a close paraphrase confirmable by a human reviewer, of text actually present in the cited artifact — fail if the excerpt cannot be located in the source"*)
- [ ] T022 [US3] Run `grep -c '^## ' benchmark/dsa-course/rubrics/evaluation-rubrics.md` — expect output `10`

**Checkpoint**: All ten rubrics exist and are usable once each later phase's prompts are written.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation across all three stories together.

- [ ] T023 Run `npm run typecheck` across the whole repository — expect PASS with no regressions outside this feature
- [ ] T024 Walk through `specs/001-course-domain-schemas/quickstart.md` validation scenarios 1–5 end to end and confirm every expected outcome holds

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS User Story 1.
- **User Story 1 (Phase 3)**: Depends on Foundational. Does not depend on US2 or US3.
- **User Story 2 (Phase 4)**: Depends on User Story 1 (imports its schema types for the validation test) — this is the one cross-story dependency in this feature, called out explicitly since it breaks the usual "stories are independent" default.
- **User Story 3 (Phase 5)**: Depends only on Setup — independent of US1 and US2, can run in parallel with either.
- **Polish (Phase 6)**: Depends on US1, US2, and US3 all being complete.

### Within Each User Story

- US1: tests (T003–T006) written and failing before implementation (T008–T012); typecheck/test pass (T013) last.
- US2: corpus data (T014–T018) authored in the given order (each file's entries reference IDs from the previous); validation test (T019) written after the data exists (data-first here, since the test's job is to check real authored content, not drive its shape); T020 last.
- US3: rubric doc (T021) then completeness check (T022).

### Parallel Opportunities

- T003–T006 (all four shape tests) in parallel.
- T008, T009, T011 in parallel (T010 has no dependency on T002 either, so all four schema implementations can run in parallel once T002 is done).
- T014 and T021 can start in parallel with Phase 3 entirely, since US3 has no dependency on US1/US2 — but T015–T020 (the rest of US2) must wait for T012 (US1's barrel export) to exist.

---

## Parallel Example: User Story 1

```bash
# Launch all four shape tests together:
Task: "Write shape test in tests/unit/domain/concept.test.ts"
Task: "Write shape test in tests/unit/domain/concept-edge.test.ts"
Task: "Write shape test in tests/unit/domain/evidence-event.test.ts"
Task: "Write shape test in tests/unit/domain/assessment.test.ts"

# Then, once T002 (SourceAnchor) is done, launch all four schema implementations together:
Task: "Implement CourseConcept in src/types/domain/concept.ts"
Task: "Implement ConceptEdge in src/types/domain/concept-edge.ts"
Task: "Implement EvidenceEvent in src/types/domain/evidence-event.ts"
Task: "Implement Assessment in src/types/domain/assessment.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (T002 — blocks US1)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: `npm run typecheck` + the four shape tests pass independently of any corpus or rubric work
5. This alone unblocks Phase 1 of the roadmap (`account-course-artifact-foundation`) to start designing its Postgres schema against real types

### Incremental Delivery

1. Setup + Foundational → shared `SourceAnchor` ready
2. User Story 1 → schemas typecheck and pass shape tests (MVP)
3. User Story 2 → benchmark corpus authored and scoreable (needs US1's types)
4. User Story 3 → rubrics written (can be done any time after Setup, independent of US1/US2)
5. Polish → whole-repo typecheck + full quickstart walkthrough

### Solo Build Note

This is a solo project (no parallel team), per the confirmed MVP scope. The
`[P]` markers above still matter for *ordering discipline* even without
parallel staffing — they mark which tasks have no file/data dependency on
each other, so they can be done in any order without one blocking the
next, which keeps the incremental-commit cadence (per project convention)
clean: each `[P]` task or tight cluster is a natural commit boundary.

---

## Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps task to specific user story for traceability.
- Tests are included here because they're this feature's actual
  deliverable mechanism (spec SC-005), not optional TDD scaffolding.
- Commit after each task or tight logical cluster (e.g. all four T003–T006
  tests as one commit, all four T008–T011 schemas as another) — solo
  authorship, no AI co-author trailer, per project convention.
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that
  aren't called out explicitly (the one exception here — US2 on US1 — is
  documented above, not hidden).
