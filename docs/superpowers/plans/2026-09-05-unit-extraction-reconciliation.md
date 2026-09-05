# Unit Extraction & Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let units be extracted automatically alongside concepts (fixing the real bug where extraction throws for every course today), while treating any manually-created unit or manually-tagged upload as authoritative, and surfacing real `extraction_runs` status so a failure is never invisible.

**Architecture:** Extend the existing `course-graph-ingestion` extraction/reconciliation pipeline (not a new feature) — `course_units` gains a review lifecycle mirroring `course_concepts`; the extraction prompt is given the course's existing units as a menu so a manually-created unit gets filled directly instead of relying on post-hoc merge; a hard per-artifact `target_unit_id` overrides the menu entirely; unit reconciliation reuses the same merge/distinct/uncertain LLM classifier concepts already use.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Supabase (Postgres + RLS), Trigger.dev v4 tasks, OpenAI Responses API with Structured Outputs (`gpt-4.1`), `node --test` for unit tests.

## Global Constraints

- No new npm dependency — everything here reuses `@supabase/supabase-js`, `openai`, `@trigger.dev/sdk`, already-installed.
- Every learner-facing/ontology mutation must go through the existing proposed→confirmed→archived lifecycle; no direct writes (repo-wide invariant).
- No silent placeholders: an unresolvable reference throws with a specific message, never falls back to a plausible-looking default.
- Solo-authored commits, no AI co-author trailer. Commit after each task.
- `npm run typecheck` must pass after every task before moving to the next.
- Migrations follow `NNNN_description.sql` numbering under `supabase/migrations/` — next number is `0012`.

---

### Task 1: Migration — schema changes for unit lifecycle, artifact targeting, unit reconciliation

**Files:**
- Create: `supabase/migrations/0012_unit_extraction_reconciliation.sql`

**Interfaces:**
- Produces: `course_units.status` (`'proposed'|'confirmed'|'archived'`), `course_units.extraction_run_id` (nullable FK → `extraction_runs.id`), `artifacts.target_unit_id` (nullable FK → `course_units.id`), `reconciliation_decisions.candidate_kind` extended to include `'unit'`, `reconciliation_decisions.matched_unit_id` (nullable FK → `course_units.id`).

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/migrations/0012_unit_extraction_reconciliation.sql
--
-- docs/superpowers/specs/2026-09-05-unit-extraction-reconciliation-design.md
--
-- Lets units be extracted automatically (mirroring course_concepts'
-- proposed/confirmed/archived lifecycle) instead of requiring one to
-- already exist by hand before extraction can run at all. Adds an
-- optional per-artifact unit target (hard rule, not a hint) and
-- extends reconciliation_decisions to cover unit candidates.

-- ============================================================
-- course_units: add review lifecycle + provenance
-- ============================================================

alter table public.course_units
  add column status text
    check (status in ('proposed', 'confirmed', 'archived'));

-- Backfill: every pre-existing unit was owner-authored under the old
-- (pre-this-migration) model, so it's authoritative already.
update public.course_units set status = 'confirmed' where status is null;

alter table public.course_units
  alter column status set not null;

alter table public.course_units
  add column extraction_run_id uuid references public.extraction_runs (id);

create index if not exists course_units_status_idx on public.course_units (status);

-- Service-role (the Trigger.dev extraction task) now also inserts
-- 'proposed' units, same bypass-RLS-by-design pattern
-- course_concepts/concept_edges inserts already use -- no new RLS
-- policy needed for that (service-role bypasses RLS entirely). The
-- owner-session insert policy (course_units_insert_own, from
-- 0003_course_ontology.sql) is unchanged: a manually-created unit
-- still inserts as 'confirmed' through the owner's own session.

-- ============================================================
-- artifacts: optional per-upload unit target (hard rule at
-- extraction time, not a hint)
-- ============================================================

alter table public.artifacts
  add column target_unit_id uuid references public.course_units (id);

-- ============================================================
-- reconciliation_decisions: cover unit candidates too
-- ============================================================

alter table public.reconciliation_decisions
  drop constraint if exists reconciliation_decisions_candidate_kind_check;

alter table public.reconciliation_decisions
  add constraint reconciliation_decisions_candidate_kind_check
  check (candidate_kind in ('concept', 'edge', 'unit'));

-- Separate nullable column from matched_concept_id rather than
-- reusing it for a unit id -- keeps the existing column's meaning
-- unchanged for every existing concept-reconciliation row/consumer.
alter table public.reconciliation_decisions
  add column matched_unit_id uuid references public.course_units (id);

alter table public.reconciliation_decisions
  drop constraint if exists reconciliation_decisions_check;

alter table public.reconciliation_decisions
  add constraint reconciliation_decisions_check
  check (
    (decision = 'merge' and (matched_concept_id is not null or matched_unit_id is not null))
    or (decision <> 'merge')
  );
```

- [ ] **Step 2: Push the migration to the real Supabase project**

Run: `npx supabase db push`
Expected: migration applies cleanly, no errors.

- [ ] **Step 3: Live-verify the schema change**

Using the Supabase SQL editor or `psql`, confirm:
```sql
select column_name, is_nullable, data_type
from information_schema.columns
where table_name = 'course_units' and column_name in ('status', 'extraction_run_id');

select column_name from information_schema.columns
where table_name = 'artifacts' and column_name = 'target_unit_id';

select column_name from information_schema.columns
where table_name = 'reconciliation_decisions' and column_name = 'matched_unit_id';
```
Expected: all columns present with the right nullability. Also confirm every pre-existing `course_units` row now has `status = 'confirmed'` (the backfill ran):
```sql
select count(*) from public.course_units where status is null;
-- expected: 0
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0012_unit_extraction_reconciliation.sql
git commit -m "feat(db): add unit review lifecycle, artifact unit targeting, unit reconciliation"
```

---

### Task 2: Update `database.types.ts` to match the new schema

**Files:**
- Modify: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Consumes: `OntologyStatus` (already defined, line ~71 today).
- Produces: `CourseUnitRow` gains `status: OntologyStatus`, `extraction_run_id: string | null`. `ArtifactRow` gains `target_unit_id: string | null`. `ReconciliationDecisionKind` becomes `"concept" | "edge" | "unit"`. `ReconciliationDecisionRow` gains `matched_unit_id: string | null`.

- [ ] **Step 1: Update `CourseUnitRow`**

Find (currently ~line 63):
```ts
export type CourseUnitRow = {
  id: string;
  course_id: string;
  owner_id: string;
  title: string;
  created_at: string;
};
```
Replace with:
```ts
export type CourseUnitRow = {
  id: string;
  course_id: string;
  owner_id: string;
  title: string;
  status: OntologyStatus;
  extraction_run_id: string | null;
  created_at: string;
};
```

- [ ] **Step 2: Update `ArtifactRow`**

Find (currently ~line 23):
```ts
export type ArtifactRow = {
  id: string;
  course_id: string;
  owner_id: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  status: ArtifactStatus;
  created_at: string;
  updated_at: string;
};
```
Replace with:
```ts
export type ArtifactRow = {
  id: string;
  course_id: string;
  owner_id: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  status: ArtifactStatus;
  target_unit_id: string | null;
  created_at: string;
  updated_at: string;
};
```

- [ ] **Step 3: Update `ReconciliationDecisionKind` and `ReconciliationDecisionRow`**

Find (currently ~line 138):
```ts
export type ReconciliationDecisionKind = "concept" | "edge";
```
Replace with:
```ts
export type ReconciliationDecisionKind = "concept" | "edge" | "unit";
```

Find `ReconciliationDecisionRow` (currently ~line 141):
```ts
export type ReconciliationDecisionRow = {
  id: string;
  course_id: string;
  owner_id: string;
  extraction_run_id: string;
  candidate_kind: ReconciliationDecisionKind;
  decision: ReconciliationDecisionOutcome;
  matched_concept_id: string | null;
  reasoning: string;
  created_at: string;
};
```
Replace with:
```ts
export type ReconciliationDecisionRow = {
  id: string;
  course_id: string;
  owner_id: string;
  extraction_run_id: string;
  candidate_kind: ReconciliationDecisionKind;
  decision: ReconciliationDecisionOutcome;
  matched_concept_id: string | null;
  matched_unit_id: string | null;
  reasoning: string;
  created_at: string;
};
```

- [ ] **Step 4: Update the `course_units` and `reconciliation_decisions` table Insert/Update entries**

Find:
```ts
      course_units: {
        Row: CourseUnitRow;
        Insert: Omit<CourseUnitRow, "id" | "created_at">;
        Update: Partial<Omit<CourseUnitRow, "id">>;
        Relationships: [];
      };
```
This already covers the new fields correctly via `Omit<CourseUnitRow, "id" | "created_at">` (no change needed — `status` and `extraction_run_id` are now just part of the wider `CourseUnitRow` the Omit operates over). Confirm no edit needed here; same for `reconciliation_decisions` and `artifacts` entries further down — they're already defined generically enough. Do not add redundant entries.

- [ ] **Step 5: Run typecheck to confirm the type changes compile**

Run: `npm run typecheck`
Expected: FAILS at this point — `getCourseGraph`'s `materializeCourseGraph` call and any other `CourseUnitRow`/`ArtifactRow` consumer that destructures every field with an exhaustive object literal may now be missing the new required fields. This is expected; later tasks fix each real consumer. If nothing fails yet, that's fine too (some consumers use `.select("*")` and don't exhaustively list fields).

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase/database.types.ts
git commit -m "feat(db): update database.types.ts for unit lifecycle + artifact targeting"
```

---

### Task 3: Extend the extraction schema — `units` array + `unitRef` on concepts

**Files:**
- Modify: `src/features/course-graph-ingestion/extraction-schema.ts`
- Test: `tests/unit/course-graph-ingestion/extraction-schema.test.ts`

