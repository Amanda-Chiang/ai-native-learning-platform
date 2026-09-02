# Research: Exam Planner

## Exactly one new table: exam configuration, nothing else

- **Decision**: `exam_configs` (date + scope) is the only new
  persisted state. The staged plan and readiness snapshot are computed
  fresh on every request (FR-009) -- neither is ever written to a
  table.
- **Rationale**: `review-scheduler`'s own research.md proved that
  ranking/session content needs zero new storage because it's all
  derivable from existing evidence/course state; exam-planner reuses
  that same derivation, restricted to a scope. The one thing that
  genuinely doesn't exist anywhere yet is "a student's configured exam"
  itself -- there's no existing table that could answer "what exam is
  this student preparing for, and what's in scope." That's a real,
  demonstrated need, clearing the same bar `graph_layouts` already
  cleared (a new table in the already-approved Postgres store, not a
  new persistence layer -- no ADR gate applies, per
  `brain/decisions/architecture-log.md`'s own precedent entry for that
  table).
- **Alternatives considered**: storing a generated plan/readiness
  snapshot alongside the config (rejected -- directly contradicts
  FR-009's "always fresh," and would immediately go stale the moment
  new evidence is committed, the exact staleness problem User Story 3
  exists to rule out).

## Three of four stages are review-scheduler's existing selection, scope-restricted

- **Decision**: `scoped-selection.ts` doesn't implement new ranking
  logic -- it restricts `review-scheduler`'s existing
  `rankConceptsByPriority` (diagnostic and final-weakness stages) and
  `composeConnectSession`'s weak-edge detection (interleaving stage) to
  an exam's scope (its concept/unit ids, with units expanded to their
  confirmed concepts at read time). The timed-mixed stage takes a
  spread across the scope's full mastery range rather than only the
  highest-priority concepts, so a student practices a realistic mixed
  set instead of only their weakest points right before the exam-style
  stage.
- **Rationale**: FR-004/FR-011 require reusing the existing
  deterministic selection mechanism, never a second one. Diagnostic
  ("what don't I know yet") and final-weakness ("what's still weak")
  are both literally "rank this scope's concepts by priority and take
  the top N" -- the same function, just called at different points in
  time with naturally different evidence behind it (more practice has
  happened by the final stage, so the same ranking function surfaces
  different concepts without needing to know it's "the final stage" at
  all). Interleaving ("how concepts connect") is exactly
  `composeConnectSession`'s weak-new-to-old-edge detection, restricted
  to edges where both endpoints are in scope rather than "new this
  week."
- **Alternatives considered**: a bespoke per-stage selection algorithm
  (rejected -- would violate FR-004/FR-011 and duplicate logic that
  already exists and is already tested).

## Stage share: tunable percentages of real remaining days, not fixed durations

- **Decision**: Each stage gets a tunable *percentage* of the real
  number of days between today and the exam date (default: diagnostic
  30%, interleaving 30%, timed-mixed 25%, final-weakness 15%), rounded
  to whole days, with the final-weakness stage always getting at least
  one day even if rounding would otherwise zero it out.
- **Rationale**: FR-003 requires stage boundaries computed
  deterministically from real days-remaining, and FR-006 requires a
  usable plan even when very little time remains (Edge Cases). A
  percentage-of-remaining-time split (not a fixed "diagnostic gets 5
  days") satisfies both: it scales down gracefully for a
  close exam (User Story 1 Acceptance Scenario 3) without ever needing
  a special-cased "too little time" branch, and it never invents days
  that don't exist (SC-005).
- **Alternatives considered**: fixed absolute day counts per stage
  (rejected -- breaks down for a close exam, either overflowing the
  real remaining time or requiring a separate special case, exactly
  what the percentage split avoids structurally).

## LLM-drafted stage wording: deferred, not part of this pass

- **Decision**: FR-005 permits (not requires) an LLM to draft a
  stage's session wording/framing. This pass does not implement that
  -- stages are presented with their real selected concepts/questions
  and a plain, factual label (matching `review-scheduler`'s own
  `reasons` convention), no model call.
- **Rationale**: the spec's own wording is "MAY," and the concept/
  question selection underneath (the part Constitution Principle IV
  actually cares about) is fully real either way. Adding a wording-only
  LLM call now would be scope not actually demanded by this pass, the
  same "don't build for a need nothing has actually stated" discipline
  this project applies elsewhere (`review-scheduler`'s own deferred
  generic structured-answer form).
- **Alternatives considered**: implementing it now for polish
  (rejected -- real but non-essential scope; safe to add later without
  touching the deterministic selection layer underneath at all, since
  wording is presentation, not selection).

## Synchronous server actions, not a Trigger.dev background task

- **Decision**: `exam_configs` CRUD and plan/readiness generation are
  plain `"use server"` actions, like `review-scheduler`.
- **Rationale**: with LLM wording deferred, nothing in this feature's
  core path makes any external/slow call -- it's bounded Postgres reads
  plus in-memory computation, the same criterion `review-scheduler`'s
  own research.md already used for the same conclusion.
- **Alternatives considered**: none seriously -- the same reasoning
  applies unchanged from `review-scheduler`.

## Units in scope resolve to concepts at read time, not at configuration time

- **Decision**: `exam_configs.scope_unit_ids` is stored as-is; every
  plan/readiness request expands a scoped unit to its currently
  confirmed concepts fresh, rather than snapshotting the concept list
  at configuration time.
- **Rationale**: FR-009 requires the plan/readiness to reflect current
  state on every request -- if a new concept gets confirmed into a
  scoped unit later (e.g. more course material gets ingested), it
  should appear in the exam's scope automatically, not require
  reconfiguring the exam.
- **Alternatives considered**: expanding and storing the concept list
  at configuration time (rejected -- directly the kind of stale
  snapshot FR-009/User Story 3 rule out).
