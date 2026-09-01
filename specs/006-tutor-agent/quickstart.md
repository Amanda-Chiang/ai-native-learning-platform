# Quickstart: Tutor Agent

Unlike `learner-graph-evidence`, this feature needs a real `OPENAI_API_KEY`
(already present in `.env.local`, same credential `course-graph-ingestion`
uses) — the tool-calling loop is a real model call, not pure computation.

## Group A — verifiable now, no live conversation needed

### A1. Typecheck

```bash
nvm use 24
npm run typecheck
```

**Expected outcome**: exits 0.

### A2. Pure logic, exhaustively

```bash
npm run test:unit
```

**Expected outcome**: passes, including new tests confirming — no
database or model call involved:

- `computeLadderStep` opens at `0` with no prior attempts, escalates one
  step at a time as unresolved attempts accumulate, and jumps straight to
  `6` the moment any attempt has `requestedDirectAnswer: true` regardless
  of how many attempts came before (FR-004/FR-005/FR-006, SC-002/SC-003).
- `search_course_materials`'s query builder scopes to the given
  `course_id` and `status = 'confirmed'` only, and never returns a
  concept/edge without its real `source_anchors`.
- `tool-call-validation.ts` rejects a tool call whose arguments don't
  match its schema (e.g. `record_exposure` missing a required numeric
  field) before any Supabase call happens.

## Group B — requires a real Supabase project + OPENAI_API_KEY

### B1. Apply the migration

```bash
npx supabase db push   # applies supabase/migrations/0005_tutor_agent.sql
```

**Expected outcome**: `tutor_conversations`, `tutor_conversation_turns`,
`tutor_tool_calls` exist with RLS enabled; an anon-key query against any
of them returns `status=200, rows=0` for a signed-out session (same
verification pattern used for every prior migration); the new
`evidence_events_conversation_turn_id_fkey` constraint is present.

### B2. A grounded conversation, live

```bash
npm run dev
#   1. Sign in, open a course with confirmed concepts/edges (or /courses/demo — see
#      data-model.md's search-course-materials.ts note on fixture vs. real courses)
#   2. Start a conversation and ask about a confirmed concept
#   3. Ask something the course material doesn't cover
```

**Expected outcome**: step 2's answer references real course content
(traceable to a real `source_anchors` excerpt); step 3's answer plainly
says the material doesn't cover it, rather than inventing an answer
(spec.md US1).

### B3. The ladder paces help, and the escape hatch works

```bash
#   1. Ask the tutor to explain a concept with no recorded evidence
#   2. Give a wrong/no answer to its diagnostic prompt a few times
#   3. At any point, explicitly ask for the direct answer
```

**Expected outcome**: step 1's response opens with a retrieval/diagnostic
prompt, not a full explanation; step 2 escalates one ladder step at a
time; step 3 gets the complete answer immediately regardless of ladder
position (spec.md US2).

### B4. Evidence from the conversation is real and traceable

```bash
#   1. Answer a diagnostic prompt correctly, unprompted
#   2. Call learner-graph-evidence's getConceptState for that concept
#   3. Give a confident, incorrect, independent answer to the same
#      concept twice more in the same conversation
#   4. Call getConceptState again
```

**Expected outcome**: step 2 shows a tier above the FR-010 baseline,
sourced from a real `evidence_events` row whose `conversation_turn_id`
resolves to the actual student turn; step 4 shows
`hasUnresolvedMisconception: true` (spec.md US4, learner-graph-evidence's
existing threshold logic, unchanged).