**Interfaces:**
- Produces: `CandidateUnit = { localId: string; title: string }`, `UnitRef = { kind: "existing"; unitId: string } | { kind: "new"; localId: string }`, `CandidateConcept.unitRef: UnitRef`, `ExtractionResult.units: CandidateUnit[]`.
- Consumes: nothing new (pure, no imports beyond what's already there).

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/course-graph-ingestion/extraction-schema.test.ts` (after the existing imports, before the first `test(...)`):

```ts
const validResponseWithUnits = {
  units: [{ localId: "u1", title: "Graph Theory" }],
  concepts: [
    {
      localId: "c1",
      canonicalName: "Breadth-First Search",
      aliases: ["BFS"],
      description: "Explores graph nodes in increasing order of distance from a source vertex.",
      importanceScore: 0.9,
      sourceAnchors: [{ locator: "slide 4", excerpt: "Explore in increasing order of distance" }],
      confidence: 0.9,
      unitRef: { kind: "new", localId: "u1" },
    },
  ],
  edges: [],
};

test("a response with a new unit and a concept referencing it parses successfully", () => {
  const result = parseExtractionResult(validResponseWithUnits);
  assert.equal(result.units.length, 1);
  assert.equal(result.units[0].localId, "u1");
  assert.deepEqual(result.concepts[0].unitRef, { kind: "new", localId: "u1" });
});

test("a concept's unitRef of kind 'new' referencing a localId absent from units[] throws", () => {
  const bad = {
    units: [],
    concepts: [{ ...validResponseWithUnits.concepts[0], unitRef: { kind: "new", localId: "u1" } }],
    edges: [],
  };
  assert.throws(() => parseExtractionResult(bad), /unitRef.*"u1"/);
});

test("a concept's unitRef of kind 'existing' with a real-looking id parses without requiring a units[] entry", () => {
  const withExisting = {
    units: [],
    concepts: [
      { ...validResponseWithUnits.concepts[0], unitRef: { kind: "existing", unitId: "real-unit-id-123" } },
    ],
    edges: [],
  };
  const result = parseExtractionResult(withExisting);
  assert.deepEqual(result.concepts[0].unitRef, { kind: "existing", unitId: "real-unit-id-123" });
});

test("a malformed unitRef (missing kind) throws", () => {
  const bad = {
    units: [],
    concepts: [{ ...validResponseWithUnits.concepts[0], unitRef: { unitId: "x" } }],
    edges: [],
  };
  assert.throws(() => parseExtractionResult(bad));
});
```

Also update the pre-existing `validResponse` fixture at the top of the file (and every existing concept literal in it) to add a `unitRef` field — pick any valid one, e.g. `unitRef: { kind: "existing", unitId: "placeholder-existing-unit" }`, since `unitRef` is now a required field and the old fixtures will otherwise fail validation once Step 3 lands.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/course-graph-ingestion/extraction-schema.test.ts`
Expected: FAIL — `units` doesn't exist on `ExtractionResult`, `unitRef` isn't validated.

- [ ] **Step 3: Implement the schema/type/validation changes**

In `src/features/course-graph-ingestion/extraction-schema.ts`, add after `CandidateSourceAnchor`:

```ts
export type CandidateUnit = {
  localId: string;
  title: string;
};

export type UnitRef =
  | { kind: "existing"; unitId: string }
  | { kind: "new"; localId: string };
```

Change `CandidateConcept` to add the field:
```ts
export type CandidateConcept = {
  localId: string;
  canonicalName: string;
  aliases: string[];
  description: string;
  importanceScore: number;
  sourceAnchors: CandidateSourceAnchor[];
  confidence: number;
  unitRef: UnitRef;
};
```

Change `ExtractionResult`:
```ts
export type ExtractionResult = {
  units: CandidateUnit[];
  concepts: CandidateConcept[];
  edges: CandidateEdge[];
};
```

Add a unit schema object near `sourceAnchorSchema`:
```ts
const unitSchema = {
  type: "object",
  properties: {
    localId: { type: "string" },
    title: { type: "string" },
  },
  required: ["localId", "title"],
  additionalProperties: false,
};

const unitRefSchema = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["existing", "new"] },
    unitId: { type: ["string", "null"] },
    localId: { type: ["string", "null"] },
  },
  required: ["kind", "unitId", "localId"],
  additionalProperties: false,
};
```

Update `EXTRACTION_RESPONSE_SCHEMA.schema.properties` to add `units` and give each concept a `unitRef`:
```ts
export const EXTRACTION_RESPONSE_SCHEMA = {
  name: "course_graph_extraction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      units: {
        type: "array",
        items: unitSchema,
      },
      concepts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            localId: { type: "string" },
            canonicalName: { type: "string" },
            aliases: { type: "array", items: { type: "string" } },
            description: { type: "string" },
            importanceScore: { type: "number" },
            sourceAnchors: { type: "array", items: sourceAnchorSchema, minItems: 1 },
            confidence: { type: "number" },
            unitRef: unitRefSchema,
          },
          required: [
            "localId",
            "canonicalName",
            "aliases",
            "description",
            "importanceScore",
            "sourceAnchors",
            "confidence",
            "unitRef",
          ],
          additionalProperties: false,
        },
      },
      edges: {
        // unchanged from today
        type: "array",
        items: {
          type: "object",
          properties: {
            sourceLocalId: { type: "string" },
            targetLocalId: { type: "string" },
            relationType: { type: "string", enum: ALL_RELATION_TYPES },
            relationTypeNote: { type: ["string", "null"] },
            explanation: { type: "string" },
            sourceAnchors: { type: "array", items: sourceAnchorSchema, minItems: 1 },
            confidence: { type: "number" },
          },
          required: [
            "sourceLocalId",
            "targetLocalId",
            "relationType",
            "relationTypeNote",
            "explanation",
            "sourceAnchors",
            "confidence",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["units", "concepts", "edges"],
    additionalProperties: false,
  },
} as const;
```

Note: Structured Outputs strict mode requires every optional-looking field to be modeled as required-but-nullable, matching this file's existing `relationTypeNote` convention — that's why `unitRefSchema` declares both `unitId` and `localId` as required-but-nullable rather than making the object a true union at the JSON Schema level (JSON Schema `oneOf` inside strict mode is more fragile than a flat nullable-fields shape; follow the existing pattern in this file rather than introducing a new one).

Add validators after `isCandidateSourceAnchor`:
```ts
function isCandidateUnit(value: unknown): value is CandidateUnit {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.localId === "string" && typeof v.title === "string";
}

function isUnitRef(value: unknown): value is UnitRef {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.kind === "existing") return typeof v.unitId === "string";
  if (v.kind === "new") return typeof v.localId === "string";
  return false;
}
```

Update `isCandidateConcept` to also check `unitRef`:
```ts
function isCandidateConcept(value: unknown): value is CandidateConcept {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.localId !== "string") return false;
  if (typeof v.canonicalName !== "string") return false;
  if (!Array.isArray(v.aliases) || !v.aliases.every((a) => typeof a === "string")) return false;
  if (typeof v.description !== "string") return false;
  if (typeof v.importanceScore !== "number") return false;
  if (typeof v.confidence !== "number") return false;
  if (!Array.isArray(v.sourceAnchors) || v.sourceAnchors.length < 1) return false;
  if (!v.sourceAnchors.every(isCandidateSourceAnchor)) return false;
  if (!isUnitRef(v.unitRef)) return false;
  return true;
}
```

Update `parseExtractionResult`:
```ts
export function parseExtractionResult(raw: unknown): ExtractionResult {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Extraction response is not an object.");
  }
  const v = raw as Record<string, unknown>;

  if (!Array.isArray(v.units) || !v.units.every(isCandidateUnit)) {
    throw new Error("Extraction response's \"units\" array is missing or invalid.");
  }
  if (!Array.isArray(v.concepts) || !v.concepts.every(isCandidateConcept)) {
    throw new Error("Extraction response's \"concepts\" array is missing or invalid.");
  }
  if (!Array.isArray(v.edges) || !v.edges.every(isCandidateEdge)) {
    throw new Error("Extraction response's \"edges\" array is missing or invalid.");
  }

  const unitLocalIds = new Set(v.units.map((u) => u.localId));
  for (const concept of v.concepts) {
    if (concept.unitRef.kind === "new" && !unitLocalIds.has(concept.unitRef.localId)) {
      throw new Error(
        `Concept "${concept.localId}" has unitRef.localId "${concept.unitRef.localId}", which is not present in this response's "units" array.`,
      );
    }
  }

  const localIds = new Set(v.concepts.map((c) => c.localId));
  for (const edge of v.edges) {
    if (!localIds.has(edge.sourceLocalId)) {
      throw new Error(`Edge references unknown sourceLocalId "${edge.sourceLocalId}".`);
    }
    if (!localIds.has(edge.targetLocalId)) {
      throw new Error(`Edge references unknown targetLocalId "${edge.targetLocalId}".`);
    }
  }

  return { units: v.units, concepts: v.concepts, edges: v.edges };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/course-graph-ingestion/extraction-schema.test.ts`
Expected: PASS, including the pre-existing tests (once their fixtures were updated with a `unitRef` in Step 1).

- [ ] **Step 5: Run full typecheck**

Run: `npm run typecheck`
Expected: New errors in `openai-extraction-call.ts`'s `EXTRACTION_PROMPT` usage are fine (unrelated, string constant); real errors would be anywhere else importing `CandidateConcept`/`ExtractionResult` without the new field — none should exist yet since `extract-course-graph.ts` isn't touched until Task 6.

- [ ] **Step 6: Commit**

```bash
git add src/features/course-graph-ingestion/extraction-schema.ts tests/unit/course-graph-ingestion/extraction-schema.test.ts
git commit -m "feat(course-graph-ingestion): add units + unitRef to extraction schema"
```

---

### Task 4: Generalize reconciliation to cover unit candidates

**Files:**
- Modify: `src/features/course-graph-ingestion/reconciliation.ts`
- Test: `tests/unit/course-graph-ingestion/reconciliation.test.ts`

**Interfaces:**
- Produces: `ExistingUnitSummary = { id: string; title: string }`, `ReconciliationCandidateUnit = { title: string }`, `UnitReconciliationResult = { decision: "merge"; matchedUnitId: string; reasoning: string } | { decision: "distinct"; reasoning: string } | { decision: "uncertain"; reasoning: string }`, `UnitReconciliationClassifier`, `reconcileUnit(classify, candidate, existingUnits): Promise<UnitReconciliationResult>`, `createOpenAiUnitReconciliationClassifier(openai, model): UnitReconciliationClassifier`.
- Consumes: nothing new from other modules.

Chosen approach (per the design doc's deferred decision): a **thin, separate set of unit-specific types and functions**, not a shared generic — `ReconciliationResult`'s `matchedConceptId` field name is concept-specific and forcing a generic would either rename it (breaking every existing consumer) or introduce an awkward generic type parameter for a three-branch discriminated union. A parallel, structurally-identical `reconcileUnit`/`createOpenAiUnitReconciliationClassifier` pair is clearer to read and to test in isolation, at the cost of ~40 lines of duplication — an acceptable, explicit trade-off (this file is small; duplication here is more legible than a forced abstraction).

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/course-graph-ingestion/reconciliation.test.ts`:

