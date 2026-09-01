---

description: "Task list template for feature implementation"
---

# Tasks: Account, Course & Artifact Foundation

**Input**: Design documents from `/specs/002-account-course-artifact-foundation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/server-actions.md, quickstart.md

**Tests**: Included, but scoped to what's actually testable without live
Supabase/Trigger.dev credentials (spec Assumptions; research.md
"Verifying a feature that can't run end-to-end yet"). Only
`features/artifacts/status.ts`'s pure validation/transition logic gets
automated unit tests in this pass — the auth/course/upload server actions
and the Trigger.dev task itself are verified manually via
`quickstart.md` Group B once real credentials exist, not faked with mocks
(research.md explicitly rejects that).

**Organization**: Tasks are grouped by user story (spec.md priorities —
all three are P1, with a real dependency chain: an artifact needs a
course, a course needs an account).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Every task includes its exact file path

## Path Conventions

Single Next.js project (per plan.md's Project Structure):
`supabase/migrations/`, `trigger/`, `src/lib/supabase/`,
`src/features/{auth,courses,artifacts}/`, `src/app/`, `tests/unit/`.

---

## Phase 1: Setup

- [X] T001 Add `@supabase/supabase-js`, `@supabase/ssr`, and
  `@trigger.dev/sdk` to `package.json` dependencies (`npm install
  @supabase/supabase-js @supabase/ssr @trigger.dev/sdk`)
- [X] T002 [P] Extend the repo's existing (already-tracked)
  `.env.example` — not a new `.env.local.example` file, which the repo's
  `.gitignore` only exempts `.env.example` from, not other `.env*` names —
  documenting `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, and `TRIGGER_SECRET_KEY`, each with a
  comment pointing at where to find it once an account exists (no values)
  — per research.md's Environment variable contract decision
- [X] T003 [P] Create `supabase/migrations/`, `trigger/`,
  `src/lib/supabase/`, `src/features/auth/`, `src/features/courses/`,
  `src/features/artifacts/`, `src/app/sign-up/`, `src/app/sign-in/`,
  `src/app/courses/`, and `tests/unit/artifacts/` directories

**Checkpoint**: Dependencies declared, directories exist, no code yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The database schema and Supabase client setup every user
story in this feature depends on.

**⚠️ CRITICAL**: No user story task can begin until T004–T008 are
complete.

- [X] T004 Write `supabase/migrations/0001_courses_artifacts.sql`: the
  `courses`, `artifacts`, and `artifact_processing_runs` tables with
  `ENABLE ROW LEVEL SECURITY` and `owner_id = auth.uid()` policies on
  each, exactly per data-model.md's column/policy tables
- [X] T005 [P] Implement `src/lib/supabase/database.types.ts`: hand-written
  TypeScript row types (`Course`, `Artifact`, `ArtifactProcessingRun`)
  matching the migration's columns, until `supabase gen types` can run
  against a live project (research.md)
