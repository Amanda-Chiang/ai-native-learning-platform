# Development Environment Setup Notes

Setup performed 2026-08-31 following `claude_code_project_setup_playbook.md`.
See `brain/decisions/ADR-0001-dev-tooling-selection.md` for the tooling
decisions and reasoning.

## Installed

- Spec Kit (`specify-cli` via `uv tool install`), initialized with
  `specify init --here --integration claude` -> `.specify/`,
  `.claude/skills/speckit-*`.
- `frontend-design` skill via `example-skills@anthropic-agent-skills`
  plugin.
- Caveman skill (marketplace only, no proxy) via
  `claude plugin marketplace add JuliusBrussee/caveman` +
  `claude plugin install caveman@caveman`. Conservative mode: use for repo
  exploration, grep/search agents, mechanical code-review findings, test-log
  summarization. Do **not** use for architecture, PRD changes, schema
  design, or security/privacy review (per playbook Section 9).
- Superpowers (already present).
- `brain/` Markdown vault (this tree), hand-built.
- Playwright (`tests/e2e`, `tests/fixtures`, `tests/visual`).
- `.claude/agents/` subagents: `frontend-engineer`, `backend-engineer`,
  `ai-evals-engineer`, `qa-engineer`.
- `.claude/skills/concept-atlas/`, `.claude/skills/learner-graph/`,
  `.claude/skills/assessment-pipeline/` project skills.

## Intentionally not installed / deferred

Full rationale in ADR-0001. Short version:

- **Poteto Brainmaxxing — not installed, by design.** `brain/`, the
  `ADR-*` structure, and the project-memory rules in `CLAUDE.md` already
  cover what Brainmaxxing would provide. Don't install it unless a future
  need names a specific Brainmaxxing workflow this setup lacks.
- **Caveman proxy — not installed, by design.** Only the local compression
  skill is installed. The proxy adds a credential/network trust boundary
  (all provider traffic, including OAuth pass-through, through a local
  intercepting proxy). Reconsider only if token cost becomes a *demonstrated*
  bottleneck **and** the proxy's data/credential path is explicitly audited
  first.
- **gstack — deferred, not rejected.** Do not install Bun solely to unblock
  it. Its responsibilities are already covered: Spec Kit (planning),
  `frontend-design` (design quality), Playwright + `qa-engineer` (QA),
  CI (release gating), Superpowers (debugging/review discipline).
  Reevaluate if a concrete gap appears in design review, exploratory
  browser QA, or engineering-plan review that this stack doesn't cover —
  and consider reproducing just the needed workflow before installing the
  whole tool.
- Supermemory (per playbook Section 8 — add only if semantic recall becomes
  a proven bottleneck).
- BMAD (explicitly excluded by playbook).

## Verify

- `specify check` — confirms Spec Kit integration health.
- `claude plugin list` — confirms `example-skills@anthropic-agent-skills`
  and `caveman@caveman` show as enabled.
- `npx playwright test` — runs the E2E/visual suite once fixtures exist.
