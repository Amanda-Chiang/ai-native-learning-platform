# `brain/` — durable project context index

Per `CLAUDE.md`: read the relevant file here before touching a subsystem.
This index exists so a fresh agent can find "the relevant file" without
`ls`-ing the tree and guessing. Full requirements still live in
`docs/technical-prd.md`; sequencing in `docs/implementation-roadmap.md`;
current build status in the highest-numbered `specs/NNN-*/tasks.md`.

## `architecture/` — how the system is actually built, and why

- `graph-model.md` — the renderer-neutral course-graph DTO; why it never
  carries React Flow-specific coordinates/state.
- `learner-evidence.md` — the evidence-record model behind every
  learner-state mutation (mastery, misconceptions); why there are no
  direct writes.
- `assessment-pipeline.md` — the candidate-generation → validation →
  grading pipeline shape.
- `ai-boundaries.md` — where deterministic verification is required vs.
  where LLM/rubric grading is the only option, and why.

## `decisions/`

- `architecture-log.md` — chronological log of every major
  system-design decision and real bug found/fixed, in the order it
  happened. **Read this before assuming any file's current state** —
  it's the most current record of what changed and why, more current
  than any prose summary elsewhere.
- `ADR-0001-dev-tooling-selection.md` — dev tooling ADR.

## `product/` — product commitments that constrain design/implementation

- `concept-atlas.md` — the concept atlas's non-negotiable product
  commitments (units as bounded regions, redundant mastery encoding,
  stable layout, progressive disclosure, etc.) — read before changing
  anything about how the atlas renders or lays out.
- `learning-policy.md` — the review/scheduling policy's product intent.

## `design-context/` — for a frontend design/aesthetic pass specifically

- `page-map.md` — every real route today, what's actually rendered,
  real component names.
- `navigation-flow.md` — the real click-path through the product today,
  plus named navigation gaps.
- `tech-constraints.md` — what's locked in (React Flow + ELK for the
  graph) vs. genuinely open (no CSS framework/component library/icons/
  animation installed at all) for anyone proposing a visual redesign.
- `frontend-design-handoff-prompt.md` — a ready-to-paste prompt for
  handing a design pass to another LLM, referencing the three files
  above.

## `lessons/`

- `setup-gotchas.md` — real environment/setup pitfalls hit and fixed
  (read before debugging an environment problem that looks new — it
  might not be).

## `setup/`

- `development-environment.md` — how to actually get this running
  locally (Node version, env vars, Trigger.dev, Supabase).
