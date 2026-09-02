# Quickstart: Visual Assessment (Graph/Tree)

Like `course-graph-ingestion`/`deterministic-grading`, this feature
needs a real `OPENAI_API_KEY` for its one genuinely new capability
(vision extraction) -- the layout/merge/problem-setup logic is
verifiable offline.

## Group A -- pure logic, no external call needed

```bash
nvm use 24
npm run typecheck
npm run test:unit
```

**Expected outcome**: both exit 0, including new tests confirming --
all pure, all constructed fixtures:

- `problem-setup.ts`: given a real `bfs-dfs` checkerInput with a
  `claimedOrder` field, `extractProblemSetup` returns everything
  except `claimedOrder`; given a `shortest-path` input, it strips both
  `claimedPath` and `claimedTotalDistance`.
- `graph-layout.ts`/`tree-layout.ts`: every real node/edge in the input
  structure appears exactly once in the layout output; no node is
  placed at a duplicate/undefined position.
- `merge-structure.ts`: merging a problem setup with a confirmed set of
  claim fields produces an object structurally identical to a real,
  hand-constructed full `checkerInput` for that domain.
- `needsConfirmation`: a confidence at or above `LOW_CONFIDENCE_THRESHOLD`
  returns `false`; below it returns `true`.

## Group B -- requires a real Supabase project and a real OPENAI_API_KEY

### B1. Apply the Storage migration

```bash
npx supabase db push   # applies supabase/migrations/0009_visual_assessment_storage.sql
```

**Expected outcome**: the `assessment-drawings` bucket exists,
private; an anon-key upload attempt outside a real user's own folder
path is rejected by RLS.

### B2. A real correct drawing, real BFS/DFS question, graded exactly

```bash
#   1. Using a real, validated question_bank entry with
#      checker_domain "bfs-dfs", render its problem setup and draw a
#      real, objectively correct traversal order
#   2. Call submitDrawing, then submitConfirmedVisualResponse with the
#      (accepted or corrected) claim fields
```

**Expected outcome**: a real "correct" outcome from the same
`checkTraversal` function `deterministic-grading`'s own structured
submissions use, with real evidence committed.

### B3. A real incorrect drawing is graded with the real divergence shown

```bash
#   1. Draw an objectively wrong traversal order for the same question
#   2. Submit it the same way
```

**Expected outcome**: a real "incorrect" outcome naming the actual
divergence, not a generic failure.

### B4. A genuinely ambiguous drawing triggers confirmation

```bash
#   1. Draw something deliberately hard to read (e.g. an edge that
#      could plausibly be read in either direction)
#   2. Call submitDrawing
```

**Expected outcome**: a real confidence below `LOW_CONFIDENCE_THRESHOLD`,
`needsConfirmation: true`; confirming a corrected structure and then
calling `submitConfirmedVisualResponse` grades the corrected structure,
never the original low-confidence reading.

### B5. A blank/unreadable drawing fails honestly

```bash
#   1. Call submitDrawing with a blank or scribbled, non-structural
#      image
```

**Expected outcome**: a real, distinct error -- never empty/placeholder
claim fields silently passed through toward grading.

### B6. The loop works for a second, distinct domain

```bash
#   1. Repeat B2 against a real question_bank entry with
#      checker_domain "tree-traversal" or "tree-insertion"
```

**Expected outcome**: correctly graded via `checkTreeTraversal`/
`checkTreeInsertion`, proving the mechanism isn't hardcoded to
`bfs-dfs` alone (FR-009/SC-005).
