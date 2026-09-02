# Data Model: Visual Assessment (Graph/Tree)

## `assessment-drawings` Storage bucket -- the one new "table"

Lives in `supabase/migrations/0009_visual_assessment_storage.sql`.
Private bucket, RLS on `storage.objects` keyed on
`(storage.foldername(name))[1] = auth.uid()::text` -- same convention
`course-artifacts`'s own bucket already established (research.md).
Objects are stored under `${user_id}/${attempt_id}/drawing.png`.

No new Postgres table. `assessment_attempts.response` (existing
`jsonb` column) holds, for a visual response:

```ts
type VisualResponseSnapshot = {
  drawingStoragePath: string;
  checkerDomain: CheckerDomain; // deterministic-grading's existing type
  extractedClaimFields: Record<string, unknown>; // before confirmation
  confirmedClaimFields: Record<string, unknown>; // what was actually graded
  extractionConfidence: number;
  wasConfirmationRequired: boolean;
};
```

## Inputs this feature reads, unchanged

- `question_bank` (`assessment-generation-pipeline`) -- a real entry
  with `checker_domain` set to one of `deterministic-grading`'s five
  domains and `response_modality` of `"graph"` or `"tree"`.
- `deterministic-grading`'s checker input types
  (`TraversalCheckInput`, `HeapCheckInput`, tree's own
  `TraversalCheckInput`/`InsertionCheckInput`, `TopoSortCheckInput`,
  `ShortestPathCheckInput`) and its existing `gradeStructuredResponse`
  action -- called directly, never reimplemented.

## `problem-setup.ts`

```ts
export type CheckerDomain = "bfs-dfs" | "heap" | "tree-traversal" | "tree-insertion" | "topological-sort" | "shortest-path";

/**
 * Strips every key prefixed "claimed" from a real checkerInput,
 * leaving only the problem setup safe to render to the student
 * (research.md "Only the answer-claim fields are extracted"). Pure,
 * domain-agnostic -- works the same way regardless of which of the
 * five domains it's given, since every domain already names its own
 * answer field(s) with the same "claimed" prefix.
 */
export function extractProblemSetup(checkerInput: Record<string, unknown>): Record<string, unknown>;

/** The exact field names this function strips, per domain -- used by
 * merge-structure.ts to know which fields to re-attach after
 * extraction/confirmation. Not required by extractProblemSetup itself
 * (which strips by prefix, not by an explicit list), but documents the
 * real shape each domain expects. */
export const CLAIM_FIELD_NAMES: Record<CheckerDomain, string[]>;
```

## `graph-layout.ts` / `tree-layout.ts`

```ts
export type LayoutNode = { id: string; x: number; y: number; label: string };
export type LayoutEdge = { sourceId: string; targetId: string };
export type GraphLayout = { nodes: LayoutNode[]; edges: LayoutEdge[] };

/** Simple deterministic circular/grid placement -- no elkjs
 * (research.md "Custom, small layout functions"). */
export function layoutGraph(graph: GraphInput | WeightedGraphInput): GraphLayout;

export type TreeLayout = { nodes: LayoutNode[]; edges: LayoutEdge[] };

/** Standard recursive placement (depth = y, in-order position = x). */
export function layoutTree(tree: TreeNode | null): TreeLayout;
```

## `extraction-schemas.ts`

```ts
/** One Structured Outputs schema per domain, describing ONLY that
 * domain's claim field(s) -- e.g. bfs-dfs's schema asks for
 * `claimedOrder: string[]`; shortest-path's asks for `claimedPath:
 * string[]` and `claimedTotalDistance: number`. Same bounded set of
 * five domains deterministic-grading already covers -- not a
 * per-subject/per-concept schema. */
export const EXTRACTION_SCHEMAS: Record<CheckerDomain, { name: string; strict: true; schema: object }>;

export const EXTRACTION_PROMPT_BY_DOMAIN: Record<CheckerDomain, string>;
```

## `vision-extraction.ts`

```ts
export type ExtractionResult = {
  claimFields: Record<string, unknown>;
  /** The vision model's own stated confidence, 0-1 -- a real reported
   * value (spec.md Assumptions), never invented by this feature. */
  confidence: number;
};

export async function extractDrawing(
  openai: OpenAI,
  domain: CheckerDomain,
  imageUrl: string, // a real URL/data-uri for the uploaded drawing
): Promise<ExtractionResult>;

/** Tunable, same convention as every other threshold in this project
 * (deterministic-grading's own rubric-grading confidence threshold). */
export const LOW_CONFIDENCE_THRESHOLD = 0.7;

export function needsConfirmation(confidence: number): boolean;
```

## `merge-structure.ts`

```ts
/**
 * Recombines a real problem setup with a (possibly student-corrected)
 * set of claim fields into the exact full checkerInput
 * gradeStructuredResponse expects. Pure -- does no confidence
 * checking, no grading, only reassembly.
 */
export function mergeStructure(
  problemSetup: Record<string, unknown>,
  claimFields: Record<string, unknown>,
): Record<string, unknown>;
```

## Server action flow (`actions.ts`) -- see contracts/visual-assessment-actions.md

`submitDrawing` uploads + extracts + reports whether confirmation is
needed (never grades). `submitConfirmedVisualResponse` is the only
path that ever calls `gradeStructuredResponse` -- it always requires
an explicit `confirmedClaimFields` argument, structurally preventing a
low-confidence extraction from reaching grading unconfirmed
(research.md "Confirmation is enforced structurally").
