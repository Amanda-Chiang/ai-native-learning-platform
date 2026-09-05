# Unit extraction & reconciliation — design

**Status:** Approved (brainstorming), ready for implementation planning
**Date:** 2026-09-05
**Feature area:** `course-graph-ingestion` (extends the existing Spec Kit
feature at `specs/004-course-graph-ingestion/`)

## Problem

`course_concepts.unit_id` is a required foreign key, but nothing in the
product creates a `course_units` row — units were designed as
owner-authored organizational metadata (`data-model.md`: "a unit is
closer to organizational metadata than an extracted claim"). The
result: `extractCourseGraphTask` throws
`"Course {id} has no course_units yet"` for every real course made
through the actual UI, since no UI anywhere creates a unit. Concept
extraction is therefore structurally guaranteed to fail today, not
merely idle.

Separately, `extraction_runs` failures (including the above) have no
UI surface at all — the Materials page shows `artifacts` status and
the Pending Review list, neither of which reflects an
`extraction_runs` row. A real failure looks identical to "still
queued" or "queued zero concepts" to the student.

## Goals

1. Let units be extracted automatically from material, the same way
   concepts already are — not something the user must create by hand
   before extraction can run at all.
2. Let a user manually create a unit, and treat it as authoritative:
   it starts `confirmed` immediately, and nothing in the automated
   pipeline can silently rename or delete it — only append
   supplementary metadata (aliases/anchors), the same guarantee
   `course_concepts`'s existing merge-write already provides.
3. Let an upload be optionally tagged to a specific unit
   (`target_unit_id`), and treat that as a hard rule: every concept
   extracted from that artifact attaches to the tagged unit, with no
   model discretion.
4. Minimize duplicate-unit risk without building a bigger "detect and
   merge two independently-already-confirmed entities" system (that
   remains an explicit non-goal, matching the same limitation the
   concept pipeline already lives with).
5. Surface real `extraction_runs` status somewhere in the UI so a
   failure is never indistinguishable from "still processing."

## Non-goals

- **Post-hoc duplicate detection/merging of two already-confirmed
  units or concepts.** Reconciliation only ever compares a *new*
  candidate against the *existing* list — it does not, and will not
  as part of this feature, re-compare two already-confirmed entities
  against each other after the fact. This is a real, named limitation
  the concept pipeline already accepts (see
  `resolveEdgeEndpoints`'s own comment on within-run duplication); this
  feature does not close that gap for units either, only avoids
  creating *new* instances of it where a cheap fix exists (the
  existing-unit menu, below).
- Manual creation of a concept from scratch (no upload/extraction
  involved) — explicitly out of scope; only manual *unit* creation is
  in scope.
- A dedicated unit-management page/UI beyond a minimal add-a-unit form
  and an optional upload-time unit picker.

## Design

### Data model changes

- `course_units` gains:
  - `status text not null check (status in ('proposed','confirmed','archived'))`
    — mirrors `course_concepts`. Manually-created units insert directly
    as `'confirmed'`. Extracted units insert as `'proposed'`.
  - `extraction_run_id uuid null references extraction_runs(id)` —
    provenance, nullable for manually-created units, mirrors
    `course_concepts.extraction_run_id`.
- `artifacts` gains `target_unit_id uuid null references course_units(id)`
  — the optional "this upload is for unit X" tag, set at upload time.
- `reconciliation_decisions.candidate_kind` check constraint extends
  from `('concept','edge')` to `('concept','edge','unit')`.

No new fields on `course_units` beyond the above — no
`source_anchors`/`confidence`/`importance_score`. A unit is a
structural grouping, not a claim; those concept-specific fields don't
apply and are not added for symmetry's own sake.

**RLS note:** `course_units`'s existing RLS (`data-model.md`:
"units are directly authorable... unlike concepts") predates this
feature and only anticipated the owner's own session inserting rows.
`status: 'proposed'` rows are now also inserted by the Trigger.dev
task via the service-role admin client — same bypass-RLS-by-design
pattern `course_concepts`/`concept_edges` inserts already use, not a
new exception. The owner-session RLS policy itself doesn't need to
change; a manually-created unit still inserts as `'confirmed'`
through the normal owner-authenticated path.