```ts
import {
  reconcileUnit,
  type ExistingUnitSummary,
  type UnitReconciliationClassifier,
  type UnitReconciliationResult,
} from "../../../src/features/course-graph-ingestion/reconciliation.ts";

const existingUnits: ExistingUnitSummary[] = [
  { id: "unit-graph-theory-real-id", title: "Graph Theory" },
  { id: "unit-dp-real-id", title: "Dynamic Programming" },
];

function fakeUnitClassifier(result: UnitReconciliationResult): UnitReconciliationClassifier {
  return async () => result;
}

test("a mocked unit 'merge' response resolves to the existing unit's id", async () => {
  const classify = fakeUnitClassifier({
    decision: "merge",
    matchedUnitId: "unit-graph-theory-real-id",
    reasoning: "\"Graphs\" is the same topic as the existing \"Graph Theory\" unit.",
  });

  const result = await reconcileUnit(classify, { title: "Graphs" }, existingUnits);

  assert.equal(result.decision, "merge");
  if (result.decision === "merge") {
    assert.equal(result.matchedUnitId, "unit-graph-theory-real-id");
  }
});

test("a genuinely new unit classifies as 'distinct'", async () => {
  const classify = fakeUnitClassifier({
    decision: "distinct",
    reasoning: "No existing unit covers sorting algorithms.",
  });

  const result = await reconcileUnit(classify, { title: "Sorting & Search" }, existingUnits);

  assert.equal(result.decision, "distinct");
});

test("a course with zero existing units short-circuits to 'distinct' without calling the classifier", async () => {
  let called = false;
  const classify: UnitReconciliationClassifier = async () => {
    called = true;
    return { decision: "distinct", reasoning: "should not be reached" };
  };

  const result = await reconcileUnit(classify, { title: "Graph Theory" }, []);

  assert.equal(result.decision, "distinct");
  assert.equal(called, false, "classifier must not be called when there's nothing to compare against");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/course-graph-ingestion/reconciliation.test.ts`
Expected: FAIL — `reconcileUnit` doesn't exist.

- [ ] **Step 3: Implement**

Append to `src/features/course-graph-ingestion/reconciliation.ts`:

```ts
// ============================================================
// Unit reconciliation -- structurally identical to concept
// reconciliation above, kept as a separate parallel pair rather than
// a shared generic (see plan Task 4's rationale: matchedConceptId's
// field name is concept-specific, and a forced generic over a
// 3-branch discriminated union reads worse than ~40 lines of
// duplication here).
// ============================================================

export type ExistingUnitSummary = {
  id: string;
  title: string;
};

export type ReconciliationCandidateUnit = {
  title: string;
};

export type UnitReconciliationResult =
  | { decision: "merge"; matchedUnitId: string; reasoning: string }
  | { decision: "distinct"; reasoning: string }
  | { decision: "uncertain"; reasoning: string };

export type UnitReconciliationClassifier = (
  candidate: ReconciliationCandidateUnit,
  existingUnits: ExistingUnitSummary[],
) => Promise<UnitReconciliationResult>;

const UNIT_RECONCILIATION_RESPONSE_SCHEMA = {
  name: "unit_reconciliation",
  strict: true,
  schema: {
    type: "object",
    properties: {
      decision: { type: "string", enum: ["merge", "distinct", "uncertain"] },
      matchedUnitId: { type: ["string", "null"] },
      reasoning: { type: "string" },
    },
    required: ["decision", "matchedUnitId", "reasoning"],
    additionalProperties: false,
  },
} as const;

function isValidUnitClassificationShape(
  value: unknown,
): value is { decision: "merge" | "distinct" | "uncertain"; matchedUnitId: string | null; reasoning: string } {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.decision !== "merge" && v.decision !== "distinct" && v.decision !== "uncertain") return false;
  if (v.matchedUnitId !== null && typeof v.matchedUnitId !== "string") return false;
  if (typeof v.reasoning !== "string") return false;
  return true;
}

export function createOpenAiUnitReconciliationClassifier(
  openai: OpenAI,
  model: string,
): UnitReconciliationClassifier {
  return async (candidate, existingUnits) => {
    const response = await openai.responses.create({
      model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "You are reconciling one newly extracted course unit (a coarse topic grouping, e.g. \"Graph Theory\") against a course's existing unit list.",
                "Decide exactly one of: \"merge\" (this candidate is the same underlying topic as one existing unit, possibly under a different name -- set matchedUnitId to that unit's id), \"distinct\" (this is genuinely a different, new topic grouping), or \"uncertain\" (you are not confident either way -- never guess merge or distinct when you're not sure).",
                "",
                `Candidate: ${JSON.stringify(candidate)}`,
                "",
                `Existing units: ${JSON.stringify(existingUnits)}`,
              ].join("\n"),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: UNIT_RECONCILIATION_RESPONSE_SCHEMA.name,
          strict: UNIT_RECONCILIATION_RESPONSE_SCHEMA.strict,
          schema: UNIT_RECONCILIATION_RESPONSE_SCHEMA.schema,
        },
      },
    });

    const raw: unknown = JSON.parse(response.output_text);
    if (!isValidUnitClassificationShape(raw)) {
      throw new Error("Unit reconciliation response failed schema validation.");
    }
    if (raw.decision === "merge") {
      if (!raw.matchedUnitId) {
        throw new Error("Unit reconciliation returned decision \"merge\" without a matchedUnitId.");
      }
      return { decision: "merge", matchedUnitId: raw.matchedUnitId, reasoning: raw.reasoning };
    }
    return { decision: raw.decision, reasoning: raw.reasoning };
  };
}

export async function reconcileUnit(
  classify: UnitReconciliationClassifier,
  candidate: ReconciliationCandidateUnit,
  existingUnits: ExistingUnitSummary[],
): Promise<UnitReconciliationResult> {
  if (existingUnits.length === 0) {
    return { decision: "distinct", reasoning: "No existing units in this course yet to compare against." };
  }
  return classify(candidate, existingUnits);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/course-graph-ingestion/reconciliation.test.ts`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Commit**

```bash
git add src/features/course-graph-ingestion/reconciliation.ts tests/unit/course-graph-ingestion/reconciliation.test.ts
git commit -m "feat(course-graph-ingestion): add unit reconciliation, parallel to concept reconciliation"
```

---

### Task 5: Pure unit-reference resolution function

**Files:**
- Modify: `trigger/extract-course-graph.ts`
- Test: `tests/unit/course-graph-ingestion/resolve-unit-references.test.ts`

