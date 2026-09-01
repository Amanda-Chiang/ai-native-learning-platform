# Implementation Plan: Account, Course & Artifact Foundation

**Branch**: `002-account-course-artifact-foundation` | **Date**: 2026-09-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-account-course-artifact-foundation/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Give the app real accounts, courses, and file uploads: Supabase Auth for
sign-up/sign-in, a Postgres schema (`courses`, `artifacts`,
`artifact_processing_runs`) locked down with row-level security so a
student only ever sees their own data, Supabase Storage for the uploaded
files themselves, and a Trigger.dev background task that moves an
artifact from `queued` → `processing` → a terminal status without the
student's browser holding that state. No AI/content interpretation
happens in this feature — the background task validates and durably
records the upload only (spec FR-010); concept extraction is Phase 2.

## Technical Context

**Language/Version**: TypeScript 5, Next.js 16 (App Router) — both
already present in this repo.

**Primary Dependencies**: `@supabase/supabase-js` + `@supabase/ssr` (
Supabase's official Next.js App Router integration, handling
cookie-based server-side auth) and `@trigger.dev/sdk` — both net-new to
`package.json`, but not net-new *decisions*: `.specify/memory/constitution.md`'s
Technology & Architecture Constraints section already names Supabase and
Trigger.dev as the ratified stack, so this is implementing an existing
decision, not introducing one. No existing project dependency covers
either need.

**Storage**: PostgreSQL via Supabase (three new tables: `courses`,
`artifacts`, `artifact_processing_runs`) for all structured data;
Supabase Storage (one private bucket) for the uploaded files themselves.
Per Constitution Technology & Architecture Constraints, no graph database
or other new persistence layer is introduced.

**Testing**: Node's built-in test runner (`node --test`), continuing the
Phase 0 precedent, for the parts of this feature that are pure logic and
don't require a live Supabase project (status-transition rules, upload
validation rules). Playwright (already in this repo, `tests/e2e/`) for
the UI flow once real credentials exist. Per the confirmed scope
decision, RLS-policy and Trigger.dev-job behavior cannot be verified live
in this pass — `quickstart.md` separates "verifiable now" from "verifiable
once credentials are provisioned."

**Target Platform**: Next.js server (API routes / server actions) plus
browser client — one deployable app, not a separate backend service.

**Project Type**: Web application, single Next.js project (extends the
Option 1 "single project" structure from Phase 0 — this is one app, not a
separate frontend/backend split).

**Performance Goals**: PRD §6.2's SLO candidates (artifact ingestion 95%
complete within 5 minutes) are the aspirational target but not a hard
gate for this feature — no load-testing infrastructure exists yet to
verify them, and verifying them requires the live services this feature
can't yet reach.

**Constraints**: Per-user data isolation (spec FR-002) MUST be enforced
by Postgres row-level security policies, not only by application-layer
`WHERE` clauses — RLS is the deterministic boundary that holds even if an
application code path forgets a filter. No secret/key may be hardcoded;
every credential is read from environment variables, with
`.env.local.example` documenting every required variable without values.

**Scale/Scope**: Single-developer dogfooding scale for this phase (PRD
§6.1's "10 minutes to first usable course graph" scenario) — not a
concurrent-user load target.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies how | Status |
|---|---|---|
| I. Renderer-Neutral Learner Graph | Not applicable — this feature has no graph/concept data. | N/A |
| II. Evidence-Backed Learner State (NON-NEGOTIABLE) | Not applicable — no learner-state or evidence data is created here (spec FR-010 explicitly excludes it). | N/A |
| III. Exposure Is Not Mastery | Not applicable, same reason as II. | N/A |
| IV. Deterministic Verification First | The background processing task performs deterministic validation only (file readability, type/size checks) — no LLM judgment calls exist in this feature to require a rubric. | PASS |
| V. Course-Grounded, Provenance-Preserving Claims | Not applicable — no course-specific claims (questions, concepts) are generated in this feature. | N/A |

| Technology Constraint | Applies how | Status |
|---|---|---|
| Stack (Supabase, Trigger.dev, modular monolith) | Implements exactly the ratified stack; Trigger.dev task lives in this same repo/deployment, not a separate service. | PASS |
| No new persistence layer without an ADR | Postgres via Supabase is the already-approved store; no graph DB or other new store is introduced. | PASS |
| No new dependency duplicating an existing one | `@supabase/supabase-js`/`@supabase/ssr`/`@trigger.dev/sdk` are net-new, but nothing in the current dependency tree provides auth, Postgres access, file storage, or durable background jobs — no duplication. | PASS |
| Client architecture (canonical state server-side) | All course/artifact/status state lives in Postgres; the Next.js app is a view over it via server actions/API routes, not a client holding its own copy of truth. | PASS |

No violations. Complexity Tracking table below is left empty.

**Post-Phase-1 re-check**: `data-model.md`'s RLS policies enforce FR-002
at the database layer (Constraint above); `artifact_processing_runs` is
append-only per attempt (mirroring the `EvidenceEvent` immutable-record
pattern from Phase 0, though this is not itself an `EvidenceEvent` — no
Constitution principle requires that pattern here, it's just good
precedent to reuse). No LLM calls anywhere in this feature's design. Gate
still PASSES after design.

## Project Structure

### Documentation (this feature)

```text
specs/002-account-course-artifact-foundation/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output — server actions + one API route contract
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
supabase/
└── migrations/
    └── 0001_courses_artifacts.sql   # schema + RLS policies for courses, artifacts, artifact_processing_runs

src/
├── lib/
│   └── supabase/
│       ├── client.ts       # browser Supabase client (anon key, RLS-scoped)
│       ├── server.ts       # server-side client for Server Components/Actions (cookie-based session)
│       └── database.types.ts  # generated Postgres row types (hand-maintained until `supabase gen types` can run against a live project)
├── features/
│   ├── auth/
│   │   └── actions.ts      # signUp, signIn, signOut server actions
│   ├── courses/
│   │   └── actions.ts      # createCourse, listCourses server actions
│   └── artifacts/
│       ├── actions.ts      # uploadArtifact, listArtifacts server actions
│       └── status.ts       # ArtifactStatus type + pure transition-validation helpers (unit-testable without a live DB)
├── app/
│   ├── sign-up/page.tsx
│   ├── sign-in/page.tsx
│   └── courses/
│       ├── page.tsx                 # course list + create form
│       └── [courseId]/page.tsx      # artifact list + upload form + live status

trigger/
└── ingest-artifact.ts      # Trigger.dev task: queued -> processing -> ready|failed

tests/
└── unit/
    └── artifacts/
        └── status.test.ts   # pure status-transition rule tests (no live Supabase needed)

.env.local.example           # documents every required env var, no values
```

**Structure Decision**: Single Next.js project (Option 1, extended from
Phase 0). `supabase/migrations/` and `trigger/` are new top-level
directories for their respective tools' conventional locations — both
tools expect files there, not nested under `src/`. Everything else stays
under the existing `src/` tree, split by feature (`features/auth`,
`features/courses`, `features/artifacts`) rather than by technical layer,
matching this repo's existing empty `src/features/` scaffold.

## Complexity Tracking

*No Constitution Check violations — this table is intentionally empty.*