- [X] T006 [P] Implement `src/lib/supabase/client.ts`: browser Supabase
  client via `@supabase/ssr`'s `createBrowserClient`, reading
  `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [X] T007 [P] Implement `src/lib/supabase/server.ts`: server-side
  Supabase client via `@supabase/ssr`'s `createServerClient`, reading the
  session from Next.js cookies, for use in Server Components/Actions
- [X] T008 Implement `src/middleware.ts`: refreshes the Supabase session
  cookie on every request, per `@supabase/ssr`'s documented App Router
  pattern (required for server-side session reads in T007 to stay valid)
  — depends on T006, T007

**Checkpoint**: Schema and client plumbing ready; no user-story code can
run against a live project yet (no credentials), but everything from here
is structurally complete and typecheckable.

---

## Phase 3: User Story 1 - Create an account and sign in privately (Priority: P1)

**Goal**: A visitor can sign up, sign in, and sign out; every later story
in this feature depends on there being a signed-in account.

**Independent Test**: per spec.md — two accounts, each creates a course,
neither can see the other's (this specific check needs US2 to exist too,
so it's actually verified at the end of Phase 4, not this phase alone;
this phase's own narrower independent check is: sign up, sign out, sign
back in, land on the same account, not a fresh one).

### Implementation for User Story 1

- [X] T009 [US1] Implement `signUp`, `signIn`, `signOut` server actions in
  `src/features/auth/actions.ts` per contracts/server-actions.md — depends
  on T007
- [X] T010 [US1] Implement `src/app/sign-up/page.tsx`: email/password form
  calling `signUp`, redirecting to `/courses` on success, showing
  `{error}` inline on failure
- [X] T011 [US1] Implement `src/app/sign-in/page.tsx`: same pattern as
  T010, calling `signIn`
- [X] T012 [US1] Add a sign-out control (calls `signOut`) to
  `src/app/layout.tsx` or a shared header component, visible only when
  signed in

**Checkpoint**: Auth flow is code-complete and typechecks; live
verification (spec Acceptance Scenarios 1–2) waits for
`quickstart.md` Group B once credentials exist.

---

## Phase 4: User Story 2 - Create a course to organize uploaded material (Priority: P1)

**Goal**: A signed-in student can create a course and see it in their own
list.

**Independent Test**: per spec.md — create a course, see it appear in the
list; this phase's completion is also where spec Acceptance Scenario 3
(cross-account isolation) becomes checkable for the first time, since it
needs two accounts each with a course.

**Depends on**: Phase 3 (US1) — course creation requires a signed-in
account.

### Implementation for User Story 2

- [X] T013 [US2] Implement `createCourse`, `listCourses` server actions in
  `src/features/courses/actions.ts` per contracts/server-actions.md —
  depends on T007, T009
- [X] T014 [US2] Implement `src/app/courses/page.tsx`: lists the signed-in
  student's courses (via `listCourses`) and a create-course form (via
  `createCourse`)

**Checkpoint**: Course creation/listing is code-complete; live
verification (including cross-account isolation, spec SC-004) waits for
`quickstart.md` Group B2.

---

## Phase 5: User Story 3 - Upload course material and watch it move through durable processing states (Priority: P1) 🎯 MVP exit criterion

**Goal**: This is the feature's actual PRD Phase 1 exit criterion — a
student uploads a file and sees a durable, updating processing status.

**Independent Test**: upload a file, watch status reach a terminal state,
reload the page, confirm the same status is still shown (spec Acceptance
Scenarios 1–3).

**Depends on**: Phase 4 (US2) — an artifact must belong to an existing
course.

### Tests for User Story 3

> The only automated tests in this feature — pure logic, no live Supabase
> needed. Write first; confirm failing before implementation.

- [ ] T015 [P] [US3] Write `tests/unit/artifacts/status.test.ts`: valid
  transitions (`queued→processing`, `processing→ready`,
  `processing→failed`) are accepted; invalid transitions
  (`queued→ready` skipping a state, any transition *out of* `ready` or
  `failed`) are rejected; an unsupported `mimeType` or `sizeBytes` over
  the configured max is rejected by the upload-validation rule (spec
  FR-005, quickstart.md A2)
- [ ] T016 [US3] Run `node --test tests/unit/artifacts/status.test.ts` —
  expect FAIL (`Cannot find module '../../../src/features/artifacts/status.ts'`)

### Implementation for User Story 3

- [ ] T017 [US3] Implement `src/features/artifacts/status.ts`:
  `ArtifactStatus` type (`"queued" | "processing" | "ready" | "failed"`),
  `isValidStatusTransition(from, to): boolean`, and
  `validateUpload(mimeType, sizeBytes): { valid: true } | { valid: false; reason: string }`
  per data-model.md's state machine and validation rules — depends on T015
- [ ] T018 [US3] Run `node --test tests/unit/artifacts/status.test.ts` —
  expect PASS
- [ ] T019 [US3] Implement `uploadArtifact`, `listArtifacts` server
  actions in `src/features/artifacts/actions.ts` per
  contracts/server-actions.md, using `validateUpload` from T017 before
  any database write — depends on T007, T013, T017
- [ ] T020 [US3] Implement `trigger/ingest-artifact.ts`: the Trigger.dev
  task per contracts/server-actions.md's Trigger.dev task contract —
  idempotency guard (re-read current run status before proceeding),
  deterministic validation, terminal status write to both the run and
  parent artifact in one transaction — depends on T005
- [ ] T021 [US3] Implement `src/app/courses/[courseId]/page.tsx`:
  artifact list (via `listArtifacts`) with live status display (polling
  or Supabase Realtime subscription, satisfying FR-011's "no manual
  reload" requirement) and an upload form (direct-to-Storage upload per
  research.md, then calling `uploadArtifact`) — depends on T006, T019

**Checkpoint**: Upload + durable status is code-complete; live
verification (the feature's actual exit criterion, spec SC-002/SC-003)
waits for `quickstart.md` Group B3–B4 once credentials exist.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T022 Run `npm run typecheck` across the whole repository — expect
  PASS with no regressions outside this feature
- [ ] T023 Run `npm run test:unit` — expect PASS (Phase 0's 26 existing
  tests plus this feature's new `status.test.ts` tests)
- [ ] T024 Walk through `quickstart.md` Group A (A1–A3) end to end and
  confirm every expected outcome holds
- [ ] T025 Re-read `quickstart.md` Group B against the final file paths
  and confirm its instructions are accurate and ready for the product
  owner to run once Supabase/Trigger.dev credentials are provisioned —
  this task does not itself require live credentials, only confirms the
  handoff document is correct

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational only.
- **User Story 2 (Phase 4)**: Depends on User Story 1 — a course needs an
  owning account. This chain (unlike Phase 0's single cross-story
  dependency) runs through all three stories in this feature, called out
  explicitly rather than presented as independent.
- **User Story 3 (Phase 5)**: Depends on User Story 2 — an artifact needs
  an owning course.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Within Each User Story

- US1: no tests (server actions can't run without live credentials, per
  Tests note above) — implementation tasks T009–T012 in order (actions
  before pages, since pages call the actions).
- US2: same reasoning — T013 (actions) before T014 (page).
- US3: tests-first for the one genuinely unit-testable piece (T015–T018),
  then actions (T019), then the background task (T020), then the page
  that ties both together (T021).

### Parallel Opportunities

- T002 and T003 in parallel (Setup).
- T005, T006, T007 in parallel once T004 exists (Foundational) — T008
  needs T006 and T007 both done first.
- T015 has no code dependency and could be written in parallel with
  Foundational, though it can't be *run* meaningfully until T017 exists.

---

## Implementation Strategy

### MVP First (through User Story 3)

Because this feature's three stories form a real dependency chain (not
independent slices), there is no meaningful way to ship "just User Story
1" as a standalone MVP the way Phase 0's schemas were — an account with no
course and no upload doesn't satisfy the PRD's Phase 1 exit criterion.
The actual MVP is completing all of Phase 1 → 5 in order:

1. Setup + Foundational → schema and clients ready
2. User Story 1 → accounts work
3. User Story 2 → courses work
4. User Story 3 → upload + durable status work — **this is the PRD Phase
   1 exit criterion**, satisfied only once all three stories are done
5. Polish → confirm nothing regressed, confirm the Group B handoff doc is
   accurate

### Solo Build Note

Same as Phase 0: `[P]` markers mark ordering-independence for a solo
build's own sequencing discipline, not parallel staffing. Commit after
each task or tight cluster (e.g. T009–T012 as one commit, T017–T018 as
another), solo-authored, no AI co-author trailer, per project convention.

---

## Notes

- Tests are included only where they can actually run without live
  external credentials — see the Tests note at the top. This is a
  deliberate, documented scope choice (research.md), not an omission.
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that
  aren't called out explicitly (this feature's chain — US2 on US1, US3 on
  US2 — is documented above, not hidden).
