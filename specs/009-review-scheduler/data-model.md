# Data Model: Review Scheduler

No new database table (research.md "No new persistence layer"). Every
type below is a plain TypeScript type computed on read; nothing here is
a `Row` type or a migration.

## Inputs this feature reads, unchanged

- `learner-graph-evidence`'s `getConceptState(courseId, conceptId)` →
  `LearnerConceptState` (`masteryState`, `score`, `lastEvidenceAt`,
  `hasUnresolvedMisconception`) and `getEdgeState(courseId, edgeId)` →
  `LearnerEdgeState` — called once per concept/edge in the course, not
  reimplemented.
- `course_concepts` (`id`, `importance_score`, `created_at`) and
  `concept_edges` (`id`, `source_concept_id`, `target_concept_id`,
  `relation_type`) — read directly via Supabase, `status = 'confirmed'`
  only, same filter every prior feature uses for canonical content.
- `question_bank` (`assessment-generation-pipeline`) — read-only,
  filtered to entries whose `source_anchors` resolve into this course's
  confirmed concepts (already guaranteed by that feature's own
  validation, not re-checked here).

## `ReviewPriorityWeights`: tunable, not calibrated

```ts
export type ReviewPriorityWeights = {
  forgettingRiskWeight: number;
  courseImportanceWeight: number;
  evidenceGapWeight: number;
  prerequisiteCentralityWeight: number;
  unresolvedConfusionWeight: number;
  /** Neutral until exam-planner exists (spec.md FR-012) -- multiplies
   * the combined score by exactly 1, never fabricating exam relevance. */
  neutralExamWeight: number;
};

export const DEFAULT_REVIEW_PRIORITY_WEIGHTS: ReviewPriorityWeights = {
  forgettingRiskWeight: 1,
  courseImportanceWeight: 1,
  evidenceGapWeight: 1,
  prerequisiteCentralityWeight: 0.5,
  unresolvedConfusionWeight: 2,
  neutralExamWeight: 1,
};
```

## `review-priority.ts`

```ts
export type ConceptPriorityInput = {
  conceptId: string;
  importanceScore: number; // course_concepts.importance_score, 0-1
  prerequisiteOutDegree: number; // # of prerequisite_for edges FROM this concept
  learnerState: LearnerConceptState; // from getConceptState, unchanged
};

export type ConceptPriority = {
  conceptId: string;
  priorityScore: number;
  /** Real, specific reasons (FR-007) -- e.g. "It's been 12 days since
   * you last practiced this", "You have an unresolved mix-up flagged
   * here" -- never a generic "this is due" placeholder. */
  reasons: string[];
};

export function computeConceptPriority(
  input: ConceptPriorityInput,
  now: Date,
  weights: ReviewPriorityWeights,
): ConceptPriority;

export function rankConceptsByPriority(
  inputs: ConceptPriorityInput[],
  now: Date,
  weights: ReviewPriorityWeights,
): ConceptPriority[]; // descending priorityScore
```

`forgetting_risk`/`evidence_gap` are both read off `learnerState.score`/
`learnerState.lastEvidenceAt` (already recency-decayed by
`computeLearnerState`) — this function does not re-derive recency decay
itself, it composes the existing per-concept signal with course/graph
signals `computeLearnerState` doesn't know about (importance,
prerequisite centrality).

## `next-review-date.ts`

```ts
export function computeNextReviewDate(
  learnerState: LearnerConceptState,
  now: Date,
  weights: ReviewPriorityWeights,
): Date; // a past-or-present Date means "due now"

export function isDue(
  learnerState: LearnerConceptState,
  now: Date,
  weights: ReviewPriorityWeights,
): boolean;
```

