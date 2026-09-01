<!--
Sync Impact Report
- Version change: [TEMPLATE] → 1.0.0
- Rationale: Initial ratification. Prior file was the unfilled Spec Kit
  scaffold with bracketed placeholders only — no governance content
  existed to version against, so this is treated as the first substantive
  adoption (MAJOR 1.0.0), not an incremental bump.
- Modified principles: n/a (first fill)
- Added sections: Core Principles I–V, Technology & Architecture
  Constraints, Development Workflow, Governance
- Removed sections: none
- Source material: CLAUDE.md invariant engineering rules, PRD §3
  (P1–P6) in docs/technical-prd.md, and brain/architecture/*.md /
  brain/decisions/ADR-0001-dev-tooling-selection.md, which already encoded
  these as working project rules prior to this formalization.
- Follow-up TODOs: none — no placeholders deferred.
-->

# AI Learning System Constitution

## Core Principles

### I. Renderer-Neutral Learner Graph

Canonical learner-graph and course-graph data MUST NOT be coupled to any
rendering library (React Flow, G6, Cytoscape, Sigma, or any future
replacement). The graph is exposed as a typed, renderer-neutral node-link
DTO. Renderer-specific coordinates, styling, and view state (viewport,
collapsed/expanded regions, layout algorithm output) live only in a view
adapter layer and are stored separately from semantic graph data (e.g. in a
distinct `graph_layouts` table, never inside `concepts`/`concept_edges`).

**Rationale:** the concept atlas renderer is expected to change or gain
alternatives (§13.8 of the PRD keeps Cytoscape/Sigma as retained options);
semantic graph data, learner evidence, and provenance must survive that
change untouched.

### II. Evidence-Backed Learner State (NON-NEGOTIABLE)

Every mutation to learner state — mastery/dimension scores, evidence
tallies, misconception flags — MUST be produced by committing an immutable
evidence record first. No code path writes `learner_concept_state` or
`learner_edge_state` directly without a corresponding `evidence_events` row
that records what happened, when, with what confidence, and from what
source (conversation turn, assessment attempt, artifact). The tutor/
generation model MUST NOT write mastery directly — only a validated
evidence-commit step may.

**Rationale:** this is the load-bearing trust guarantee of the product; a
learner graph whose state can't be traced back to what actually happened is
indistinguishable from a guess, and the whole differentiation thesis (P1 in
the project summary) depends on it being auditable.

### III. Exposure Is Not Mastery

Conversations, note uploads, and completed homework produce low-confidence
`exposure` evidence by default and MUST NOT by themselves raise a mastery
score. Only independent retrieval, application, transfer, or validated
graded performance may raise retrieval/application/transfer-tier state.
Repeated confident incorrect responses MUST be capable of producing
negative evidence, not merely be ignored.

**Rationale:** the entire product's reason to exist is that AI-assisted
exposure creates an illusion of mastery; collapsing this distinction in the
data model would silently undo the product's core differentiator.

### IV. Deterministic Verification First

Wherever a domain can be checked exactly — code correctness, data-structure
state/invariants, boolean logic, numeric/symbolic math, graph traversal —
an executable deterministic checker MUST be used for grading, not an LLM
judgment call. LLM-based grading is reserved for domains with no exact
checker (open-ended conceptual/rubric responses) and MUST use a structured
rubric, never free-form judgment. Ambiguous visual/handwritten parsing
(e.g. drawn graph/tree extraction) MUST trigger a low-confidence
confirmation step before grading proceeds, rather than silently grading a
possibly-misread answer.

**Rationale:** matches PRD P4 and `brain/architecture/ai-boundaries.md`;
deterministic checks are what make evidence in Principle II trustworthy
rather than merely plausible-sounding.

### V. Course-Grounded, Provenance-Preserving Claims

Any question, answer key, explanation, or relationship labeled as
course-specific MUST carry a source anchor into uploaded course material
whenever such material exists. Canonical course ontology (concepts,
relationships) is system-owned: it is created and modified only through
validated ingestion/reconciliation pipelines, never by direct student
mutation. A student's flag (`possible duplicate`, `wrong relationship`,
`confusing label`) is recorded as feedback evidence about the student's
belief and MUST NOT itself alter canonical ontology — it can only trigger a
system-side reconciliation review.

**Rationale:** prevents both hallucinated course claims and single-student
assertions from corrupting a graph shared conceptually across that course;
matches PRD P5 and the D4 decision in PRD §27.

## Technology & Architecture Constraints

- **Stack:** Next.js + React + TypeScript web app; PostgreSQL (via
  Supabase) as the sole persistent store for course, learner, evidence, and
  graph-layout data; Supabase Auth + Storage with row-level security;
  OpenAI Agents SDK / Responses API for orchestration; Trigger.dev for
  durable background jobs; E2B for untrusted/sandboxed code execution;
  React Flow + ELK for the concept-atlas renderer (the authoritative pick —
  see PRD §13.7 and the decision log; Cytoscape/Sigma/G6 remain retained
  alternatives, not the default); Graphology as the optional in-memory
  graph abstraction; MathLive + SymPy for bounded math capture/
  verification.
- **No new persistence layer** (graph database or otherwise) may be added
  without a demonstrated requirement recorded as an ADR in
  `brain/decisions/` first. PostgreSQL adjacency/CTE queries are the
  default until proven inadequate.
- **No new external dependency** may be introduced when an existing
  project dependency already solves the problem.
- **Architecture shape:** a modular monolith plus managed background
  worker. Do not split into microservices. Use one primary tutor/review
  agent with a tool surface; do not introduce additional named agents
  without an independent goal/context that justifies the split.
- **Client architecture:** all canonical course/learner/assessment/graph
  state lives in backend services; clients (web now, iPad later) are views
  over shared APIs, so no client redesign requires migrating the learning
  model.

## Development Workflow

- Use Spec Kit (`/speckit-*`) for meaningful features: concept atlas,
  ingestion, learner graph/evidence, assessment generation, grading, review
  scheduler, exam planner, and third-party integrations. Skip it for
  typos, trivial styling, one-line fixes, and dependency bumps with no
  behavioral change.
- Every feature spec/plan generated by Spec Kit is checked against this
  constitution's Core Principles before implementation begins; a plan that
  violates a principle must either be revised or document the violation as
  an explicit, justified exception.
- Run the relevant automated test suite before declaring any feature
  complete. Concept Atlas changes additionally require visual QA (per
  `.claude/skills/concept-atlas/references/testing.md` and the Playwright
  visual fixtures in `tests/visual/`).
- Git history: commits are solo-authored (no AI co-author trailers) and
  submitted incrementally at feature/checkpoint boundaries rather than
  batched, so the history stays legible phase-by-phase.

## Governance

This constitution supersedes ad hoc practice for anything it covers.
`CLAUDE.md` and the `brain/` architecture vault remain the durable
day-to-day reference and MUST stay consistent with this document; where
they conflict, this constitution is authoritative and the conflicting file
should be updated to match, not the reverse.

**Amendment procedure:** propose the change by editing this file directly
(or via PR), regenerate the Sync Impact Report at the top of the file, and
state the semantic version bump with reasoning: MAJOR for backward-
incompatible principle removal/redefinition, MINOR for a new principle or
materially expanded guidance, PATCH for wording/clarification only.
`LAST_AMENDED_DATE` updates on every change; `RATIFICATION_DATE` never
changes after initial adoption.

**Compliance review:** every `/speckit-plan` run for a new feature
re-checks the plan against Core Principles I–V before task generation.
Any exception must be recorded in that feature's plan document with an
explicit rationale, not silently implemented.

**Version**: 1.0.0 | **Ratified**: 2026-09-01 | **Last Amended**: 2026-09-01