**Interfaces:**
- Consumes: `CandidateUnit`, `UnitRef` (Task 3), `UnitReconciliationResult` (Task 4).
- Produces: `resolveUnitReferences(units: CandidateUnit[], reconciliations: Map<string, UnitReconciliationResult>): { unitLocalIdToRealId: Map<string, string>; toInsert: Array<{ localId: string; title: string }> }` — pure, no Supabase, testable standalone. (Real row-insertion for `toInsert` and the merge-vs-distinct-vs-uncertain row-creation happens in `writeExtractionCandidates`, Task 6 — this function only computes *which* units need a real row created vs. which already resolve to an existing id, mirroring `resolveEdgeEndpoints`'s "pure resolution, caller does the I/O" split.)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/course-graph-ingestion/resolve-unit-references.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { resolveUnitReferences } from "../../../trigger/extract-course-graph.ts";
import type { CandidateUnit } from "../../../src/features/course-graph-ingestion/extraction-schema.ts";
import type { UnitReconciliationResult } from "../../../src/features/course-graph-ingestion/reconciliation.ts";

test("a unit reconciled as 'merge' resolves to the matched existing id, with no new row to insert", () => {
  const units: CandidateUnit[] = [{ localId: "u1", title: "Graphs" }];
  const reconciliations = new Map<string, UnitReconciliationResult>([
    ["u1", { decision: "merge", matchedUnitId: "existing-graph-theory-id", reasoning: "same topic" }],
  ]);

  const { unitLocalIdToRealId, toInsert } = resolveUnitReferences(units, reconciliations);

  assert.equal(unitLocalIdToRealId.get("u1"), "existing-graph-theory-id");
  assert.equal(toInsert.length, 0);
});

test("a unit reconciled as 'distinct' or 'uncertain' needs a new row inserted", () => {
  const units: CandidateUnit[] = [
    { localId: "u1", title: "Dynamic Programming" },
    { localId: "u2", title: "Maybe Recursion" },
  ];
  const reconciliations = new Map<string, UnitReconciliationResult>([
    ["u1", { decision: "distinct", reasoning: "genuinely new" }],
    ["u2", { decision: "uncertain", reasoning: "not sure" }],
  ]);

  const { toInsert } = resolveUnitReferences(units, reconciliations);

  assert.equal(toInsert.length, 2);
  assert.deepEqual(toInsert.map((u) => u.localId).sort(), ["u1", "u2"]);
});

test("a units array with no reconciliation entry throws (every unit must have been reconciled)", () => {
  const units: CandidateUnit[] = [{ localId: "u1", title: "Graphs" }];
  assert.throws(() => resolveUnitReferences(units, new Map()));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/course-graph-ingestion/resolve-unit-references.test.ts`
Expected: FAIL — `resolveUnitReferences` is not exported from `extract-course-graph.ts` yet.

- [ ] **Step 3: Implement**

In `trigger/extract-course-graph.ts`, add this exported function near `resolveEdgeEndpoints` (same file, same export style):

```ts
/**
 * Pure: for each candidate unit, resolves it to either an existing
 * real unit id (its reconciliation was "merge") or marks it as
 * needing a new row inserted ("distinct"/"uncertain" both become new
 * proposed rows -- "uncertain" is still visible to a reviewer as its
 * own candidate, same convention as concepts). Every unit MUST have a
 * reconciliation entry -- this function does not reconcile anything
 * itself (that's an OpenAI call, done by the caller before this runs),
 * it only turns already-decided reconciliations into insert/resolve
 * instructions, so it's testable without a live Supabase or OpenAI
 * call (tests/unit/course-graph-ingestion/resolve-unit-references.test.ts).
 */
export function resolveUnitReferences(
  units: CandidateUnit[],
  reconciliations: Map<string, UnitReconciliationResult>,
): {
  unitLocalIdToRealId: Map<string, string>;
  toInsert: CandidateUnit[];
} {
  const unitLocalIdToRealId = new Map<string, string>();
  const toInsert: CandidateUnit[] = [];

  for (const unit of units) {
    const reconciliation = reconciliations.get(unit.localId);
    if (!reconciliation) {
      throw new Error(`Candidate unit "${unit.localId}" has no reconciliation decision.`);
    }
    if (reconciliation.decision === "merge") {
      unitLocalIdToRealId.set(unit.localId, reconciliation.matchedUnitId);
    } else {
      toInsert.push(unit);
    }
  }

  return { unitLocalIdToRealId, toInsert };
}
```

Add the necessary imports at the top of `trigger/extract-course-graph.ts`:
```ts
import type { CandidateUnit } from "../src/features/course-graph-ingestion/extraction-schema.ts";
import type { UnitReconciliationResult } from "../src/features/course-graph-ingestion/reconciliation.ts";
```//(these will already be needed by Task 6's changes to the same file — adding them now is fine since Task 6 builds directly on this function)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/course-graph-ingestion/resolve-unit-references.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add trigger/extract-course-graph.ts tests/unit/course-graph-ingestion/resolve-unit-references.test.ts
git commit -m "feat(course-graph-ingestion): add pure resolveUnitReferences function"
```

---

### Task 6: Wire units into the extraction pipeline — prompt menu, hard override, write ordering

**Files:**
- Modify: `src/features/course-graph-ingestion/openai-extraction-call.ts`
- Modify: `trigger/extract-course-graph.ts`

**Interfaces:**
- Consumes: `resolveUnitReferences` (Task 5), `reconcileUnit`/`createOpenAiUnitReconciliationClassifier`/`ExistingUnitSummary` (Task 4), `CandidateUnit`/`UnitRef` (Task 3).
- Produces: `callExtractionModel` gains an optional units-menu/override parameter; `extractCourseGraphTask` fetches existing units and the artifact's `target_unit_id` before calling the model; `writeExtractionCandidates` resolves units before concepts.

- [ ] **Step 1: Update the extraction prompt to accept an existing-units menu and an optional hard override**

In `src/features/course-graph-ingestion/openai-extraction-call.ts`, change `EXTRACTION_PROMPT` from a plain string constant to a function (keeping the constant name available for any other reader that still wants the base text — but the real call site now uses the function):

```ts
export const EXTRACTION_PROMPT_BASE = `You are extracting a course concept graph from one course artifact. The course's subject is not fixed in advance -- it could be computer science, history, biology, or any other field. Infer the subject and its own vocabulary entirely from the attached content itself; never assume or default to any particular field.

Read the attached content and identify the distinct teachable concepts it introduces or discusses, and the relationships between them, and the coarse topic/unit groupings (e.g. "Graph Theory", "Dynamic Programming") they belong to.

Rules:
- Only extract concepts and relationships that are actually present in this artifact. If the artifact has no extractable course content, return empty units, concepts, and edges arrays -- do not invent placeholder content.
- Every concept and every edge MUST include at least one sourceAnchor (locator + a short excerpt or close paraphrase) grounding it in this specific artifact. Never omit this.
- Use the standard relationType taxonomy (prerequisite_for, part_of, mechanism_for, contrasts_with, used_in, generalizes_to, example_of) wherever one fits. Only use "other" when none of these genuinely fit, and in that case you MUST fill in relationTypeNote explaining why.
- Assign each concept a short, stable localId (e.g. "c1", "c2") and reference those localIds from edges -- do not invent ids that look like database ids.
- Assign each newly-proposed unit a short, stable localId (e.g. "u1", "u2") in the "units" array -- do not invent ids that look like database ids.
- Every concept's unitRef must be either {"kind":"existing","unitId":<a real id from the existing-units list below>} or {"kind":"new","localId":<one of this response's own units[].localId>}.
- confidence and importanceScore are your own honest 0-1 estimates, not fixed defaults.`;

/**
 * Builds the real prompt sent for one extraction call, given the
 * course's current units. `existingUnits` should include units with
 * status "proposed" or "confirmed" (not "archived") -- same filter
 * concepts already use for their own existing-list. When
 * `hardTargetUnit` is set (the artifact was explicitly tagged to a
 * unit at upload time), the model is told to attach every concept
 * there directly and is not offered the menu or a new-unit proposal
 * at all for this call -- a hard rule, not a hint (design.md).
 */
export function buildExtractionPrompt(
  existingUnits: { id: string; title: string }[],
  hardTargetUnit: { id: string; title: string } | null,
): string {
  if (hardTargetUnit) {
    return `${EXTRACTION_PROMPT_BASE}

This artifact has been explicitly tagged by its uploader as being for the unit "${hardTargetUnit.title}" (id: ${hardTargetUnit.id}). Every concept you extract MUST use unitRef {"kind":"existing","unitId":"${hardTargetUnit.id}"} -- do not propose any new unit, and do not attach any concept to a different unit, even if some content seems to belong elsewhere. The "units" array in your response must be empty.`;
  }

  const menu = existingUnits.length > 0
    ? existingUnits.map((u) => `- ${u.title} (id: ${u.id})`).join("\n")
    : "(none yet -- this course has no units so far)";

  return `${EXTRACTION_PROMPT_BASE}

This course's existing units:
${menu}

Prefer attaching a concept to one of these existing units (unitRef kind "existing") when the content clearly belongs there. Only propose a new unit (unitRef kind "new") when nothing existing fits.`;
}
```

Keep `EXTRACTION_PROMPT` as a backward-compatible alias for any other current reader (`scripts/score-extraction.ts`, per the file's own doc comment) — check that script's usage first:

Run: `grep -n "EXTRACTION_PROMPT" scripts/score-extraction.ts`

If it imports `EXTRACTION_PROMPT` directly, update it to call `buildExtractionPrompt([], null)` instead (the benchmark corpus has no existing units/target — matches its "plain-markdown sources" bootstrap-style use case). Do this update in this same step if the grep finds a usage.

- [ ] **Step 2: Update `extractCourseGraphTask` to fetch existing units, the artifact's target, and build the real prompt**

In `trigger/extract-course-graph.ts`, update the imports:

```ts
import { parseExtractionResult, type ExtractionResult, type CandidateUnit } from "../src/features/course-graph-ingestion/extraction-schema.ts";
import { buildExtractionPrompt, callExtractionModel } from "../src/features/course-graph-ingestion/openai-extraction-call.ts";
import {
  createOpenAiReconciliationClassifier,
  createOpenAiUnitReconciliationClassifier,
  reconcileConcept,
  reconcileUnit,
  type ExistingConceptSummary,
  type ExistingUnitSummary,
  type ReconciliationClassifier,
  type UnitReconciliationClassifier,
  type UnitReconciliationResult,
} from "../src/features/course-graph-ingestion/reconciliation.ts";
```

In `extractCourseGraphTask`'s `run`, after fetching `artifact` (which needs one more selected column) and before the `openai.files.create` call, add:

```ts
// (change the artifact select to also fetch target_unit_id)
const { data: artifact, error: artifactError } = await supabase
  .from("artifacts")
  .select("owner_id, storage_path, original_filename, target_unit_id")
  .eq("id", payload.artifactId)
  .single();
```

Then, after `isOpenAiConfigured()` check and before building `content`, fetch existing units and resolve the hard-target:

```ts
const { data: existingUnitRows, error: existingUnitsError } = await supabase
  .from("course_units")
  .select("id, title")
  .eq("course_id", payload.courseId)
  .in("status", ["proposed", "confirmed"]);

if (existingUnitsError) {
  return markFailed(supabase, run.id, `Failed to load existing units: ${existingUnitsError.message}`);
}

let hardTargetUnit: { id: string; title: string } | null = null;
if (artifact.target_unit_id) {
  const { data: targetUnitRow, error: targetUnitError } = await supabase
    .from("course_units")
    .select("id, title, status")
    .eq("id", artifact.target_unit_id)
    .single();

  if (targetUnitError || !targetUnitRow || targetUnitRow.status === "archived") {
    return markFailed(supabase, run.id, `This artifact's target unit no longer exists or has been archived.`);
  }
  hardTargetUnit = { id: targetUnitRow.id, title: targetUnitRow.title };
}

const existingUnits: ExistingUnitSummary[] = (existingUnitRows ?? []).map((u) => ({ id: u.id, title: u.title }));
```

Update the `callExtractionModel` call site to use the built prompt:
```ts
rawResult = await callExtractionModel(openai, EXTRACTION_MODEL, [
  { type: "input_file", file_id: uploaded.id },
  { type: "input_text", text: buildExtractionPrompt(existingUnits, hardTargetUnit) },
]);
```

- [ ] **Step 3: Reorder `writeExtractionCandidates` to resolve units before concepts**

Update its signature to accept the extra context and change the concept-insertion loop to use resolved unit ids. Replace the whole function body's unit-handling section (the current hardcoded `unitId` lookup) as follows:

```ts
async function writeExtractionCandidates(
  supabase: ReturnType<typeof createAdminClient>,
  courseId: string,
  ownerId: string,
  extractionRunId: string,
  artifactId: string,
  extraction: ExtractionResult,
  classify: ReconciliationClassifier,
  classifyUnit: UnitReconciliationClassifier,
  existingUnits: ExistingUnitSummary[],
  hardTargetUnitId: string | null,
): Promise<{ conceptsExtracted: number; edgesExtracted: number; edgesDroppedSelfReferential: number }> {
  // -------------------------------------------------------------
  // Units resolve BEFORE concepts (design.md's write ordering) --
  // a concept whose candidate unit gets merged away must land under
  // the surviving real unit, never the one that got merged.
  // -------------------------------------------------------------
  const unitReconciliations = new Map<string, UnitReconciliationResult>();
  for (const unit of extraction.units) {
    const reconciliation = await reconcileUnit(classifyUnit, { title: unit.title }, existingUnits);
    unitReconciliations.set(unit.localId, reconciliation);

    const { error: decisionInsertError } = await supabase.from("reconciliation_decisions").insert({
      course_id: courseId,
      owner_id: ownerId,
      extraction_run_id: extractionRunId,
      candidate_kind: "unit",
      decision: reconciliation.decision,
      matched_concept_id: null,
      matched_unit_id: reconciliation.decision === "merge" ? reconciliation.matchedUnitId : null,
      reasoning: reconciliation.reasoning,
    });
    if (decisionInsertError) {
      throw new Error(`Failed to record unit reconciliation decision: ${decisionInsertError.message}`);
    }
  }

  const { unitLocalIdToRealId, toInsert: unitsToInsert } = resolveUnitReferences(extraction.units, unitReconciliations);

  for (const unit of unitsToInsert) {
    const { data: insertedUnit, error: unitInsertError } = await supabase
      .from("course_units")
      .insert({
        course_id: courseId,
        owner_id: ownerId,
        title: unit.title,
        status: "proposed",
        extraction_run_id: extractionRunId,
      })
      .select("id")
      .single();

    if (unitInsertError || !insertedUnit) {
      throw new Error(`Failed to insert unit "${unit.title}": ${unitInsertError?.message}`);
    }
    unitLocalIdToRealId.set(unit.localId, insertedUnit.id);
  }

  // Resolves a concept's unitRef to a real unit id. The hard target
  // (artifact.target_unit_id) wins unconditionally, even over
  // whatever the model actually returned -- defense in depth beyond
  // the prompt-level instruction (design.md).
  function resolveConceptUnitId(unitRef: ExtractionResult["concepts"][number]["unitRef"]): string {
    if (hardTargetUnitId) return hardTargetUnitId;
    if (unitRef.kind === "existing") return unitRef.unitId;
    const realId = unitLocalIdToRealId.get(unitRef.localId);
    if (!realId) {
      throw new Error(`Concept's unitRef.localId "${unitRef.localId}" did not resolve to a real unit id.`);
    }
    return realId;
  }

  // ... existing concept-reconciliation loop continues below, with
  // ONE change: replace the current `unit_id: unitId` (the old single
  // hardcoded unit) in the course_concepts insert with:
  //   unit_id: resolveConceptUnitId(concept.unitRef)
  // computed once per concept, right before that insert call.
```

Remove the old bootstrap check entirely — this block from the current code no longer applies and must be deleted:
```ts
  // DELETE this whole block (no longer needed -- units are now
  // extracted inline, never require a pre-existing one):
  const { data: units, error: unitsError } = await supabase
    .from("course_units")
    .select("id")
    .eq("course_id", courseId)
    .limit(1);

  if (unitsError) {
    throw new Error(`Failed to look up course_units for course ${courseId}: ${unitsError.message}`);
  }

  const unitId = units?.[0]?.id;
  if (!unitId) {
    throw new Error(
      `Course ${courseId} has no course_units yet -- create at least one unit before running extraction.`,
    );
  }
```

And in the concept-insert call further down, change:
```ts
      .insert({
        course_id: courseId,
        owner_id: ownerId,
        unit_id: unitId,
        canonical_name: concept.canonicalName,
```
to:
```ts
      .insert({
        course_id: courseId,
        owner_id: ownerId,
        unit_id: resolveConceptUnitId(concept.unitRef),
        canonical_name: concept.canonicalName,
```

- [ ] **Step 4: Update the call site inside `run`**

Change:
```ts
insertResult = await writeExtractionCandidates(
  supabase,
  payload.courseId,
  artifact.owner_id,
  run.id,
  payload.artifactId,
  extraction,
  classify,
);
```
to:
```ts
insertResult = await writeExtractionCandidates(
  supabase,
  payload.courseId,
  artifact.owner_id,
  run.id,
  payload.artifactId,
  extraction,
  classify,
  createOpenAiUnitReconciliationClassifier(openai, EXTRACTION_MODEL),
  existingUnits,
  hardTargetUnit?.id ?? null,
);
```

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS. Fix any remaining type mismatches (e.g. if `existingUnitRows`'s inferred type doesn't line up with `ExistingUnitSummary` exactly — add an explicit `.map` cast as shown above, already included).

- [ ] **Step 6: Run the full unit test suite**

Run: `npm run test:unit`
Expected: PASS, including Tasks 3–5's new tests and nothing regressed (the deleted bootstrap-check block has no direct unit test today, so nothing to update there).

- [ ] **Step 7: Commit**

```bash
git add src/features/course-graph-ingestion/openai-extraction-call.ts trigger/extract-course-graph.ts
git commit -m "feat(course-graph-ingestion): wire units into extraction (menu, hard override, write ordering)

Fixes the real bug where extraction threw for every course with no
pre-existing unit -- units are now extracted inline, same run as
concepts, with the model given the course's existing units as a menu
so a manually-created unit gets filled directly rather than relying
on post-hoc reconciliation to catch a duplicate."
```

---

### Task 7: Fix `getCourseGraph` to only include confirmed units

**Files:**
- Modify: `src/features/course-graph-ingestion/actions.ts`
- Test: `tests/unit/course-graph-ingestion/materialize-course-graph.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: no signature change — `getCourseGraph`'s query gains a status filter.

Units previously had no `status` column at all, so `getCourseGraph`'s
`course_units` query (`select("*").eq("course_id", courseId)`, no
status filter) returned every unit unconditionally. Now that units
have a lifecycle, a `"proposed"` or `"archived"` unit must not leak
into the confirmed Atlas graph — same reasoning `course_concepts`/
`concept_edges` already apply.

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/course-graph-ingestion/materialize-course-graph.test.ts` (check the existing file's fixture style first, then add):

```ts
test("materializeCourseGraph only ever receives units the caller already filtered to confirmed -- a concept referencing a unit not in the passed-in list still throws", () => {
  // materializeCourseGraph itself is unchanged (Task's real fix is in
  // actions.ts's query, not this pure function) -- this test just
  // documents/locks the existing invariant that a concept's unit_id
  // must resolve within whatever unit list was passed in, since
  // that's what makes the actions.ts filter change actually matter.
  assert.throws(() =>
    materializeCourseGraph(
      [], // no units passed in, e.g. because the real query now correctly excludes a "proposed" one
      [
        {
          id: "c1",
          course_id: "course-1",
          owner_id: "owner-1",
          unit_id: "proposed-unit-not-in-list",
          canonical_name: "X",
          aliases: [],
          description: "...",
          importance_score: 0.5,
          source_anchors: [{ artifactId: "a1", locator: "p1", excerpt: "..." }],
          status: "confirmed",
          confidence: 0.5,
          extraction_run_id: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ],
      [],
    ),
  );
});
```

(If the existing test file already has a helper for building a `CourseConceptRow` fixture, use that helper instead of the inline object literal above — check the file first and match its existing style rather than introducing a second fixture-building convention.)

- [ ] **Step 2: Run test to verify it fails or already passes**

Run: `node --test tests/unit/course-graph-ingestion/materialize-course-graph.test.ts`
Expected: this specific test should already PASS today (it's documenting existing `materializeCourseGraph` behavior, not new behavior) — confirming the pure function's invariant is already correct, so the real fix needed is purely in `actions.ts`'s query. If it unexpectedly fails, stop and investigate before continuing (that would mean the existing invariant doesn't hold, a bigger problem than this task).

- [ ] **Step 3: Fix the real query in `actions.ts`**

In `src/features/course-graph-ingestion/actions.ts`, find `getCourseGraph`:
```ts
export async function getCourseGraph(courseId: string): Promise<CourseGraph> {
  const supabase = await createClient();

  const [unitsRes, conceptsRes, edgesRes] = await Promise.all([
    supabase.from("course_units").select("*").eq("course_id", courseId),
    supabase.from("course_concepts").select("*").eq("course_id", courseId).eq("status", "confirmed"),
    supabase.from("concept_edges").select("*").eq("course_id", courseId).eq("status", "confirmed"),
  ]);
```
Change the first query to:
```ts
    supabase.from("course_units").select("*").eq("course_id", courseId).eq("status", "confirmed"),
```

- [ ] **Step 4: Also check `getCourseGraphForLearner`**

Run: `grep -n "course_units" src/features/learner-graph-evidence/actions.ts`

If it has its own separate `course_units` query (it materializes a learner-scoped graph, per the Atlas page's use of it — check whether it queries `course_units` directly or calls the same `materializeCourseGraph`/reuses `getCourseGraph`'s data), apply the identical `.eq("status", "confirmed")` fix there too if it has its own independent query. If it delegates to `getCourseGraph` or `materializeCourseGraph` directly without its own separate units query, no further change is needed there.

- [ ] **Step 5: Run typecheck and the full unit suite**

Run: `npm run typecheck && npm run test:unit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/course-graph-ingestion/actions.ts tests/unit/course-graph-ingestion/materialize-course-graph.test.ts
git commit -m "fix(course-graph-ingestion): exclude non-confirmed units from the rendered Atlas graph"
```

---

### Task 8: Extend the review-queue actions to cover unit candidates

**Files:**
- Modify: `src/features/course-graph-ingestion/actions.ts`

**Interfaces:**
- Produces: `ReviewQueueItem` gains a `{ kind: "unit"; unit: CourseUnit; reconciliation: ReconciliationDecision | null; otherExistingUnitTitles: string[] }` variant (the `otherExistingUnitTitles` field is the agreed mitigation — populated only for `"distinct"` decisions, empty otherwise). `confirmCandidate`/`rejectCandidate`/`editCandidate` accept `"unit"` as a valid `kind`.
- Consumes: `CourseUnitRow` (Task 2).

First, check whether a `CourseUnit` domain type already exists:

Run: `grep -rn "CourseUnit\b" src/types/domain/`

If none exists, add one to whichever file `src/types/domain/index.ts` re-exports from (follow the existing pattern next to `CourseConcept` — check `src/types/domain/concept.ts` or equivalent for where `CourseConcept` itself lives, and add a small parallel `CourseUnit` type there: `{ id: string; courseId: string; title: string; status: OntologyStatus; confidence?: never }` — actually keep it minimal, matching what `course_units` really has: `{ id: string; courseId: string; title: string; status: OntologyStatus }`).

- [ ] **Step 1: Add the `CourseUnit` domain type**

In the file where `CourseConcept` is defined (find via the grep above), add:
```ts
export type CourseUnit = {
  id: string;
  courseId: string;
  title: string;
  status: OntologyStatus;
};
```
Export it from `src/types/domain/index.ts` alongside the existing exports (match the existing export style in that file).

- [ ] **Step 2: Update `ReviewQueueItem` and add unit row-mapping**

In `src/features/course-graph-ingestion/actions.ts`, add after `edgeRowToDomain`:
```ts
function unitRowToDomain(row: CourseUnitRow): CourseUnit {
  return { id: row.id, courseId: row.course_id, title: row.title, status: row.status };
}
```

Add the import: `import type { CourseUnit } from "@/types/domain/index.ts";` and `import type { CourseUnitRow } from "@/lib/supabase/database.types.ts";` (add to the existing `database.types.ts` import list rather than a second import line).

Update `ReviewQueueItem`:
```ts
export type ReviewQueueItem =
  | { kind: "concept"; concept: CourseConcept; reconciliation: ReconciliationDecision | null; flags: ConceptFlag[] }
  | { kind: "edge"; edge: ConceptEdge; reconciliation: ReconciliationDecision | null; flags: ConceptFlag[] }
  | {
      kind: "unit";
      unit: CourseUnit;
      reconciliation: ReconciliationDecision | null;
      /** Populated only when reconciliation.decision === "distinct" --
       * the agreed mitigation (design.md) for the residual
       * confidently-wrong-distinct risk: gives the reviewer the same
       * existing-units context reconciliation itself had, since a
       * "distinct" decision otherwise shows no comparison at all. */
      otherExistingUnitTitles: string[];
    };
```

Update `ReconciliationDecision` to include the unit match field:
```ts
export type ReconciliationDecision = {
  decision: "merge" | "distinct" | "uncertain";
  matchedConceptId: string | null;
  matchedUnitId: string | null;
  reasoning: string;
};
```
Update `toReconciliationDecision`:
```ts
function toReconciliationDecision(row: ReconciliationDecisionRow | undefined): ReconciliationDecision | null {
  if (!row) return null;
  return {
    decision: row.decision,
    matchedConceptId: row.matched_concept_id,
    matchedUnitId: row.matched_unit_id,
    reasoning: row.reasoning,
  };
}
```

- [ ] **Step 3: Update `getReviewQueue` to also fetch and include unit candidates**

Add a `unitsRes` query alongside the existing ones and build `unitItems`:
```ts
export async function getReviewQueue(courseId: string): Promise<ReviewQueueItem[]> {
  const supabase = await createClient();

  const [conceptsRes, edgesRes, unitsRes, decisionsRes, flagsRes] = await Promise.all([
    supabase.from("course_concepts").select("*").eq("course_id", courseId).eq("status", "proposed"),
    supabase.from("concept_edges").select("*").eq("course_id", courseId).eq("status", "proposed"),
    supabase.from("course_units").select("*").eq("course_id", courseId).eq("status", "proposed"),
    supabase.from("reconciliation_decisions").select("*").eq("course_id", courseId),
    supabase.from("concept_flags").select("*").eq("course_id", courseId),
  ]);

  const concepts = conceptsRes.data ?? [];
  const edges = edgesRes.data ?? [];
  const proposedUnits = unitsRes.data ?? [];
  const decisions = decisionsRes.data ?? [];
  const flags = flagsRes.data ?? [];

  // Every already-confirmed unit's title -- used for the "distinct"
  // mitigation below, so it needs status='confirmed', a separate
  // query from the 'proposed' one above (different filter).
  const { data: confirmedUnitRows } = await supabase
    .from("course_units")
    .select("title")
    .eq("course_id", courseId)
    .eq("status", "confirmed");
  const confirmedUnitTitles = (confirmedUnitRows ?? []).map((u) => u.title);
```

(keep the existing `decisionsByExtractionRun`/`flagsByTarget` map-building code unchanged, then add after `edgeItems`:)

```ts
  const unitItems: ReviewQueueItem[] = proposedUnits.map((row) => {
    const runDecisions = row.extraction_run_id ? decisionsByExtractionRun.get(row.extraction_run_id) ?? [] : [];
    const matchingDecision = runDecisions.find((d) => d.candidate_kind === "unit" && d.decision !== "merge");
    const reconciliation = toReconciliationDecision(matchingDecision);
    return {
      kind: "unit",
      unit: unitRowToDomain(row),
      reconciliation,
      otherExistingUnitTitles: reconciliation?.decision === "distinct" ? confirmedUnitTitles : [],
    };
  });

  return sortReviewQueueByPriority([...conceptItems, ...edgeItems, ...unitItems]);
```

- [ ] **Step 4: Check `sortReviewQueueByPriority` handles the new variant**

Run: `grep -n "kind ===" src/features/course-graph-ingestion/review-queue-priority.ts`

If it exhaustively switches on `item.kind` (likely, given the existing `"concept"|"edge"` union), add a branch for `"unit"` — check the file's existing priority logic first and give units a sensible priority (e.g. treat them the same as `"concept"` for ordering purposes, since both represent a similar review weight) rather than leaving a `case` that TypeScript would flag as non-exhaustive.

- [ ] **Step 5: Update `confirmCandidate`/`rejectCandidate`/`editCandidate` to accept `"unit"`**

Change every `kind: "concept" | "edge"` parameter type in these three functions to `kind: "concept" | "edge" | "unit"`, and every `table = kind === "concept" ? "course_concepts" : "concept_edges"` ternary to a proper lookup:
```ts
const TABLE_BY_KIND = {
  concept: "course_concepts",
  edge: "concept_edges",
  unit: "course_units",
} as const;
```
Replace each `const table = kind === "concept" ? "course_concepts" : "concept_edges";` with `const table = TABLE_BY_KIND[kind];`.

For `editCandidate`, add a third overload:
```ts
export type UnitEdit = Partial<Pick<CourseUnit, "title">>;

export async function editCandidate(
  kind: "unit",
  id: string,
  edits: UnitEdit,
): Promise<{ error: string | null }>;
```
And in the implementation body, add a branch mirroring the `"concept"` branch but for `course_units` (fetch existing row, merge `title`, validate non-empty trimmed, update). Keep it minimal — a unit only has `title` to edit, no `isCourseUnit` validator needed beyond a non-empty check:
```ts
if (kind === "unit") {
  const { data: existing, error: fetchError } = await supabase
    .from("course_units")
    .select("title")
    .eq("id", id)
    .single();
  if (fetchError || !existing) {
    return { error: `No unit found with id "${id}".` };
  }
  const unitEdits = edits as UnitEdit;
  const newTitle = (unitEdits.title ?? existing.title).trim();
  if (newTitle.length === 0) {
    return { error: "Unit title cannot be empty." };
  }
  const { error } = await supabase
    .from("course_units")
    .update({ title: newTitle })
    .eq("id", id);
  return { error: error?.message ?? null };
}
```
(Place this branch before the existing `if (kind === "concept")` check, and update the function's runtime parameter type to accept `"concept" | "edge" | "unit"` accordingly, matching the new overloads.)

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: PASS. Fix any call sites of `confirmCandidate`/`rejectCandidate`/`editCandidate` that assumed only two kinds existed (there shouldn't be any that break, since adding a union member is additive, but `ReviewQueue.tsx`'s own exhaustive `item.kind === "concept" ? ... : ...` ternary — Task 9 — will need updating; that's covered there, not here).

- [ ] **Step 7: Commit**

```bash
git add src/features/course-graph-ingestion/actions.ts src/types/domain/ src/features/course-graph-ingestion/review-queue-priority.ts
git commit -m "feat(course-graph-ingestion): extend review-queue actions to cover unit candidates"
```

---

### Task 9: Update `ReviewQueue.tsx` for unit candidate cards + the distinct-mitigation display

**Files:**
- Modify: `src/features/course-graph-ingestion/components/ReviewQueue.tsx`

**Interfaces:**
- Consumes: `ReviewQueueItem`'s `"unit"` variant (Task 8), `editCandidate("unit", ...)` (Task 8).

- [ ] **Step 1: Update `itemId` to handle the unit case**

Find:
```ts
function itemId(item: ReviewQueueItem): string {
  return item.kind === "concept" ? item.concept.id : item.edge.id;
}
```
Replace with:
```ts
function itemId(item: ReviewQueueItem): string {
  if (item.kind === "concept") return item.concept.id;
  if (item.kind === "edge") return item.edge.id;
  return item.unit.id;
}
```

- [ ] **Step 2: Add the unit card's title/body rendering branch**

Find the ternary rendering the card title/body:
```tsx
{item.kind === "concept" ? (
  <>
    <h3 style={s.cardTitle}>{item.concept.canonicalName}</h3>
    ...
  </>
) : (
  <>
    <h3 style={s.cardTitle}>{item.edge.relationType}</h3>
    <p style={s.description}>{item.edge.explanation}</p>
  </>
)}
```
Change the outer conditional to a three-way branch:
```tsx
{item.kind === "concept" ? (
  <>
    <h3 style={s.cardTitle}>{item.concept.canonicalName}</h3>
    {item.concept.aliases.length > 0 && (
      <p style={s.aliases}>Also known as: {item.concept.aliases.join(", ")}</p>
    )}
    <p style={s.description}>{item.concept.description}</p>
  </>
) : item.kind === "edge" ? (
  <>
    <h3 style={s.cardTitle}>{item.edge.relationType}</h3>
    <p style={s.description}>{item.edge.explanation}</p>
  </>
) : (
  <>
    <h3 style={s.cardTitle}>{item.unit.title}</h3>
    <p style={s.description}>Unit (topic grouping)</p>
    {item.otherExistingUnitTitles.length > 0 && (
      <p style={s.aliases}>
        This course's other existing units: {item.otherExistingUnitTitles.join(", ")}
      </p>
    )}
  </>
)}
```
(Match this exactly against the file's current real JSX before editing — the plan captures the shape as of this session's earlier restyle; the aliases/description block for `"concept"` should already be present verbatim, only the outer conditional and the new unit branch are additions.)

- [ ] **Step 3: Update the edit-form branch**

Find the `isEditing` form's inner conditional (currently `item.kind === "concept" ? <input.../><textarea.../> : <select.../><textarea.../>`) and add a unit branch:
```tsx
{item.kind === "concept" ? (
  <>
    <input name="canonicalName" defaultValue={item.concept.canonicalName} style={s.input} />
    <textarea name="description" defaultValue={item.concept.description} style={s.textarea} />
  </>
) : item.kind === "edge" ? (
  <>
    <select name="relationType" defaultValue={item.edge.relationType} style={s.input}>
      {STANDARD_RELATION_TYPES.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
    <textarea name="explanation" defaultValue={item.edge.explanation} style={s.textarea} />
  </>
) : (
  <input name="title" defaultValue={item.unit.title} style={s.input} />
)}
```

Update `handleSaveEdit` to build the right edits object per kind:
```ts
async function handleSaveEdit(item: ReviewQueueItem, form: FormData) {
  const id = itemId(item);
  setPendingId(id);

  const { error } =
    item.kind === "concept"
      ? await editCandidate("concept", id, {
          canonicalName: String(form.get("canonicalName") ?? ""),
          description: String(form.get("description") ?? ""),
        })
      : item.kind === "edge"
        ? await editCandidate("edge", id, {
            relationType: String(form.get("relationType") ?? "") as (typeof STANDARD_RELATION_TYPES)[number],
            explanation: String(form.get("explanation") ?? ""),
          })
        : await editCandidate("unit", id, { title: String(form.get("title") ?? "") });

  setPendingId(null);
  if (error) {
    setErrorById((e) => ({ ...e, [id]: error }));
    return;
  }
  setErrorById((e) => {
    const { [id]: _removed, ...rest } = e;
    return rest;
  });
  setEditingId(null);
  setItems((current) =>
    current.map((i) => {
      if (itemId(i) !== id) return i;
      if (i.kind === "concept") {
        return {
          ...i,
          concept: {
            ...i.concept,
            canonicalName: String(form.get("canonicalName") ?? i.concept.canonicalName),
            description: String(form.get("description") ?? i.concept.description),
          },
        };
      }
      if (i.kind === "edge") {
        return {
          ...i,
          edge: {
            ...i.edge,
            relationType: String(form.get("relationType") ?? i.edge.relationType) as typeof i.edge.relationType,
            explanation: String(form.get("explanation") ?? i.edge.explanation),
          },
        };
      }
      return { ...i, unit: { ...i.unit, title: String(form.get("title") ?? i.unit.title) } };
    }),
  );
}
```

Also update the `handleConfirm`/`handleReject` calls' first argument type — they currently call `confirmCandidate(item.kind, id)`/`rejectCandidate(item.kind, id)` where `item.kind` was `"concept" | "edge"`; since `ReviewQueueItem.kind` now includes `"unit"` and `confirmCandidate`/`rejectCandidate` were widened in Task 8 to accept it, no code change is needed here — only re-run typecheck to confirm.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/course-graph-ingestion/components/ReviewQueue.tsx
git commit -m "feat(frontend): add unit candidate cards + distinct-mitigation display to ReviewQueue"
```

---

### Task 10: Manual "add a unit" action + minimal UI on the Materials page

**Files:**
- Modify: `src/features/course-graph-ingestion/actions.ts`
- Create: `src/features/course-graph-ingestion/components/AddUnitForm.tsx`
- Modify: `src/app/(app)/courses/[courseId]/page.tsx`

**Interfaces:**
- Produces: `createUnit(courseId: string, title: string): Promise<{ unit: CourseUnit } | { error: string }>`.
- Consumes: `CourseUnit` (Task 8).

- [ ] **Step 1: Add `createUnit` to `actions.ts`**

```ts
export async function createUnit(
  courseId: string,
  title: string,
): Promise<{ unit: CourseUnit } | { error: string }> {
  const trimmedTitle = title.trim();
  if (trimmedTitle.length === 0) {
    return { error: "Unit title cannot be empty." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to create a unit." };
  }

  // Manually-created units are authoritative immediately (design.md) --
  // status 'confirmed', no extraction_run_id, same as any other
  // owner-authored row this codebase has (courses/actions.ts's
  // createCourse).
  const { data, error } = await supabase
    .from("course_units")
    .insert({ course_id: courseId, owner_id: user.id, title: trimmedTitle, status: "confirmed", extraction_run_id: null })
    .select("id, course_id, title, status")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Failed to create unit." };
  }

  return { unit: { id: data.id, courseId: data.course_id, title: data.title, status: data.status } };
}
```

- [ ] **Step 2: Create `AddUnitForm.tsx`**

Match `CreateCourseForm.tsx`'s exact pattern (client component, own pending/error state, no page reload needed — just append to a local list via a callback prop):

```tsx
"use client";

import { useState } from "react";
import type { CourseUnit } from "@/types/domain/index.ts";

export function AddUnitForm({
  courseId,
  createUnit,
  onCreated,
}: {
  courseId: string;
  createUnit: (courseId: string, title: string) => Promise<{ unit: CourseUnit } | { error: string }>;
  onCreated: (unit: CourseUnit) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const title = (new FormData(e.currentTarget).get("title") as string | null) ?? "";
        setPending(true);
        const outcome = await createUnit(courseId, title);
        setPending(false);
        if ("error" in outcome) {
          setError(outcome.error);
          return;
        }
        setError(null);
        (e.currentTarget as HTMLFormElement).reset();
        onCreated(outcome.unit);
      }}
      style={s.form}
    >
      <div style={s.row}>
        <input
          type="text"
          name="title"
          required
          placeholder="Unit title, e.g. Dynamic Programming"
          style={s.input}
          disabled={pending}
        />
        <button type="submit" disabled={pending} style={{ ...s.submit, opacity: pending ? 0.6 : 1 }}>
          {pending ? "Adding…" : "Add unit"}
        </button>
      </div>
      {error && <p style={s.error}>{error}</p>}
    </form>
  );
}

const s: Record<string, React.CSSProperties> = {
  form: { display: "flex", flexDirection: "column", gap: 8 },
  row: { display: "flex", gap: 8 },
  input: {
    flex: 1,
    padding: "9px 12px",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    fontSize: 14,
    fontFamily: "var(--font-sans)",
    color: "var(--text-primary)",
    background: "var(--bg)",
    outline: "none",
  },
  submit: {
    padding: "9px 16px",
    background: "var(--clay)",
    color: "var(--clay-fg)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    fontSize: 13.5,
    fontWeight: 500,
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  error: { margin: 0, fontSize: 12.5, color: "var(--clay)" },
};
```

- [ ] **Step 3: Wire it into the Materials page**

The Materials page (`src/app/(app)/courses/[courseId]/page.tsx`) is currently a Server Component with no client-side list state for units. Since `AddUnitForm` needs to notify something when a unit is created (so the picker in Task 11 can immediately offer it without a full page reload), wrap both the form and the future picker in one small client component. For this task alone (Task 11 adds the picker), create a minimal client wrapper:

Add to `src/app/(app)/courses/[courseId]/page.tsx`, after the artifact-list section and before the Pending Review section:

```tsx
import { createUnit } from "@/features/course-graph-ingestion/actions.ts";
import { AddUnitForm } from "@/features/course-graph-ingestion/components/AddUnitForm.tsx";
```

And in the JSX, add a new section:
```tsx
<div style={s.section}>
  <h2 style={s.subsectionTitle}>Units</h2>
  <p style={s.sectionDesc}>
    Add a unit to make sure future uploads about it land here directly, instead of relying on
    extraction to invent and later merge a duplicate.
  </p>
  <AddUnitForm courseId={courseId} createUnit={createUnit} onCreated={() => {}} />
</div>
```

(The `onCreated` callback is a no-op for now — Task 11 replaces this whole block with a client component that keeps the created unit in local state for the upload picker to use immediately.)

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Live-verify**

Start the app (`npm run dev`), sign in, go to a course's Materials tab, submit "Add unit" with a real title. Confirm via Supabase SQL editor:
```sql
select title, status from public.course_units where course_id = '<your course id>' order by created_at desc limit 1;
```
Expected: the new row, `status = 'confirmed'`.

- [ ] **Step 6: Commit**

```bash
git add src/features/course-graph-ingestion/actions.ts src/features/course-graph-ingestion/components/AddUnitForm.tsx "src/app/(app)/courses/[courseId]/page.tsx"
git commit -m "feat(course-graph-ingestion): add manual 'add a unit' action + minimal form"
```

---

### Task 11: Upload-time unit picker (`target_unit_id`) + `uploadArtifact` plumbing

**Files:**
- Modify: `src/features/artifacts/actions.ts`
- Modify: `src/features/artifacts/artifact-board.tsx`
- Modify: `src/app/(app)/courses/[courseId]/page.tsx`

**Interfaces:**
- Consumes: `CourseUnit` (Task 8), `createUnit` (Task 10).
- Produces: `uploadArtifact`'s `UploadedFile` gains optional `targetUnitId?: string`; `ArtifactBoard` accepts a `units: CourseUnit[]` prop and a picker in its upload form.

- [ ] **Step 1: Update `uploadArtifact` to accept and store `target_unit_id`**

In `src/features/artifacts/actions.ts`, change `UploadedFile`:
```ts
export type UploadedFile = {
  storagePath: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  targetUnitId?: string;
};
```
In the insert call inside `uploadArtifact`, add:
```ts
    .insert({
      course_id: courseId,
      owner_id: user.id,
      storage_path: file.storagePath,
      original_filename: file.originalFilename,
      mime_type: file.mimeType,
      size_bytes: file.sizeBytes,
      status: "queued",
      target_unit_id: file.targetUnitId ?? null,
    })
```

- [ ] **Step 2: Pass the course's units into `ArtifactBoard` and add the picker**

`ArtifactBoard` needs the course's units to populate a `<select>`. Update its props:
```tsx
export function ArtifactBoard({
  courseId,
  initialArtifacts,
  units,
}: {
  courseId: string;
  initialArtifacts: Artifact[];
  units: CourseUnit[];
}) {
```
Add the import: `import type { CourseUnit } from "@/types/domain/index.ts";`

Add a `targetUnitId` state and a `<select>` inside the dropzone form, right after the hidden file input:
```tsx
const [targetUnitId, setTargetUnitId] = useState<string>("");
```
And in the JSX, inside the `<label style={{...s.dropzone...}}>` block, after the hidden `<input type="file">`:
```tsx
{units.length > 0 && (
  <select
    value={targetUnitId}
    onChange={(e) => setTargetUnitId(e.target.value)}
    onClick={(e) => e.stopPropagation()}
    style={s.unitSelect}
  >
    <option value="">No specific unit</option>
    {units.map((u) => (
      <option key={u.id} value={u.id}>
        {u.title}
      </option>
    ))}
  </select>
)}
```
Add `unitSelect` to the style object:
```ts
unitSelect: {
  marginTop: 8,
  padding: "6px 10px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  fontSize: 12.5,
  fontFamily: "var(--font-sans)",
  background: "var(--surface)",
  color: "var(--text-primary)",
},
```

Update `handleUpload` to pass `targetUnitId` through:
```ts
const result = await uploadArtifact(courseId, {
  storagePath,
  originalFilename: file.name,
  mimeType: file.type,
  sizeBytes: file.size,
  targetUnitId: targetUnitId || undefined,
});
```

- [ ] **Step 3: Fetch units on the Materials page and pass them down; replace Task 10's no-op wiring**

Update `src/app/(app)/courses/[courseId]/page.tsx`: fetch the course's non-archived units (for both the Add-Unit list-refresh and the picker) via a small inline query, or add a `listUnits(courseId)` action. Prefer adding the action (matches this codebase's "one action per read" convention):

In `src/features/course-graph-ingestion/actions.ts`, add:
```ts
export async function listUnits(courseId: string): Promise<CourseUnit[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("course_units")
    .select("id, course_id, title, status")
    .eq("course_id", courseId)
    .neq("status", "archived")
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return data.map((row) => ({ id: row.id, courseId: row.course_id, title: row.title, status: row.status }));
}
```

In the Materials page, fetch units alongside artifacts and pending items, and pass to both `ArtifactBoard` and replace the Task 10 `AddUnitForm` block with a small client wrapper that keeps newly-added units visible immediately without a full reload:

```tsx
const [artifacts, pendingItems, units] = await Promise.all([
  listArtifacts(courseId),
  getReviewQueue(courseId),
  listUnits(courseId),
]);
```

```tsx
<ArtifactBoard courseId={courseId} initialArtifacts={artifacts} units={units} />
```

For the "new unit appears in the picker immediately" requirement, create one small client component wrapping both the form and the artifact board's unit list — simplest correct approach: make the Materials page's units section a client component that holds `units` in state, seeded from the server-fetched list, and passes both the up-to-date list and an `onCreated` handler that appends to it:

Create `src/features/course-graph-ingestion/components/UnitsSection.tsx`:
```tsx
"use client";

import { useState } from "react";
import type { CourseUnit } from "@/types/domain/index.ts";
import { createUnit } from "@/features/course-graph-ingestion/actions.ts";
import { AddUnitForm } from "@/features/course-graph-ingestion/components/AddUnitForm.tsx";

export function UnitsSection({
  courseId,
  initialUnits,
  children,
}: {
  courseId: string;
  initialUnits: CourseUnit[];
  children: (units: CourseUnit[]) => React.ReactNode;
}) {
  const [units, setUnits] = useState(initialUnits);

  return (
    <>
      {children(units)}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
          Units
        </h2>
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.55 }}>
          Add a unit to make sure future uploads about it land here directly, instead of relying on
          extraction to invent and later merge a duplicate.
        </p>
        <AddUnitForm courseId={courseId} createUnit={createUnit} onCreated={(u) => setUnits((cur) => [...cur, u])} />
      </div>
    </>
  );
}
```

Update the Materials page to use it, wrapping `ArtifactBoard`:
```tsx
<UnitsSection courseId={courseId} initialUnits={units}>
  {(liveUnits) => <ArtifactBoard courseId={courseId} initialArtifacts={artifacts} units={liveUnits} />}
</UnitsSection>
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Live-verify**

Upload a file, pick a unit from the dropdown, submit. Confirm via Supabase SQL editor:
```sql
select original_filename, target_unit_id from public.artifacts order by created_at desc limit 1;
```
Expected: `target_unit_id` matches the picked unit's real id.

- [ ] **Step 6: Commit**

```bash
git add src/features/artifacts/actions.ts src/features/artifacts/artifact-board.tsx src/features/course-graph-ingestion/actions.ts src/features/course-graph-ingestion/components/UnitsSection.tsx "src/app/(app)/courses/[courseId]/page.tsx"
git commit -m "feat(frontend): upload-time unit picker, wired to target_unit_id hard rule"
```

---

### Task 12: Surface real `extraction_runs` status on the Materials page

**Files:**
- Create: `src/features/course-graph-ingestion/extraction-status.ts`
- Create: `src/features/course-graph-ingestion/components/ExtractionStatusList.tsx`
- Modify: `src/app/(app)/courses/[courseId]/page.tsx`

**Interfaces:**
- Produces: `getExtractionStatuses(courseId: string): Promise<ExtractionStatusView[]>` where `ExtractionStatusView = { artifactId: string; artifactFilename: string; status: "queued"|"processing"|"completed"|"failed"; failureReason: string | null; conceptsExtracted: number; unitsCreatedOrMatched: number }`.

This closes the separately-identified gap: today a real `extraction_runs` failure is invisible anywhere in the UI, indistinguishable from "still queued."

- [ ] **Step 1: Add `getExtractionStatuses`**

```ts
"use server";

import { createClient } from "@/lib/supabase/server.ts";

export type ExtractionStatusView = {
  artifactId: string;
  artifactFilename: string;
  status: "queued" | "processing" | "completed" | "failed";
  failureReason: string | null;
  conceptsExtracted: number;
};

/**
 * The latest extraction_runs row per artifact, joined with the
 * artifact's own filename for display. An artifact with no
 * extraction_runs row at all (upload still queued/processing at the
 * artifacts-table level, extraction hasn't started yet) is simply
 * absent from this list -- not fabricated as a fake "queued" status,
 * since there's no real row to report on yet.
 */
export async function getExtractionStatuses(courseId: string): Promise<ExtractionStatusView[]> {
  const supabase = await createClient();

  const { data: runs, error } = await supabase
    .from("extraction_runs")
    .select("artifact_id, status, failure_reason, concepts_extracted, created_at")
    .eq("course_id", courseId)
    .order("created_at", { ascending: false });

  if (error || !runs || runs.length === 0) return [];

  const latestByArtifact = new Map<string, (typeof runs)[number]>();
  for (const run of runs) {
    if (!latestByArtifact.has(run.artifact_id)) {
      latestByArtifact.set(run.artifact_id, run);
    }
  }

  const artifactIds = [...latestByArtifact.keys()];
  const { data: artifacts } = await supabase
    .from("artifacts")
    .select("id, original_filename")
    .in("id", artifactIds);

  const filenameByArtifactId = new Map((artifacts ?? []).map((a) => [a.id, a.original_filename]));

  return [...latestByArtifact.entries()].map(([artifactId, run]) => ({
    artifactId,
    artifactFilename: filenameByArtifactId.get(artifactId) ?? artifactId,
    status: run.status,
    failureReason: run.failure_reason,
    conceptsExtracted: run.concepts_extracted,
  }));
}
```

- [ ] **Step 2: Create the display component**

```tsx
import type { ExtractionStatusView } from "@/features/course-graph-ingestion/extraction-status.ts";

const STATUS_COLOR: Record<ExtractionStatusView["status"], { bg: string; color: string }> = {
  completed: { bg: "var(--teal-muted)", color: "var(--teal)" },
  processing: { bg: "var(--denim-muted)", color: "var(--denim)" },
  queued: { bg: "var(--border)", color: "var(--text-tertiary)" },
  failed: { bg: "var(--clay-muted)", color: "var(--clay)" },
};

export function ExtractionStatusList({ statuses }: { statuses: ExtractionStatusView[] }) {
  if (statuses.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
        Extraction status
      </h2>
      {statuses.map((s) => (
        <div
          key={s.artifactId}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 14px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <span style={{ flex: 1, fontSize: 13.5, color: "var(--text-primary)" }}>{s.artifactFilename}</span>
          {s.status === "completed" && (
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{s.conceptsExtracted} concepts</span>
          )}
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 500,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              padding: "2px 8px",
              borderRadius: 20,
              background: STATUS_COLOR[s.status].bg,
              color: STATUS_COLOR[s.status].color,
            }}
          >
            {s.status}
          </span>
        </div>
      ))}
      {statuses.some((s) => s.status === "failed") && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {statuses
            .filter((s) => s.status === "failed")
            .map((s) => (
              <p key={s.artifactId} style={{ margin: 0, fontSize: 12, color: "var(--clay)" }}>
                {s.artifactFilename}: {s.failureReason}
              </p>
            ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire into the Materials page**

```tsx
import { getExtractionStatuses } from "@/features/course-graph-ingestion/extraction-status.ts";
import { ExtractionStatusList } from "@/features/course-graph-ingestion/components/ExtractionStatusList.tsx";
```
Fetch alongside the other three:
```tsx
const [artifacts, pendingItems, units, extractionStatuses] = await Promise.all([
  listArtifacts(courseId),
  getReviewQueue(courseId),
  listUnits(courseId),
  getExtractionStatuses(courseId),
]);
```
Render it in the page body, after the artifact list:
```tsx
<ExtractionStatusList statuses={extractionStatuses} />
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Live-verify**

After uploading a file and letting the Trigger.dev dev worker process it (`npx trigger.dev@latest dev` running), reload the Materials page. Expected: a row showing either `COMPLETED` with a concept count, or `FAILED` with the real failure reason visible — not silently absent or indistinguishable from queued.

- [ ] **Step 6: Commit**

```bash
git add src/features/course-graph-ingestion/extraction-status.ts src/features/course-graph-ingestion/components/ExtractionStatusList.tsx "src/app/(app)/courses/[courseId]/page.tsx"
git commit -m "feat(frontend): surface real extraction_runs status on Materials page

Closes a separately-identified gap: an extraction_runs failure had no
UI surface at all, indistinguishable from still-queued."
```

---

### Task 13: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `npm run typecheck`
Expected: PASS, zero errors.

- [ ] **Step 2: Full unit test suite**

Run: `npm run test:unit`
Expected: PASS, including every test added in Tasks 3–5, no regressions in the pre-existing 257.

- [ ] **Step 3: Live walkthrough — brand-new course bootstrap**

With the real Trigger.dev dev worker running (`npx trigger.dev@latest dev`) and the Next dev server running:
1. Create a new course with zero units.
2. Upload a real PDF/image with clear topical content, no unit tag.
3. Wait for `Extraction status` to show `COMPLETED`.
4. Confirm: Pending Review shows both unit and concept candidates; confirming the unit first, then its concepts, makes them appear in the Atlas.

- [ ] **Step 4: Live walkthrough — existing-unit menu match**

1. In the same course, upload a second file clearly about the same unit already confirmed in Step 3.
2. Confirm: no duplicate unit candidate appears in Pending Review; the new file's concepts attach directly to the existing confirmed unit (check via `select unit_id from course_concepts where ...` matches the existing unit's id, or visually in the Atlas once concepts are confirmed).

- [ ] **Step 5: Live walkthrough — manually-created empty unit gets filled**

1. Use "Add a unit" to create an empty unit for a topic not yet covered.
2. Upload a file about that exact topic, untagged.
3. Confirm: the new concepts attach to the manually-created unit directly (no new unit candidate for that topic appears in Pending Review).

- [ ] **Step 6: Live walkthrough — hard-rule tagged upload**

1. Upload a file, explicitly tagging it to an existing unit via the picker, where the file's content could plausibly suggest a different topic.
2. Confirm: every extracted concept attaches to the tagged unit regardless (check `unit_id` on the resulting `course_concepts` rows).

- [ ] **Step 7: Live walkthrough — distinct-mitigation display**

Find or construct a case where a unit candidate reconciles as `"distinct"` with at least one other confirmed unit already existing in the course. Confirm Pending Review's unit card shows "This course's other existing units: ...".

- [ ] **Step 8: Final commit if any fixes were needed during verification**

If any live-walkthrough step surfaced a real bug, fix it, re-run the relevant unit tests + typecheck, and commit the fix separately with a clear message describing what was found and fixed (matching this repo's own established convention of documenting real bugs found live, not silently folding fixes into an earlier commit).
