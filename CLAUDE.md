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
  changes) before declaring a feature complete.
- Use Spec Kit (`/speckit-*` skills) for meaningful features (concept atlas,
  ingestion, learner graph/evidence, assessment generation, grading, review
  scheduler, exam planner, integrations). Skip it for typos, trivial styling,
  one-line fixes, and dependency bumps with no behavioral change.
