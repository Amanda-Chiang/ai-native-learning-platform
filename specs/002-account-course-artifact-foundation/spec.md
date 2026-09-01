# Feature Specification: Account, Course & Artifact Foundation

**Feature Branch**: `002-account-course-artifact-foundation`

**Created**: 2026-09-01

**Status**: Draft

**Input**: User description: "account-course-artifact-foundation: Phase 1 of docs/implementation-roadmap.md — Next.js app (already scaffolded) + Supabase Auth + Postgres schema/RLS for courses and artifacts + Supabase Storage upload + Trigger.dev background job for artifact ingestion + an ingestion status UI. Exit criterion (PRD): a user uploads course files and sees durable processing states. No live Supabase/Trigger.dev accounts exist yet (confirmed with product owner 2026-09-01) — build all schema/RLS/client code and the .env.local template against those services' documented interfaces, but nothing will run end-to-end until the accounts are provisioned and real keys are supplied."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create an account and sign in privately (Priority: P1)

A student creates an account for the platform and can sign back in on a
later visit. Everything they create afterward (courses, uploaded files)
belongs only to them — no other student can see it, and they can't see
anyone else's.

**Why this priority**: nothing else in this feature (or any later phase)
is meaningful without an identity to attach data to. This is the one
dependency every other story in this feature has.

**Independent Test**: can be fully tested by creating two separate
accounts, having each create a course, and confirming neither account can
see the other's course when signed in.

**Acceptance Scenarios**:

1. **Given** no existing account, **When** a visitor signs up with an
   email and password, **Then** an account is created and they are signed
   in.
2. **Given** an existing account, **When** the owner signs in again on a
   new browser session, **Then** they reach their own courses and
   artifacts, not a blank slate or someone else's.
3. **Given** two different accounts each with their own course, **When**
   one account's owner is signed in, **Then** only their own course is
   visible — the other account's course does not appear in any list, page,
   or direct link.

---

### User Story 2 - Create a course to organize uploaded material (Priority: P1)

A signed-in student creates a course (e.g. "Data Structures & Algorithms")
as a container they'll upload lecture notes, homework, and other material
into.

**Why this priority**: a course is the organizing unit every uploaded
artifact belongs to — User Story 3 (upload) has nothing to attach a file
to without this existing first.

**Independent Test**: can be fully tested by a signed-in student creating
a course and seeing it appear in their course list immediately afterward,
with no upload involved yet.

**Acceptance Scenarios**:

1. **Given** a signed-in student with no courses yet, **When** they create
   a course with a name, **Then** the course appears in their course list.
2. **Given** a signed-in student with an existing course, **When** they
   view their course list, **Then** they see the course's name and can
   navigate into it.

---

### User Story 3 - Upload course material and watch it move through durable processing states (Priority: P1) 🎯 MVP

A signed-in student, inside one of their courses, uploads a file (a
lecture PDF, homework, or similar). They see the file listed immediately
with a status that starts as queued, updates to processing, and settles
into either "ready" or "failed" — and that status is still accurate if
they close the browser and come back later, or if the server restarts
mid-processing.

**Why this priority**: this is the feature's actual exit criterion (PRD
Phase 1 goal): "a user uploads files and sees durable processing states."
Everything else in this feature exists to make this scenario possible.

**Independent Test**: can be fully tested by uploading one file, watching
its status change from queued to a terminal state without refreshing, then
reloading the page (or signing out and back in) and confirming the same
final status is still shown — proving the status is durably stored, not
held only in the browser's memory.

**Acceptance Scenarios**:

1. **Given** a signed-in student inside one of their courses, **When**
   they upload a supported file, **Then** it immediately appears in that
   course's artifact list with a "queued" status.
2. **Given** a newly-uploaded artifact in "queued" status, **When**
   background processing picks it up, **Then** its status updates to
   "processing" and then to a terminal state ("ready" or "failed") without
   requiring the student to manually refresh.
3. **Given** an artifact that has reached a terminal status, **When** the
   student reloads the page, signs out and back in, or returns the next
   day, **Then** the same status is shown — it was never only held in
   memory.
4. **Given** an uploaded file that fails processing (e.g. corrupted or
   empty), **When** processing completes, **Then** the artifact shows a
   "failed" status with a reason a student can understand, rather than
   silently disappearing or being stuck at "processing" forever.
5. **Given** two students each with their own course, **When** either
   uploads an artifact, **Then** it is only ever visible in that student's
   own course — never in the other student's course list, even if they
   guess a direct link.

---

### Edge Cases

- What happens if the background job that processes an artifact crashes or
  the server restarts mid-job? The artifact's status must not silently get
  stuck at "processing" forever — it must either resume, retry, or move to
  "failed" within a bounded time, since PRD §6.2 requires "no silent
  learner-state mutation after failed grading/generation jobs" and the
  same durability expectation applies here to ingestion status.
- What happens if a student uploads a file type or size this feature
  doesn't support yet? The upload must be rejected with a clear reason at
  upload time, not accepted and left to fail invisibly during processing.
- What happens if a student tries to access another student's course or
  artifact by guessing or reusing a URL? Access must be denied the same
  way as if it didn't exist — no distinguishing "exists but not yours"
  from "doesn't exist," to avoid leaking which courses/artifacts exist.
