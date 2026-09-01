# Data Model: Deterministic Grading

## `assessment_attempts`

New table, migration `0006_deterministic_grading.sql`. RLS keyed on
`user_id = auth.uid()` (matching `learner-graph-evidence`/`tutor-agent`'s
precedent — this is student-owned data).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK → `auth.users.id`, cascade delete |
| `course_id` | `uuid` | FK → `courses.id`, cascade delete |
| `response_modality` | `text` | not null, `check (in ('structured', 'code', 'text'))` — which grading path produced this attempt |
| `question_snapshot` | `jsonb` | not null — the checker/rubric config and question text as submitted to this feature (research.md "a lightweight snapshot, not a question-bank FK") |
| `response` | `jsonb` | not null — the student's actual submitted response, verbatim |
| `grading_result` | `jsonb` | not null — the real `CheckerResult`/`CodeGradingResult`/`RubricGradingResult`, never a placeholder |
| `created_at` | `timestamptz` | default `now()` |

`unique` constraint: none — a student may attempt the same question
snapshot more than once, each a distinct row.

RLS: `select`/`insert` where `user_id = auth.uid()`. No update/delete —
an attempt is a historical record of what happened, append-only, same
convention as `evidence_events`.

**Divergence this migration makes to an existing table**:
`evidence_events.assessment_attempt_id` (added in
`0004_learner_evidence.sql` as a bare `uuid`, deliberately unconstrained)
gets a real foreign key:

```sql
alter table public.evidence_events
  add constraint evidence_events_assessment_attempt_id_fkey
  foreign key (assessment_attempt_id) references public.assessment_attempts (id);
```

## Checker/grading result shapes

Every checker validates a **property** the claimed answer must satisfy,
not a single canonical answer — most of these domains have more than
one correct answer (multiple valid BFS/DFS orders under different
neighbor tie-breaking, multiple equally-short paths), and checking
membership/validity is the mathematically correct notion of "correct"
here, not exact-match against one arbitrarily-chosen reference answer.

### BFS/DFS traversal (`checkers/bfs-dfs-checker.ts`)

```ts
type GraphInput = { nodeIds: string[]; edges: [string, string][]; directed: boolean };
type TraversalCheckInput = {
  graph: GraphInput;
  algorithm: "bfs" | "dfs";
  startNodeId: string;
  claimedOrder: string[];
};
type TraversalCheckResult =
  | { outcome: "correct" }
  | { outcome: "incorrect"; firstDivergenceIndex: number; expectedAtThatIndex: string[] /* any of these would have been valid next */ }
  | { outcome: "invalid_input"; reason: string }; // e.g. startNodeId not in graph, claimedOrder isn't a permutation of reachable nodes
```

`checkTraversal` computes the real set of valid next-nodes at each step
(BFS: all unvisited neighbors at the current frontier's distance layer;
DFS: all unvisited neighbors reachable via a valid recursive-order
continuation) and confirms `claimedOrder` is consistent with the
algorithm's actual constraints at every step — not compared against one
precomputed reference order.

### Heap operations (`checkers/heap-checker.ts`)

```ts
type HeapOperation = { kind: "insert"; value: number } | { kind: "extract" };
type HeapCheckInput = {
  heapType: "min" | "max";
  operations: HeapOperation[];
  claimedExtractedSequence: number[];
  claimedFinalState: number[];
};
type HeapCheckResult =
  | { outcome: "correct" }
  | { outcome: "incorrect"; expectedExtractedSequence: number[]; expectedFinalState: number[]; firstDivergence: string }
  | { outcome: "invalid_input"; reason: string }; // e.g. extract on an empty heap
```

A separate, simpler pure function, `checkHeapProperty(heapType, array)`,
validates whether an array alone satisfies the min-/max-heap property
(no operation trace involved) — used when a question asks "is this
array a valid heap," not "what results from these operations."

### Tree traversal/insertion (`checkers/tree-checker.ts`)

```ts
type TreeNode = { value: number; left: TreeNode | null; right: TreeNode | null };
type TraversalCheckInput = { tree: TreeNode | null; order: "in-order" | "pre-order" | "post-order"; claimedResult: number[] };
type InsertionCheckInput = { tree: TreeNode | null; insertValue: number; claimedResultTree: TreeNode | null };
type TreeCheckResult =
  | { outcome: "correct" }
  | { outcome: "incorrect"; expected: number[] | TreeNode | null }
  | { outcome: "invalid_input"; reason: string };
```

