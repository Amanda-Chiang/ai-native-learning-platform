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

## Deferred / not installed

- gstack (global Bun runtime + six tools' home-dir configs; `bun` not
  present in this environment). See ADR-0001.
- Poteto Brainmaxxing as a package (built `brain/` by hand instead).
- Caveman's proxy component (credential-passthrough proxy).
- Supermemory (per playbook Section 8 — add only if semantic recall becomes
  a proven bottleneck).
- BMAD (explicitly excluded by playbook).

## Verify

- `specify check` — confirms Spec Kit integration health.
- `claude plugin list` — confirms `example-skills@anthropic-agent-skills`
  and `caveman@caveman` show as enabled.
- `npx playwright test` — runs the E2E/visual suite once fixtures exist.