### Extraction schema & prompt changes

`EXTRACTION_RESPONSE_SCHEMA` (`extraction-schema.ts`) gains a top-level
`units` array — **only for newly-proposed units**:

```
units: [{ localId: string, title: string }]
```

Each concept's schema changes from an implicit unit (there wasn't one
before) to an explicit `unitRef`:

```
unitRef:
  | { kind: "existing", unitId: string }   // one of the menu's real ids
  | { kind: "new", localId: string }       // references `units[].localId` above
```

The extraction prompt (`openai-extraction-call.ts`) gains, per call:

- **The existing-units menu**: every `course_units` row for this
  course with `status in ('proposed','confirmed')` (same status filter
  concepts already use for their own existing-list query), as
  `{id, title}` pairs. The model is instructed to prefer an existing
  unit when content clearly belongs there, and only propose a new one
  when nothing fits.
- **The hard override**, only when the artifact's `target_unit_id` is
  set: an explicit instruction that every extracted concept's
  `unitRef` MUST be `{kind: "existing", unitId: target_unit_id}` — the
  menu and new-unit proposal are not offered to the model at all for
  this call.

This is the mechanism that makes a manually-created empty unit
actually receive concepts on the next relevant upload, without relying
on reconciliation to catch a duplicate after the fact — the model is
told the unit exists and can pick it directly.

### Reconciliation

`reconciliation.ts`'s `reconcileConcept`/`ReconciliationClassifier`
generalize to a shared shape reusable for both candidate kinds (either
a genuinely generic `reconcileCandidate<T>`, or a thin unit-specific
wrapper around the same classifier machinery — an implementation
choice for the planning phase, not fixed here). Behavior is identical
to today's concept reconciliation: given a candidate title and the
existing list, classify `merge` / `distinct` / `uncertain`; zero
existing units short-circuits to `distinct` with no model call, same
as zero existing concepts does today.

**Only genuinely new candidate units go through this** — a concept
whose `unitRef` already names an existing unit id never triggers a
reconciliation call at all, since there's no new candidate to
reconcile. Reconciliation is therefore a safety net over units the
model didn't successfully match to the menu, not the primary
attachment mechanism.

### Write ordering (`extract-course-graph.ts`)

`writeExtractionCandidates` changes order: **units resolve before
concepts.**

1. For each proposed unit (`units` array), run reconciliation. `merge`
   → resolve to the matched existing unit's real id, record the
   `reconciliation_decisions` row, do not insert a new `course_units`
   row. `distinct`/`uncertain` → insert a new `course_units` row with
   `status: 'proposed'`, record the decision.
2. Build `unitLocalIdToRealId` from the above (mirrors
   `localIdToRealId` for concepts, and `resolveEdgeEndpoints`'s
   existing pattern for edges).
3. For each concept, resolve its `unitRef` to a real unit id — either
   passthrough (`kind: "existing"`) or via the map (`kind: "new"`) —
   **or**, if the artifact has `target_unit_id` set, use that directly
   regardless of what the model returned (the hard rule holds even if
   something upstream failed to strip the menu/proposal fields
   correctly — defense in depth, not just prompt-level enforcement).
4. Insert concepts as today, using the resolved real unit id.

A `unitRef` that resolves to nothing (hallucinated existing id not in
the menu, or a `"new"` localId not present in the response's own
`units` array) throws immediately — same invariant-violation handling
as today's `matchedConceptId`-not-found check. Never silently falls
back to inventing a unit or dropping the concept.

### Mitigation for the "confidently-wrong distinct" residual risk

