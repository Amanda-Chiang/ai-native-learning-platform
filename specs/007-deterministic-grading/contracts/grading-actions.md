# Server Action Contracts

All server actions (`src/features/deterministic-grading/actions.ts`),
same pattern as every other feature in this project.

## `gradeStructuredResponse(input: GradeStructuredResponseInput): Promise<{ result: CheckerResult; error: string | null }>`

```ts
type GradeStructuredResponseInput = {
  courseId: string;
  conceptIds: string[];
  edgeIds: string[];
  domain: "bfs-dfs" | "heap" | "tree" | "topological-sort" | "shortest-path";
  checkerInput: TraversalCheckInput | HeapCheckInput | TreeCheckInput | TopoSortCheckInput | ShortestPathCheckInput; // shape matches `domain` (data-model.md)
  assistanceLevel: number;
  difficulty: number;
  transferDistance: number;
  studentConfidence?: number;
};
```

- **Produces**: dispatches to the checker matching `domain`
  (data-model.md), inserts an `assessment_attempts` row
  (`response_modality: "structured"`), then calls
  `commitEvidenceFromGradingResult` with the real result — an
  `invalid_input` result still inserts the attempt (a real record of
  what was attempted) but commits no evidence and returns a
  non-`null` `error` describing why.

## `gradeCodeResponse(input: GradeCodeResponseInput): Promise<{ result: CodeGradingResult; error: string | null }>`

```ts
type GradeCodeResponseInput = {
  courseId: string;
  conceptIds: string[];
  edgeIds: string[];
  code: string;
  language: "javascript" | "python";
  tests: { name: string; assertion: string }[];
  assistanceLevel: number;
  difficulty: number;
  transferDistance: number;
  studentConfidence?: number;
};
```

- **Produces**: runs `code-sandbox-grader.ts` (real E2B execution),
  inserts an `assessment_attempts` row (`response_modality: "code"`),
  then `commitEvidenceFromGradingResult` — a `did_not_complete` result
  (timeout/sandbox error) still inserts the attempt but commits no
  evidence and returns a non-`null` `error` (FR-008: never recorded as
  an ordinary pass or fail).
- An LLM-generated qualitative explanation of a `graded` result MAY be
  returned alongside `result` for display purposes; it is never itself
  part of `result` and never influences `commitEvidenceFromGradingResult`'s
  mapping (FR-007).

## `gradeTextResponse(input: GradeTextResponseInput): Promise<{ result: RubricGradingResult; error: string | null }>`

```ts
type GradeTextResponseInput = {
  courseId: string;
  conceptIds: string[];
  edgeIds: string[];
  response: string;
  rubric: GradingRubric;
  assistanceLevel: number;
  difficulty: number;
  transferDistance: number;
  studentConfidence?: number;
};
```

- **Produces**: runs `rubric-grader.ts` (an `openai` call against
  `rubric` — reuses the same client `course-graph-ingestion`/
  `tutor-agent` already use), inserts an `assessment_attempts` row
  (`response_modality: "text"`), then `commitEvidenceFromGradingResult`.
  A result with `isLowConfidence: true` still commits evidence (FR-010
  requires it be *flagged*, not withheld) but with `graderConfidence`
  set to the rubric grader's own real (low) confidence value, never
  inflated to look certain.
