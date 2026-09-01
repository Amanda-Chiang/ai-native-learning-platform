# Quickstart: Learner Graph Evidence

Unlike `course-graph-ingestion`, this feature needs no external
credential (no LLM call anywhere) — everything except the live-database
migration/RLS check is verifiable offline.

## Group A — verifiable now, no external accounts needed

### A1. Typecheck

```bash
nvm use 24
npm run typecheck
```

**Expected outcome**: exits 0.

### A2. The algorithm, exhaustively (this is the feature's real test surface)

```bash
npm run test:unit
```

**Expected outcome**: passes, including new tests confirming — directly
against `computeLearnerState`, no database involved:

- Any sequence of exposure-only events, no matter how many, never
  produces a tier above `"exposed"` (spec.md SC-001, checked against at
  least 50 synthetic events per data-model.md's exhaustive-check intent).
- One independent, correct, high-confidence retrieval event with no
  prior evidence produces a tier above `"exposed"` (SC-002).
- A relationship's computed state is independent of its two endpoint
  concepts' own computed states, given the same underlying event set
  targets different combinations of `conceptIds`/`edgeIds`.
- Two or more confident, incorrect, independent events on the same
  target set `hasUnresolvedMisconception: true`; a later strong correct
  independent event clears it (FR-011/FR-012).
- An empty event list returns the exact FR-010 baseline
  (`"unverified"`/`"strong"`, `score: 0`, no misconception).
- `applyLearnerState` overlays exactly the concepts/edges present in its
  state maps and leaves everything else at the input `CourseGraph`'s
  original values, without mutating the input.

## Group B — requires a real Supabase project

### B1. Apply the migration

```bash
npx supabase db push   # applies supabase/migrations/0004_learner_evidence.sql
```

**Expected outcome**: `evidence_events`, `learner_concept_state`,
`learner_edge_state` exist with RLS enabled; an anon-key query against
any of them returns `status=200, rows=0` for a signed-out session (same
verification pattern used for every prior migration in this project).

### B2. Evidence commit is visible immediately, and only to the student who created it

```bash
npm run dev
#   1. Sign in, commit one piece of strong independent evidence for a
#      confirmed concept in a course you own (via commitEvidence,
#      e.g. through a temporary test call or a future tutor-agent UI)
#   2. Call getConceptState for that same concept
#   3. Open that course's atlas route
```

**Expected outcome**: step 2 shows a tier above `"exposed"`; step 3
renders that concept at its real tier, not the ingestion-time baseline;
a second, different signed-in account sees only the FR-010 baseline for
the same concept (SC-005) — not required to automate this in Group B,
but confirm it doesn't regress before calling this feature done.

### B3. Exposure never fabricates mastery, against real data

```bash
#   1. Record several exposure-type evidence events for one concept
#   2. Call getConceptState for it
```

**Expected outcome**: tier is `"exposed"`, never higher, no matter how
many exposure events were recorded — the live-database confirmation of
what A2 already proves offline.