Traversal order is exactly determined by the tree's real left/right
structure (no ambiguity possible) — exact match against the real
computed traversal. Insertion assumes standard BST insertion (the only
convention this project's benchmark corpus uses); the expected resulting
tree is computed and compared structurally, not just by node count.

### Topological sort (`checkers/topological-sort-checker.ts`)

```ts
type TopoSortCheckInput = { graph: GraphInput; claimedOrder: string[] };
type TopoSortCheckResult =
  | { outcome: "correct" }
  | { outcome: "incorrect"; violatedEdge: [string, string] /* claimedOrder puts target before source */ }
  | { outcome: "invalid_input"; reason: string }; // e.g. the graph has a cycle -- no valid order exists at all
```

Validity check: `claimedOrder` is a permutation of all nodes, and for
every edge `(u, v)` in the graph, `u` appears before `v` in
`claimedOrder`. A cyclic input graph is reported as `invalid_input`
("no topological order exists"), not graded as an incorrect answer —
the question itself would be malformed if it claimed a DAG that isn't
one, which is exactly the kind of input problem
`assessment-generation-pipeline`'s own independent-solve validation
step (PRD S15.4) exists to catch before this checker is ever asked to
grade a real student response against it.

### Bounded shortest path (`checkers/shortest-path-checker.ts`)

```ts
type WeightedGraphInput = { nodeIds: string[]; edges: [string, string, number][]; directed: boolean };
type ShortestPathCheckInput = {
  graph: WeightedGraphInput;
  sourceNodeId: string;
  targetNodeId: string;
  claimedPath: string[];
  claimedTotalDistance: number;
};
type ShortestPathCheckResult =
  | { outcome: "correct" }
  | { outcome: "incorrect"; actualShortestDistance: number; pathIsValid: boolean /* consecutive nodes connected */ }
  | { outcome: "invalid_input"; reason: string }; // e.g. sourceNodeId/targetNodeId not in graph, or genuinely unreachable
```

Validates that `claimedPath` is a real path (every consecutive pair is a
real edge) whose summed edge weights equal `claimedTotalDistance`, and
that `claimedTotalDistance` equals the graph's real shortest distance
(computed via Dijkstra for weighted graphs, BFS for unweighted) — a
claimed path can differ from any one "canonical" shortest path and still
be correct, as long as it's actually shortest.

## Code grading (`code-sandbox-grader.ts`)

```ts
type CodeGradingInput = { code: string; language: "javascript" | "python"; tests: { name: string; assertion: string }[] };
type TestOutcome = { name: string; passed: boolean; output: string };
type CodeGradingResult =
  | { outcome: "graded"; allPassed: boolean; tests: TestOutcome[] }
  | { outcome: "did_not_complete"; reason: "timeout" | "sandbox_error"; detail: string };
```

`outcome: "did_not_complete"` is a structurally distinct case from a
real fail (FR-008) — nothing maps it to `correctness: false` in
`grading-evidence.ts`; a did-not-complete result commits no evidence at
all (there's nothing real to report yet), surfaced back to the caller as
an error instead.

## Rubric grading (`rubric-grader.ts`)

```ts
type GradingRubric = {
  requiredIdeas: string[];
  acceptableAlternatives: string[];
  knownMisconceptions: { description: string; indicativePhrasing: string[] }[];
  partialCreditCriteria: string[];
};
type RubricGradingResult = {
  outcome: "correct" | "incorrect" | "partial";
  satisfiedCriteria: string[];
  matchedMisconception: string | null;
  confidence: number; // 0-1
  isLowConfidence: boolean; // confidence < DEFAULT_RUBRIC_GRADING_CONFIDENCE_THRESHOLD
};
```

`isLowConfidence` is computed by `rubric-grader.ts` itself from the
model's own returned `confidence` against the configured threshold
(research.md) — never left for a caller to forget to check.

## `commitEvidenceFromGradingResult`: the one structural funnel

`src/features/deterministic-grading/grading-evidence.ts`:

```ts
function commitEvidenceFromGradingResult(
  studentContext: { courseId: string; conceptIds: string[]; edgeIds: string[]; assessmentAttemptId: string },
  result: TraversalCheckResult | HeapCheckResult | TreeCheckResult | TopoSortCheckResult | ShortestPathCheckResult | CodeGradingResult | RubricGradingResult,
  responseMeta: { assistanceLevel: number; difficulty: number; transferDistance: number; studentConfidence?: number },
): Promise<{ error: string | null }>
```

Maps every result shape to `learner-graph-evidence`'s
`CommitEvidenceInput`: `correctness` from `outcome === "correct"` (or
`allPassed` for code); `evidenceType` chosen from the response modality
(`retrieval`/`application`/`transfer` per the question's own
`AssessmentType`, never invented ad hoc here); `graderConfidence` is
`1.0` for every deterministic checker/code result (an exact computation
has no uncertainty) and the rubric result's own real `confidence` for
text; `conversationAttemptId` set from `studentContext.assessmentAttemptId`.
An `invalid_input`/`did_not_complete` result commits nothing and returns
an error instead — there is no real observation to record as evidence.
