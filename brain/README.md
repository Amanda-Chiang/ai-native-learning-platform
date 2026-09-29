# `brain/` — durable project context index

Per `CLAUDE.md`: read the relevant file here before touching a subsystem.
This index exists so a fresh agent can find "the relevant file" without
`ls`-ing the tree and guessing. Full requirements still live in
`docs/technical-prd.md`; sequencing in `docs/implementation-roadmap.md`
(see its "Post-MVP work" section for real features built outside that
sequencing); current build status in the highest-numbered
`specs/NNN-*/tasks.md` (check that file's own top-of-file addendum first,
if present — later work sometimes moves a shipped feature's scope without
renumbering it). `decisions/architecture-log.md` below is the single most
current source in this repo for "what changed and why."

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
  graph) vs. genuinely open (no component library/icons/animation
  installed) for anyone proposing a visual redesign; also notes the
  real CSS-custom-property token system now in `globals.css` (was
  "zero design token system" before the Orca rebrand's Phase 1 plan).
- `brand-identity.md` — the Orca brand (name/logo/6-color palette).
  **Live since 2026-09-27**: `src/app/globals.css` carries the real
  token system, and the redesign's phases 1–3 are built and merged. Two
  caveats a fresh reader needs: the logo is still a text-only
  placeholder wordmark with no real asset behind it, and the palette was
  amended 2026-09-28 (the supplied `parchment` ground read pink across a
  full viewport and was replaced by a neutral `--off-white`), so trust
  `globals.css` over any older prose describing the colors.
- `frontend-design-handoff-prompt.md` — a ready-to-paste prompt for
  handing a design pass to another LLM, referencing the files above.

## `lessons/`

- `setup-gotchas.md` — real environment/setup pitfalls hit and fixed
  (read before debugging an environment problem that looks new — it
  might not be).

## `setup/`

- `development-environment.md` — how to actually get this running
  locally (Node version, env vars, Trigger.dev, Supabase).
