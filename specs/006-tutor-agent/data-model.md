# Data Model: Tutor Agent

All new tables live in `supabase/migrations/0005_tutor_agent.sql`. RLS is
keyed on `user_id = auth.uid()`, matching `learner-graph-evidence`'s
precedent (research.md) — conversation data belongs to the student, not
the course owner.

## tutor_conversations

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK → `auth.users.id`, cascade delete — the student having this conversation |
| `course_id` | `uuid` | FK → `courses.id`, cascade delete |
| `created_at` | `timestamptz` | default `now()` |
| `updated_at` | `timestamptz` | default `now()`, bumped whenever a new turn is appended |

RLS: `select`/`insert`/`update` where `user_id = auth.uid()` (update is
only ever a `updated_at` touch when a turn is appended — no other column
is ever mutated after creation).

## tutor_conversation_turns

Append-only (no update/delete policy or code path), same convention as
`evidence_events`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `conversation_id` | `uuid` | FK → `tutor_conversations.id`, cascade delete |
| `user_id` | `uuid` | denormalized from the parent conversation, so RLS never needs a join (same reasoning as every `owner_id`-denormalized table in this project) |
| `role` | `text` | not null, `check (role in ('student', 'tutor'))` |
| `content` | `text` | not null — the message text |
| `concept_ids` | `uuid[]` | not null, default `'{}'` — which confirmed concepts this turn concerns (student turns answering a diagnostic, or tutor turns explaining/asking about one) |
| `correct` | `boolean` | nullable — only meaningful on a student turn answering a diagnostic/retrieval prompt; null when not applicable |
| `requested_direct_answer` | `boolean` | not null, default `false` — set on a student turn that explicitly asks to skip the ladder (FR-006's "just explain") |
| `ladder_step_used` | `numeric` | nullable — only set on a tutor turn; the ladder step (`assistance-ladder.ts`'s `computeLadderStep`, 0-6) that turn's response was computed at, logged for audit the same way `learner_concept_state.contributing_factors` logs a computation's inputs even though the value itself is always recomputed fresh, never read back as authoritative |
| `created_at` | `timestamptz` | default `now()` |

RLS: `select`/`insert` where `user_id = auth.uid()`.

## tutor_tool_calls

One row per tool invocation during a tutor turn — auditability (spec.md
Key Entities: "useful for tracing why the tutor responded the way it
did"), append-only.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `turn_id` | `uuid` | FK → `tutor_conversation_turns.id`, cascade delete — the tutor turn during which this call happened |
| `user_id` | `uuid` | denormalized, same reasoning as above |
| `tool_name` | `text` | not null, `check (tool_name in ('search_course_materials', 'get_concept_state', 'get_concept_neighbors', 'record_exposure', 'record_misconception_candidate'))` — exactly this feature's tool surface (plan.md), nothing from the assessment-generation tool list |
| `arguments` | `jsonb` | not null — the tool call's real arguments, verbatim |
| `result` | `jsonb` | not null — the tool's real return value, verbatim (never a placeholder if the call failed — a failed call's `result` records the real error, per no-silent-placeholders) |
| `created_at` | `timestamptz` | default `now()` |

RLS: `select`/`insert` where `user_id = auth.uid()`.

## Divergence this migration makes to an existing table

`evidence_events.conversation_turn_id` (added in
`0004_learner_evidence.sql` as a bare `uuid`, deliberately left
unconstrained because no conversation-turn table existed yet) gets a real
foreign key here:

```sql
alter table public.evidence_events
  add constraint evidence_events_conversation_turn_id_fkey
  foreign key (conversation_turn_id) references public.tutor_conversation_turns (id);
```

## `computeLadderStep`: the pure assistance-ladder algorithm

`src/features/tutor-agent/assistance-ladder.ts`:

```ts
type LadderAttempt = { resolved: boolean; requestedDirectAnswer: boolean };

type LadderWeights = {
  /** Attempts at one step before escalating to the next (a tunable product parameter, PRD S14.3). */
  attemptsPerStep: number;
};

function computeLadderStep(
  priorAttempts: LadderAttempt[],   // this conversation's attempts on this concept, in order
  weights: LadderWeights,
): number   // 0-6, PRD S14.3
```

- If any prior attempt has `requestedDirectAnswer: true`, the step is `6`
  immediately (FR-006 — the escape hatch always wins, checked first,
  regardless of how many attempts came before it).
- Otherwise, the step is `floor(unresolvedAttemptCount / weights.attemptsPerStep)`,
  capped at `6` — one step per `attemptsPerStep` unresolved attempts,
  starting at `0` with no prior attempts (FR-004's "opens with the
  minimum useful intervention").
- A `resolved: true` attempt (the student got it) doesn't reset the count
  to `0` for a *later, different* question about the same concept within
  the same conversation — each call only ever looks at the attempts
  actually passed in for the specific exchange being computed, so the
  caller (`run-tutor-turn.ts`) passes only the attempts relevant to the
  current question, not the concept's entire conversation history.

## `search_course_materials`: the pure grounding query

`src/features/tutor-agent/search-course-materials.ts`:

```ts
function buildSearchQuery(
  courseId: string,
  query: string,
  filters?: { conceptIds?: string[] },
): { conceptsQuery: PostgrestFilterBuilder; edgesQuery: PostgrestFilterBuilder }
```

Builds (does not execute) a query over `course_concepts`/`concept_edges`
scoped to `course_id` and `status = 'confirmed'`, matching `query`
case-insensitively against `canonical_name`/`aliases`/`description`
(concepts) or `explanation` (edges) — a plain `ilike`, no full-text-search
extension, matching this project's existing scale (research.md, PRD
S9/R15-R18: no demonstrated need for embeddings/full-text yet). Row →
result mapping attaches each match's real `source_anchors` unchanged —
`search_course_materials` never returns a concept/edge without its real
anchors, and never fabricates one when a term matches nothing (an empty
result set is the honest answer).
