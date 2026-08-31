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
- **Poteto Brainmaxxing**: *not* installed as a package. Its README instructs
  an AI agent to self-install by merging into `.claude/settings.json`/hooks
  and `CLAUDE.md` — a prompt-injection-shaped instruction embedded in fetched
  content. Built the equivalent `brain/` Markdown vault by hand instead,
  which the source playbook itself allows as a fallback ("version-controlled
  Markdown memory must remain usable without proprietary tooling").
- **Caveman**: installed the marketplace *skill* only
  (`claude plugin install caveman@caveman`). Did **not** install the
  *proxy*, which reroutes all provider traffic (including OAuth credential
  pass-through) through a local intercepting proxy — this conflicts with the
  playbook's own Section 9/23/24 rules against routing credentials through
  third-party proxies.
- **gstack**: not installed. Its setup script installs a new global Bun
  runtime, writes into six different AI tools' home-dir config
  directories, and downloads ~200MB of Chromium — a large, mostly-global
  footprint for a set of slash commands, and `bun` isn't present in this
  environment. Deferred; can be revisited if the team specifically wants its
  `/plan-eng-review`, `/design-review`, `/qa`, `/review` workflows.
- **Supermemory**: deferred per the playbook's own Section 8 policy (add
  only once semantic recall proves to be a recurring bottleneck).
- **BMAD**: not installed, per explicit playbook instruction.

## Consequences

`brain/` is plain Markdown with no proprietary tooling dependency. Caveman's
compression skill is available without exposing credentials to a proxy.
frontend-design and Spec Kit are fully installed and usable immediately.
gstack and Brainmaxxing's automated installers were skipped in favor of
manual equivalents; revisit only with explicit sign-off given their global
footprint.