When a unit candidate's reconciliation decision is `"distinct"` (not
just `"uncertain"`), `ReviewQueue.tsx`'s unit candidate card
additionally lists the course's other existing unit titles (data
already fetched to make the reconciliation decision — free to
surface). This does not prevent a rushed reviewer from missing a
duplicate, but gives them the same information reconciliation had
instead of none. `"uncertain"` candidates already get an explicit flag
+ reasoning today; this extends comparable visibility to `"distinct"`
ones too, specifically for units (the residual risk this session
identified as not fully closed by review alone).

### New UI

- **Add a unit** (Materials tab): a small form (title input, submit),
  same validation pattern as `CreateCourseForm` (non-empty, trimmed).
  Inserts directly as `status: 'confirmed'`, `extraction_run_id: null`.
- **Upload-time unit picker** (optional, on the existing dropzone):
  a dropdown of the course's existing units (any status except
  `archived`), skippable. Sets `target_unit_id` on the `artifacts`
  insert.
- **Extraction status visibility** (closes the separately-identified
  gap): Materials page surfaces each artifact's latest `extraction_runs`
  row (`queued`/`processing`/`completed`/`failed` + `failure_reason`
  when failed), not just the `artifacts.status` it shows today. This
  was found as a real, distinct gap during diagnosis (an
  `extraction_runs` failure is currently invisible) and is included in
  this feature's scope since it's needed to actually verify any of the
  above live.

## Error handling summary

| Case | Behavior |
|---|---|
| `unitRef` references a nonexistent existing id or unresolvable new localId | Throw, mark `extraction_runs.status = 'failed'` with a specific reason. Never silent fallback. |
| `target_unit_id` set but that unit was archived/deleted before extraction ran | Fail the run with an explicit "target unit no longer exists" reason. Never silently fall back to menu-choice. |
| Zero existing units, no `target_unit_id` (brand-new course, first upload) | Normal case, not an error — model proposes new units freely. |
| Add-a-unit form: empty/duplicate title | Same validation pattern as `CreateCourseForm`. |
| Unit reconciliation classifier call fails mid-run | Same pattern as today: whole extraction run marked `failed` with the real error message, no partial silent success. |

## Testing

**Unit-testable (pure, `node --test`, test-first):**
- Unit reference resolution (existing-id passthrough vs. new-localId→
  real-id via the map), mirroring `resolveEdgeEndpoints`'s existing
  test style.
- Generalized reconciliation's zero-existing-units shortcut.
- Extraction schema validation for the new `units` array and
  `unitRef` shape (mirrors `parseExtractionResult`'s existing
  concept/edge validation tests).
- `target_unit_id` hard-override resolution taking precedence over a
  model-returned `unitRef` (defense-in-depth case above).

**Live-verified only (real model call, not something a unit test can
fake being "correct" about — same reasoning already established for
concept reconciliation):**
1. Brand-new course, first upload, zero existing units → sensible new
   units proposed, no error.
2. Existing confirmed unit + new untagged upload covering the same
   topic → model picks the existing unit via the menu, no duplicate
   candidate proposed.
3. Manually-created *empty* unit + later untagged upload covering that
   topic → concepts attach directly to it, no duplicate candidate.
4. Upload tagged to a specific unit → all its concepts hard-attach
   there regardless of content.
5. A `"distinct"` unit candidate correctly shows the existing-units
   mitigation list in Pending Review.
6. `extraction_runs` failure (e.g. a deliberately-broken case) is
   visible on the Materials page, not indistinguishable from queued.

## Open implementation-planning decisions (not fixed here)

- Whether `reconcileConcept` generalizes via a shared generic function
  or a thin per-kind wrapper — an implementation-plan-level choice.
- Exact migration numbering/file naming (follows this repo's existing
  `NNNN_description.sql` convention under `supabase/migrations/`).
- Whether the upload-time unit picker lives inline on the existing
  dropzone or as a small adjacent control — a small UI-plan detail.