`computeNextReviewDate` never inspects individual `evidence_events` —
it derives purely from `learnerState.score` (higher score → longer
interval from `lastEvidenceAt`) and `learnerState.hasUnresolvedMisconception`
(forces a short interval regardless of score). This is what makes
spec.md US2/SC-005 hold structurally: a correct, independent answer
raises `computeLearnerState`'s score on the next read, which this
function turns into a longer interval, with no need to separately
track "was the last answer right" -- that's already what produced the
new score. `learnerState.lastEvidenceAt === null` always returns a
past `Date` (immediately due, FR-004).

## `daily-session.ts`

```ts
export type QuestionBankEntrySummary = {
  id: string;
  conceptId: string; // resolved from question_bank.source_anchors
  questionText: string;
  responseModality: QuestionResponseModality;
};

export type SessionItem = {
  conceptId: string;
  questionBankEntryId: string;
  questionText: string;
  responseModality: QuestionResponseModality;
  reasons: string[]; // ConceptPriority.reasons, carried through (FR-007)
};

export type DailySessionResult =
  | { status: "ok"; items: SessionItem[]; moreAvailable: boolean }
  | { status: "no_content"; message: string } // FR-008
  | { status: "budget_too_small"; items: SessionItem[]; message: string }; // Edge Cases

export const DEFAULT_MINUTES_PER_QUESTION = 2; // tunable (research.md pattern) -- question_bank doesn't record a per-question time estimate, so every item is treated as this fixed cost until a real signal exists

export function composeDailySession(
  rankedDueConcepts: ConceptPriority[], // already filtered to isDue(...) === true, already ranked
  questionsByConcept: Map<string, QuestionBankEntrySummary[]>,
  timeBudgetMinutes: number,
  excludeConceptIds: string[], // FR-013 "request more" -- already-shown ids
): DailySessionResult;
```

A due concept with no entry in `questionsByConcept` is skipped (FR-009)
-- `composeDailySession` never fabricates a placeholder item and never
counts a skipped concept as reviewed.

## `connect-session.ts`

```ts
export type NewConceptItem = { conceptId: string; introducedAt: string };
export type WeakConnectionItem = { edgeId: string; sourceConceptId: string; targetConceptId: string };
export type LowConnectivityItem = { conceptId: string; edgeCount: number; courseAverageEdgeCount: number };
export type ConfusedPairItem = { edgeId: string; conceptAId: string; conceptBId: string };

export type ConnectSessionResult = {
  newConcepts: NewConceptItem[];
  weakConnections: WeakConnectionItem[];
  lowConnectivityConcepts: LowConnectivityItem[];
  confusedPairs: ConfusedPairItem[];
};

export type ConnectSessionConceptInput = { conceptId: string; createdAt: string; edgeCount: number };
export type ConnectSessionEdgeInput = {
  edgeId: string;
  sourceConceptId: string;
  targetConceptId: string;
  relationType: RelationType; // course-graph-ingestion's existing type
  learnerState: LearnerEdgeState; // from getEdgeState, unchanged
};

export function composeConnectSession(
  concepts: ConnectSessionConceptInput[],
  edges: ConnectSessionEdgeInput[],
  now: Date,
): ConnectSessionResult;
```

- **New concepts**: `createdAt` within a rolling 7-day window ending at
  `now` (spec.md Assumptions).
- **Weak connections**: an edge where one endpoint is a "new concept"
  (above) and the other isn't, and `learnerState.learnerState ===
  "weak"` (or no evidence yet) -- reuses `LearnerRelationshipState`
  unchanged, no new "weak" definition invented.
- **Low-connectivity concepts**: `edgeCount` well below the course's
  average `edgeCount` across all its concepts -- a relative, per-course
  threshold, not a fixed absolute number (a 10-concept course and a
  200-concept course have different normal connectivity).
- **Confused pairs**: edges where `relationType === "contrasts_with"`
  -- this reuses the ontology's existing relation type
  (`course-graph-ingestion`'s `STANDARD_RELATION_TYPES`) as the
  "commonly confused" signal (research.md), not a new confusion-detection
  mechanism.
