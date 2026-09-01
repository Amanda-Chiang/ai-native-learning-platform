# Server Action Contracts

This feature's only external interface is a set of Next.js Server
Actions (called directly from Server/Client Components — there is no
public HTTP API surface, so no OpenAPI-style spec applies). Each entry is
the contract `tasks.md`'s implementation tasks are written against.

## `signUp(email: string, password: string): Promise<{ error: string | null }>`

- **Consumes**: raw email/password from the sign-up form.
- **Produces**: creates a Supabase Auth user; on success, the session
  cookie is set and the caller can navigate to `/courses`. On failure
  (e.g. email already registered), returns `{ error: <message> }` and
  creates nothing.

## `signIn(email: string, password: string): Promise<{ error: string | null }>`

- **Consumes**: raw email/password from the sign-in form.
- **Produces**: sets the session cookie on success; `{ error: <message> }`
  on invalid credentials, with no information leaked about whether the
  email exists (generic "invalid credentials" message either way).

## `signOut(): Promise<void>`

- Clears the session cookie.

## `createCourse(name: string): Promise<{ course: { id: string; name: string } } | { error: string }>`

- **Consumes**: a course name from the authenticated student.
- **Produces**: inserts a `courses` row with `owner_id` set to the current
  session's user via RLS (`auth.uid()` is implicit, never passed by the
  client). Returns the created course or an error (e.g. empty name).

## `listCourses(): Promise<Array<{ id: string; name: string; createdAt: string }>>`

- **Produces**: every course owned by the current session's user, via the
  RLS-scoped client — no explicit `owner_id` filter needed or accepted as
  a parameter (accepting one from the client would be a way to
  accidentally bypass the isolation guarantee; RLS is the only filter).

## `uploadArtifact(courseId: string, file: { storagePath: string; originalFilename: string; mimeType: string; sizeBytes: number }): Promise<{ artifact: { id: string; status: "queued" } } | { error: string }>`

- **Consumes**: the `courseId` the file belongs to, and the file's
  already-uploaded Storage path (the file bytes themselves go straight
  from the browser to Supabase Storage per research.md — this action
  never receives raw file bytes).
- **Produces**: validates `mimeType`/`sizeBytes` against
  `features/artifacts/status.ts`'s rules (spec FR-005); if invalid,
  returns `{ error: <reason> }` and creates no rows. If valid: inserts an
  `artifacts` row (`status: "queued"`) and a matching first
  `artifact_processing_runs` row, triggers the `ingest-artifact`
  Trigger.dev task, and returns the created artifact.

## `listArtifacts(courseId: string): Promise<Array<{ id: string; originalFilename: string; status: "queued" | "processing" | "ready" | "failed"; failureReason: string | null }>>`

- **Produces**: every artifact in the given course owned by the current
  session's user (RLS-scoped, same isolation guarantee as `listCourses`).
  This is what the ingestion status UI polls/subscribes to for FR-011's
  "updates without manual reload" requirement.

## Trigger.dev task: `ingest-artifact`

Not a server action (it's a background task triggered by
`uploadArtifact`, not called directly by UI code), but still a contract
`tasks.md` implements against:

- **Input**: `{ artifactId: string, processingRunId: string }`.
- **Behavior**: re-reads the current run's status (idempotency guard per
  research.md); if already terminal, exits without re-processing. Updates
  the run to `processing`, performs deterministic validation (file exists
  in Storage and is readable, matches its declared `mimeType`/`sizeBytes`
  within tolerance), and writes a terminal status (`ready` or `failed`,
  with `failureReason` set on failure) to both the run and the parent
  `artifacts` row in one transaction.
- **Runs as**: a Supabase service-role client (bypasses RLS by design —
  this task acts on behalf of the system, not as any particular student's
  session).
