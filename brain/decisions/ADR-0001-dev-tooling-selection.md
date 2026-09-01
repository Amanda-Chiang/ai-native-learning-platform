# ADR-0001: Development tooling selection

**Status:** Accepted
**Date:** 2026-08-31

## Context

`claude_code_project_setup_playbook.md` specified a development-environment
stack: GitHub Spec Kit, Poteto Brainmaxxing, Caveman, gstack, Superpowers,
Anthropic `frontend-design`, Playwright, and (deferred) Supermemory. Several
of these needed verification before installing — see
`brain/setup/development-environment.md` for what was actually run.

## Decision

- **Spec Kit**: installed via `uv tool install specify-cli` +
  `specify init --integration claude`. Clean, standard install; no concerns.
- **Superpowers**: already installed as a Claude Code plugin; used as-is.
- **`frontend-design`**: installed via the `example-skills@anthropic-agent-skills`
  plugin (bundles `frontend-design` alongside other Anthropic example
  skills).
- **Poteto Brainmaxxing**: **intentionally not installed.** Its README
  instructs an AI agent to self-install by merging into
  `.claude/settings.json`/hooks and `CLAUDE.md` — a prompt-injection-shaped
  instruction embedded in fetched content. More importantly, this repo
  already has an equivalent: the hand-built `brain/` Markdown vault, the
  `ADR-*` decision-record structure, and the project-memory rules in
  `CLAUDE.md` cover the same need, which the source playbook itself allows
  as a fallback ("version-controlled Markdown memory must remain usable
  without proprietary tooling"). **Do not install Brainmaxxing** unless a
  future need names a *specific* Brainmaxxing workflow (e.g. one of its
  `reflect`/`ruminate`/`meditate` skills) that the current `brain/` setup
  cannot provide — install for a demonstrated gap, not to have the tool.
- **Caveman**: installed the marketplace *skill* only
  (`claude plugin install caveman@caveman`). **Intentionally not
  installed: the proxy component.** It reroutes all provider traffic
  (including OAuth credential pass-through) through a local intercepting
  proxy, introducing a new credential/network trust boundary — this
  conflicts with the playbook's own Section 9/23/24 rules against routing
  credentials through third-party proxies. Keep only the local compression
  skill for now. **Reconsider the proxy only if** token cost becomes a
  demonstrated bottleneck (measured, not assumed) *and* someone explicitly
  audits its data/credential path first — both conditions, not either.
- **gstack**: **deferred, not rejected.** Its setup script installs a new
  global Bun runtime, writes into six different AI tools' home-dir config
  directories, and downloads ~200MB of Chromium — a large, mostly-global
  footprint for a set of slash commands — and `bun` isn't present in this
  environment, so **do not install Bun solely to unblock gstack.** The
  current stack already covers gstack's most relevant responsibilities:
  Spec Kit (planning), `frontend-design` (design quality), Playwright + the
  `qa-engineer` subagent (exploratory/regression QA), CI (release gating),
  and Superpowers (`systematic-debugging`, code review discipline). **If a
  concrete gap shows up later** in design review, exploratory browser QA,
  or engineering-plan review that the current setup doesn't cover,
  reevaluate installing gstack outright or reproducing just the specific
  workflow needed (e.g. one slash command) instead of the whole tool.
- **Supermemory**: deferred per the playbook's own Section 8 policy (add
  only once semantic recall proves to be a recurring bottleneck).
- **BMAD**: not installed, per explicit playbook instruction.

## Consequences

`brain/` is plain Markdown with no proprietary tooling dependency. Caveman's
compression skill is available without exposing credentials to a proxy.
frontend-design and Spec Kit are fully installed and usable immediately.
Brainmaxxing and the Caveman proxy are rejected outcomes with a named
condition for revisiting each (a specific missing workflow; an audited,
demonstrated cost bottleneck). gstack is an open, deferred decision, not a
rejection — it stays off the install list until a concrete workflow gap
appears that Spec Kit / frontend-design / Playwright / `qa-engineer` /
CI / Superpowers don't already cover.
