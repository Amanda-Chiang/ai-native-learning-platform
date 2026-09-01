# Quickstart: Course Graph Ingestion

Unlike `concept-atlas-renderer`, most of this feature's *value* is only
verifiable with a live `OPENAI_API_KEY` and Supabase project (extraction
is the whole point). What's independently verifiable without either is the
pure reconciliation/materialization logic and the extraction-schema
validation.

## Group A — verifiable now, no external accounts needed

### A1. Typecheck

```bash
nvm use 24
npm run typecheck
```

**Expected outcome**: exits 0.

### A2. Pure logic: reconciliation, materialization, extraction-schema validation

```bash
npm run test:unit
```

**Expected outcome**: passes, including new tests confirming:
`materializeCourseGraph` produces baseline `masteryState: "unverified"`/
`learnerState: "strong"` for every concept/edge (never a fabricated
higher state); a concept whose `unit_id` doesn't resolve throws rather
than silently omitting it; the self-referencing-edge drop (FR-011) fires
only after a `"merge"` reconciliation decision, not on ordinary distinct
edges; the three-way reconciliation decision shape (`merge`/`distinct`/
`uncertain`) round-trips through `reconciliation_decisions`'s schema.

## Group B — requires a real Supabase project (schema only, no OpenAI needed yet)

### B1. Apply the migration

```bash
npx supabase db push   # applies supabase/migrations/0003_course_ontology.sql
```

**Expected outcome**: `course_units`, `course_concepts`, `concept_edges`,
`extraction_runs`, `reconciliation_decisions`, `concept_flags` exist with
RLS enabled; an anon-key query against any of them returns `status=200,
rows=0` for a signed-out session (same verification pattern used for
every prior migration in this project).

### B2. `getCourseGraph` on an empty course returns a valid empty graph

```bash
npm run dev
#   1. Create a course, do not run any extraction
#   2. Open its atlas route
```

**Expected outcome**: renders an empty-but-valid atlas (spec.md Edge
Cases), not an error — proves `materializeCourseGraph`'s zero-confirmed-
rows path works against a real database, not just the unit-test fixture.

## Group C — requires a real OpenAI key (the feature's actual point)

### C1. Extraction against the benchmark corpus

```bash
npx tsx scripts/score-extraction.ts
```

**Expected outcome**: runs extraction against every artifact under
`benchmark/dsa-course/sources/` that has a matching `artifacts.json`
entry, prints per-artifact and aggregate precision/recall against
`concepts.json`/`edges.json`, and exits non-zero only if aggregate recall
regressed from the last recorded baseline (research.md — there is no
fixed target number to "pass" yet, only regression detection). Requires
`OPENAI_API_KEY` in the environment; fails with a clear, specific message
(not a silent skip) if it's unset.

### C2. End-to-end: upload → extract → review → render

```bash
npm run dev
#   1. Upload a real artifact to a course (Phase 1's existing upload flow)
#   2. Wait for it to reach "ready" (Phase 1's ingestion-status UI)
#   3. Confirm an extraction_runs row appears and reaches "completed"
#   4. Open the review queue, confirm at least one concept and one edge
#   5. Open that course's atlas route
```

**Expected outcome**: the confirmed concept/edge from step 4 are visible
in the rendered atlas from step 5; anything left "proposed" in step 4 is
NOT visible in the atlas (FR-003).

### C3. Reconciliation on a second artifact

```bash
#   1. Upload a second artifact discussing overlapping material
#   2. Wait for its extraction_runs row to reach "completed"
#   3. Open the review queue
```

**Expected outcome**: the overlapping concept appears with a `"merge"`
reconciliation decision attached (visible reasoning text, not just a
flag) rather than as a brand-new duplicate proposed concept; a genuinely
new concept from the second artifact appears as its own proposed
candidate with `"distinct"`.
