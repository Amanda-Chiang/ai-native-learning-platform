@AGENTS.md

# Invariant engineering rules

These are non-negotiable constraints for this project. Durable architectural
context, lessons, and rejected approaches live in `brain/` — read the
relevant file there before touching a subsystem. Full requirements live in
`docs/technical-prd.md`.

- Never couple canonical learner-graph data to a rendering library (React
  Flow, G6, Cytoscape, etc.). The graph DTO is renderer-neutral; renderer
  coordinates/state live only in view adapters.
- Every learner-state mutation (mastery, evidence, misconception flags) must
  be backed by an immutable evidence record. No direct writes to learner
  state.
- Exposure (notes, uploads, conversation) is not mastery. Only independent
  retrieval, application, or transfer produces mastery-grade evidence.
- Use deterministic verification whenever a domain can be checked exactly
  (code, data structures, boolean logic, numeric/symbolic math). Reserve LLM
  grading for domains without an exact checker, and require structured
  rubrics when it's used.
- Course-specific claims (questions, answer keys, explanations) must carry
  source anchors to uploaded course material.
- Student flags/feedback are a signal, not ontology truth. Never mutate the
  canonical concept ontology based solely on a student's assertion.
- Do not add a graph database, or any new persistence layer, without a
  demonstrated requirement — record the decision as an ADR in
  `brain/decisions/` first.
- Do not add a new external dependency when an existing project dependency
  already solves the problem.
- Always run the relevant test suite (and visual QA for Concept Atlas
  changes) before declaring a feature complete. When live credentials
  exist (Supabase, OpenAI, etc.), actually run the live verification
  (migration push + RLS check, a real extraction call, ...) — typechecking
  or unit-testing around a live dependency is not the same claim as
  having run it, and this project's history has cases of real bugs a
  live run caught that a typecheck alone would have missed.
- Use Spec Kit (`/speckit-*` skills) for meaningful features (concept atlas,
  ingestion, learner graph/evidence, assessment generation, grading, review
  scheduler, exam planner, integrations). Skip it for typos, trivial styling,
  one-line fixes, and dependency bumps with no behavioral change.

## Process & collaboration rules

These apply to any agent working in this repo, not just within one
session — carried in agent memory before this section existed, folded in
here so they're discoverable from the repo alone.

- No silent placeholders, and this applies retroactively: a fallback,
  default, or unknown value must never be indistinguishable from a
  genuinely computed one. If something can't be computed or found, make
  that visible (throw, log, an explicit "unknown"/"missing" state) —
  never a plausible-looking stand-in. When implementing, actively look
  for a `?? x` / `|| x` masking a real gap in existing code you touch,
  not just avoid introducing new ones.
- Favor long-term maintainability over the fastest implementation
  specifically when the project's own docs (PRD, a feature's spec)
  already signal the need is coming (e.g. "these weights need future
  recalibration" → design for that now). Still bounded by YAGNI — this
  is not license to build for needs nothing has actually stated.
- Update the relevant spec/plan/tasks/data-model.md the moment reality
  diverges from what it says — don't let docs drift silently. This
  applies to top-level docs too (`README.md`, `docs/implementation-roadmap.md`),
  not only per-feature specs: both had gone stale enough to actively
  mislead a fresh agent about what was already built, which is what
  prompted this section to exist.
- Log every major architecture/system-design decision to
  `brain/decisions/architecture-log.md` as it happens, not only when
  asked — it's the chronological record a fresh agent (or a future
  session) uses to understand *why* something is shaped the way it is.
- Git commits in this repo are solo-authored (Amanda Chiang) — never add
  a "Co-Authored-By: Claude" trailer. Commit incrementally at feature/
  checkpoint boundaries, not batched at the end.
- Never print or paste a sensitive secret (service-role keys, API keys)
  into chat — ask the user to fill it in directly in their editor.
  Non-sensitive values (URLs, anon/publishable keys) are fine to read
  and write directly.
- After completing a step, explain what changed and why in plain
  language, including any design decision made (what was chosen between,
  and the rationale) — this project is also how the user is learning
  system design, so explain data-structure/architecture choices
  pedagogically, not just report status.