- What happens if the same student uploads the same file twice? Both
  uploads are accepted as separate artifacts in this phase — de-duplication
  is a later optimization (PRD §26 lists file-hash dedupe as a cost
  mitigation, not a Phase 1 requirement).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let a visitor create an account and
  subsequently sign in and out of that same account.
- **FR-002**: The system MUST ensure a signed-in student can only see and
  act on courses and artifacts they created — never another student's,
  under any access path (list view, direct link, or otherwise).
- **FR-003**: The system MUST let a signed-in student create a course with
  at least a name, and see all their own courses in a list.
- **FR-004**: The system MUST let a signed-in student upload a file into
  one of their own courses.
- **FR-005**: The system MUST reject an upload immediately (at upload
  time, not later) if the file type or size is unsupported, with a
  reason the student can understand.
- **FR-006**: Every accepted upload MUST immediately appear in its
  course's artifact list with a "queued" status.
- **FR-007**: The system MUST process each queued artifact via a
  background job (not inline in the request that accepted the upload),
  updating its status through "processing" to a terminal state ("ready"
  or "failed").
- **FR-008**: Every artifact's status MUST be durably stored such that it
  survives a page reload, a new sign-in session, and a server restart —
  never held only in server or browser memory.
- **FR-009**: If background processing fails, the artifact MUST show a
  "failed" status with a human-readable reason, never left indefinitely
  at "queued" or "processing" with no explanation.
- **FR-010**: The system MUST NOT perform concept extraction, AI
  interpretation, or any course-graph mutation on uploaded artifacts in
  this feature — "processing" here validates and durably records the
  upload only. Extracting concepts from artifact content is Phase 2
  (`course-graph-ingestion`) per `docs/implementation-roadmap.md`, out of
  scope here.
- **FR-011**: The ingestion status view MUST update to reflect a status
  change (queued → processing → terminal) without requiring the student
  to manually reload the page.

### Key Entities

- **Account**: a student's identity. Owns zero or more Courses. Used to
  scope every other entity in this feature to "only visible to its
  owner."
- **Course**: a named container a student creates to organize uploaded
  material, e.g. "Data Structures & Algorithms." Owned by exactly one
  Account.
- **Artifact**: one uploaded file belonging to exactly one Course —
  represents the original file plus its current processing status.
- **Processing run**: one attempt at processing a given Artifact, with its
  own status and, on failure, a reason — kept as its own record (not
  overwritten) so a retried artifact's processing history isn't lost,
  matching the evidence-style "immutable record, not overwritten state"
  pattern already established for `EvidenceEvent` in
  `specs/001-course-domain-schemas/`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new visitor can go from "no account" to "signed in with
  at least one course created" in under 2 minutes.
- **SC-002**: 100% of uploaded artifacts reach a terminal status
  ("ready" or "failed") without the student needing to manually refresh,
  reload, or take any action beyond the initial upload.
- **SC-003**: A student who reloads the page, signs out and back in, or
  returns after their server restarts always sees the same artifact
  status as before — 0% of statuses are lost or reset by any of those
  events.
- **SC-004**: 0% of a student's courses or artifacts are ever visible to
  a different student, verified by attempting cross-account access via
  direct link as well as normal navigation.
- **SC-005**: A student who uploads an unsupported file type or an
  oversized file is told why within the same interaction, not left
  waiting for a background job to fail silently.

## Assumptions

- Authentication uses email + password as the sign-up/sign-in method for
  this phase; OAuth/SSO providers are a later enhancement, not required
  here — no course-specific access-control complexity is introduced
  beyond "a course belongs to exactly one account."
- Supported upload types for this phase match PRD §11.1's MVP list: PDF
  lecture slides/notes, syllabus, homework PDFs, practice exams, and
  images/screenshots of handwritten notes. Pasted text/code (also listed
  in §11.1) is a text-entry flow, not a file upload, and is out of scope
  for this feature's upload mechanism specifically.
- "Durable" processing status means stored in the system's persistent
  database, per PRD §6.2 ("no silent learner-state mutation after failed
  grading/generation jobs" and durable background-job expectations) — not
  necessarily surviving a full infrastructure outage, which is out of
  scope for this phase.
- A course, once created, is not deletable or renameable in this phase —
  only creation and listing are required by the PRD Phase 1 exit
  criterion; edit/delete are reasonable near-term follow-ups, not blockers
  to this feature's own completion.
- This feature covers one account tier only (a regular student account) —
  no admin/reviewer role is introduced here, consistent with PRD's
  Phase 1 scope (the "internal review queue" for low-confidence
  concept/edge merges belongs to Phase 2, `course-graph-ingestion`).
- No live Supabase or Trigger.dev account exists yet (confirmed with the
  product owner 2026-09-01). This feature's code is written completely
  and correctly against those services' documented interfaces, with an
  `.env.example`-style template listing every required variable,
  but end-to-end verification (actually creating an account, uploading a
  real file, watching a real background job run) is blocked until real
  credentials are provisioned — this is a deployment/verification gap,
  not a scope reduction of what gets built.
