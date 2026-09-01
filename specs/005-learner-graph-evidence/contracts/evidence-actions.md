# Server Action Contracts

All server actions (`src/features/learner-graph-evidence/actions.ts`),
same pattern as every other feature in this project — no background job
(research.md "No background job needed").

## `commitEvidence(input: CommitEvidenceInput): Promise<{ error: string | null }>`

```ts
type CommitEvidenceInput = {
  courseId: string;
  conceptIds: string[];
  edgeIds: string[];
  evidenceType: EvidenceType;
  correctness: boolean | null;
  graderConfidence: number;
  assistanceLevel: number;
  difficulty: number;
  transferDistance: number;
  studentConfidence?: number;
  sourceArtifactId?: string;
  assessmentAttemptId?: string;
  conversationTurnId?: string;
};
```

- **Consumes**: everything `EvidenceEvent` needs except `id`, `userId`
  (from the authenticated session, never a parameter — same reasoning as
  every other action's `owner_id`/`reporter_id` handling in this
  project), and `createdAt` (server-assigned).
- **Rejects** (FR-007) when any `conceptIds`/`edgeIds` entry doesn't
  resolve to a real row in this course, or when neither array is
  non-empty (mirrors `isEvidenceEvent`'s existing rule) — with a specific
  error, not a silently-accepted no-op event.
- **Produces**: one `evidence_events` insert, always first; then, for
  every concept/edge id targeted, re-reads that (student, target)'s full
  evidence history and upserts `learner_concept_state`/`learner_edge_state`
  via `computeLearnerState` (Constitution Principle II — both steps
  happen or neither does).

## `getConceptState(courseId: string, conceptId: string): Promise<LearnerConceptState>`

- **Produces**: the calling student's own current state (RLS-scoped, no
  `userId` parameter accepted — same isolation pattern as every existing
  read action in this project). Returns the FR-010 baseline when no
  evidence exists yet, from the same `computeLearnerState` codepath
  (data-model.md) rather than a separately-coded default.

```ts
type LearnerConceptState = {
  masteryState: MasteryState;
  score: number;
  hasUnresolvedMisconception: boolean;
  contributingFactors: ContributingFactor[];
  lastEvidenceAt: string | null;   // null only at the FR-010 baseline
};
```

## `getEdgeState(courseId: string, edgeId: string): Promise<LearnerEdgeState>`

Same shape as `getConceptState`, for one relationship.

## `getCourseGraphForLearner(courseId: string): Promise<CourseGraph>`

- **Consumes**: the course to render for the calling student.
- **Produces**: `course-graph-ingestion`'s existing `getCourseGraph(courseId)`
  (unchanged), passed through `applyLearnerState` with every concept/edge
  the student has state for (research.md "Overlaying real state onto
  course-graph-ingestion's baseline, without touching it"). Replaces the
  call `src/app/courses/[courseId]/atlas/page.tsx` currently makes to
  `course-graph-ingestion`'s `getCourseGraph` directly — wiring that page
  to this function instead is this feature's responsibility, the same
  way `course-graph-ingestion` wired that same page away from the static
  fixture in its own US3.
