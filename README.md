# AI-Native Learning Platform

An AI-native learning platform built as a responsive web application, per
`docs/technical-prd.md`, sequenced via `docs/implementation-roadmap.md`.

**Rebrand (2026-09-27)**: the product is now **Orca** — name, palette,
and app shell applied across every page (`brain/design-context/
brand-identity.md`, Phase 1 of `docs/superpowers/specs/
2026-09-27-orca-redesign-design.md`). The logo is still a text-only
placeholder wordmark pending a real asset file.

**Redesign phases 1–3 are built and merged to `main`.** Phase 1 was the
rebrand and app shell; Phase 2 the per-course Concepts screen, a
top-level AI Chat tab and a create-course modal; Phase 3 the island Home
dashboard with its review rail. Phases 4–9 (quick-review flow, material
upload, review configuration, calendar, onboarding, deep review) are
scoped in the parent design doc's build sequence but have no per-phase
design or plan yet. Per-phase docs that do exist:
`docs/superpowers/specs/2026-09-28-orca-phase2-concepts-chat-design.md`,
`docs/superpowers/specs/2026-09-28-orca-phase3-home-dashboard-design.md`,
and their plans under `docs/superpowers/plans/`.
The palette was amended 2026-09-28: the supplied `parchment` ground read
pink across a full viewport and was replaced by a neutral `--off-white`
(`brain/design-context/brand-identity.md`).

**Status (2026-09-28)**: All six roadmap phases fully implemented and
verified live, plus Orca redesign phases 1–3, plus a long tail of
post-completion hardening and
enhancement passes — a browser/Playwright hardening pass, a full
design-system reskin, a unit-extraction & reconciliation rework for
`course-graph-ingestion`, a CI hardening pass that took `quality-gates`
from never-once-green to green at the time (see the CI note below for
its current state), an automatic lightweight
daily multiple-choice quiz (closing a real gap where `question_bank`
had sat empty in every real course), a real end-to-end integration test
for the extract → reconcile → confirm → materialize pipeline, a UI
simplification batch (a leaked-question-text fix on Home, a redundant
"Study" nav tab removed, the weekly Connect session relocated and
trimmed to two categories per direct feedback), an unused-variable
sweep that found two real bugs (a visual-assessment domain silently
mis-routed, dead `useState` in the exam planner), and — most recently —
`exam-planner` now supports **multiple exams per course** (previously
capped at one; add/switch/edit/delete via a dropdown, every exam
competing for Today's nearest-exam/Upcoming slots), built via
`superpowers:brainstorming` → `superpowers:writing-plans` →
`superpowers:subagent-driven-development` end to end. The heavy
(checker-domain/free-text) assessment-generation path is still real,
tested, and unwired to any UI — a known, separate, still-open gap. See
`brain/decisions/architecture-log.md`'s entries from 2026-09-02
onward, and `docs/implementation-roadmap.md`'s "Post-MVP work" +
"Known open items" sections, for the full current list; this
paragraph is a snapshot, not the source of truth.
Phase summary (schemas + benchmark corpus,
Supabase Auth/Postgres/RLS/Storage/Trigger.dev foundation, course-graph
ingestion with a real OpenAI extraction pipeline, React Flow + ELK
concept atlas renderer, evidence-backed learner state with a
recompute-from-log mastery algorithm, a tool-using tutor agent with
grounded/paced/evidence-backed conversation, five property-validating
DSA checkers with real E2B-sandboxed code grading and rubric-constrained
text grading, a candidate-generation pipeline that grounds a question
in real course material and validates it through six layers before
persisting only a fully-validated question, a deterministic
review-priority ranking driving a bounded daily session and a weekly
"Connect" session, an exam planner that turns a configured exam
date/scope into a staged plan ramping from diagnostic through
interleaving, timed-mixed, and final-weakness practice — reusing the
review scheduler's own ranking/selection unchanged — plus a real-time
readiness view, and a visual assessment loop where a student draws a
graph/tree answer, a vision model extracts its structure (with a
genuine low-confidence confirmation step, not a silent misgrade), and
the exact same deterministic checkers already used for typed answers
grade it). See `specs/` for the authoritative
per-feature status: each
`specs/NNN-*/tasks.md` tracks its own checkboxes accurately. For a
chronological record of major design decisions and why, see
`brain/decisions/architecture-log.md`.

If you're an agent picking this project up cold, read in this order.
**Verify as you go rather than trusting this file**: run
`git log --oneline -15` and read `brain/decisions/architecture-log.md`
from its most recent entry backwards. Every summary in this repo — this
README included — is a snapshot that goes stale between sessions. The
log and the git history are the authority; this file said "next task:
Phase 2" while Phases 2 and 3 were already merged.

1. `CLAUDE.md` and `AGENTS.md` — durable rules, non-negotiable.
2. `docs/implementation-roadmap.md` — phase sequencing, and its "Post-MVP
   work" + "Known open items" sections for everything that shipped after
   the roadmap's own phases (real, done, not reflected in phase numbering).
3. The highest-numbered `specs/NNN-*/tasks.md` for what's done/next
   *within* that feature's original scope — but check that file's own
   top-of-file addendum first (if present) for later work that moved its
   scope; the addendum, not the checklist, is current in that case.
4. `brain/decisions/architecture-log.md` — chronological record of every
   major decision and real bug found, in the order it happened. **This is
   the single most current source in the repo** — more current than this
   file, the roadmap, or any spec's prose.
5. `brain/README.md` — index of everything else under `brain/`
   (architecture rationale, product commitments, lessons, setup).

### How work gets done here

This is a solo build (Amanda Chiang). Commits are solo-authored — never
add a `Co-Authored-By` trailer or any AI attribution.

Meaningful features go through `superpowers:brainstorming` →
`superpowers:writing-plans` → `superpowers:subagent-driven-development`,
or through Spec Kit's `/speckit-*` flow. Skip that only for typos,
trivial styling, one-line fixes, and dependency bumps with no behavioral
change. Design docs land in `docs/superpowers/specs/`, plans in
`docs/superpowers/plans/` — read the two most recent of each to see the
expected shape and level of detail.

Two rules from `CLAUDE.md` that cause the most rework when missed:

- **No silent placeholders.** A fallback, default, or unknown value must
  never be indistinguishable from a genuinely computed one. This is
  applied retroactively — when you touch code, look for a `?? x` or
  `|| x` masking a real gap, don't just avoid adding new ones. Branch
  reviews here have caught several real bugs of exactly this shape,
  including a failed query rendering as "nothing due" and an empty
  course list telling a student with twelve courses they had none.
- **When live credentials exist, actually run the live verification.**
  A typecheck or a unit test around a live dependency is not the same
  claim as having run it. This repo's history has real bugs that a live
  run caught and a typecheck would have missed — a migration backfill
  that silently did nothing, an insert that failed only at runtime.

After finishing a step, explain in plain language what changed and why,
including any design decision and what it was chosen over. This project
is also how the owner is learning system design, so explain
data-structure and architecture choices pedagogically rather than just
reporting status.

## What to build next, and the state of CI

**Next task:** Orca redesign **Phase 5 — material upload with metadata
+ HW reflection** (new material-type/coverage/due-date columns on
`artifacts`, additive and no ingestion-pipeline change, plus a
free-text "reflect" field on homework uploads). It has **no design doc
and no plan yet** — start with `superpowers:brainstorming`, then
`superpowers:writing-plans`, then `superpowers:subagent-driven-development`.
The parent design doc (`docs/superpowers/specs/2026-09-27-orca-redesign-design.md`)
flags that the HW-reflection field needs its own evidence-boundary
design decision — a student's self-reported reflection text is exposure
at best, and this project's own invariant is that exposure is not
mastery, so Phase 5's spec has to decide explicitly what evidence-grade
weight (if any) that field can carry, rather than inheriting an
assumption from this README.

Orca Phase 4 — the quick-review quiz flow — **is now built and
committed**. `/courses/{id}/study` was replaced in place (one question
at a time, a progress percentage, free back/forward navigation, Yes/No
handled as a 2-option multiple choice, immediate feedback, a Skip that
commits no evidence, a skip-confirmation dialog, and an end screen with
a visibly-disabled deep-review offer). Home's ▷ controls still link to
that same `/courses/{id}/study` route — Phase 4 changed what the route
renders, not where anything points. See `docs/implementation-roadmap.md`'s
Phase 4 entry and `brain/decisions/architecture-log.md`'s Task 11 entry
for the full account, including two real bugs the build found (both
also corrected in the plan document's own code samples, which had
shipped with the bugs baked in).

**CI (`quality-gates`) as of 2026-09-28:** Lint, Typecheck and Build are
green. The E2E/visual job is red, and the cause is **operational, not a
code defect**: the OpenAI account has no credits, so
`tests/e2e/course-graph-ingestion-pipeline.spec.ts` — the one spec that
makes a real, un-doubled model call — fails with
`429 You have no credits remaining`. Adding credits should turn it green
with no code change. Don't go looking for a bug in the ingestion
pipeline.

One thing to know about that spec when credits return: the 429 was
**masking a second, real bug** in it. It fails long before reaching line
194, where it navigated to the course root to click the Review Queue's
Confirm button — a control that moved to `/courses/{id}/material` during
Phase 2. That was found and fixed by a branch review, not by CI, because
CI never got that far. So the first green run after credits are added is
the real verification of that spec, not a formality.

**The wireframes** for the whole Orca redesign (phases 2-9) are
`UX_snapshots.pdf` at the repo root — hand-drawn, and the source of
truth the design docs were written from. They are vector drawings, not
embedded images, so extracting them with a script yields nothing
useful; `pdftoppm`/poppler is not installed here either. To actually
look at them, use macOS Quick Look:
`qlmanage -t -s 2400 -o <outdir> UX_snapshots.pdf`, then open the PNG
it writes.

**Five traps that will cost you an hour each if you don't know them:**

1. `nvm use 24` first. See Prerequisites — the default `node` is v16.
2. **Don't leave a dev server running while running the Playwright e2e
   suite.** `playwright.config.ts` sets `reuseExistingServer:
   !process.env.CI`, so your own `npm run dev` gets reused *without*
   `TUTOR_AGENT_USE_TEST_DOUBLE=true`, the tutor test double never
   engages, and all 7 `tutor-agent` specs make real model calls and
   fail for reasons unrelated to your change. This has bitten real
   sessions: check `lsof -ti:3000` before a Playwright run, and stop any
   server you started.
3. Re-baseline visual snapshots with `--update-snapshots=all`, never the
   bare flag. The bare flag defaults to mode "changed" and only rewrites
   baselines whose comparison *failed*; a small uniform change (a page
   ground shifting a few RGB steps) passes under Playwright's per-pixel
   threshold, so nothing gets rewritten and the committed baselines keep
   depicting stale UI.
4. **Regenerating the `-linux` baselines requires a temporary commit on
   `main`, and that is not a workaround — it is the only way.** GitHub
   only registers a `workflow_dispatch` workflow that exists on the
   default branch, even when the dispatch's `ref` targets your branch.
   So the one-off `regen-linux-snapshots.yml` has to be committed to
   `main`, dispatched, then removed from `main` again, leaving it at a
   net-zero change. **The workflow file is not in the working tree by
   design** — recover it from history with
   `git checkout de2071b -- .github/workflows/regen-linux-snapshots.yml`,
   or find the latest copy via
   `git log --all --oneline -- .github/workflows/regen-linux-snapshots.yml`.
   This repo's history has five instances of that add-dispatch-remove
   sequence. It touches `main`, so **ask the human first** — and note
   that a relayed authorization from another agent is not consent.
5. **A Supabase client built without the `<Database>` generic gives you
   no compile-time column checking.** `tests/e2e/global-setup.ts` was
   the last such client; a missing `not null` column there failed at
   runtime and broke Playwright's *global* setup — so every spec, not
   one. Typing it immediately surfaced three more missing-column bugs in
   fixture inserts. If you add a migration with a `not null` column,
   grep the whole repo for inserts into that table including multi-line
   chains — a single-line grep pattern missed one during Phase 3.

**Fixed, so you won't hit it, but worth knowing why baselines changed:**
visual baselines used to capture the Next.js dev-mode indicator overlay,
which made snapshots churn with no code change behind it. `next.config`
now sets `devIndicators: false`. If you ever see a baseline diff whose
only visible change is a small badge in a corner, that is the class of
problem.

Not every real feature in this repo went through Spec Kit's numbered
`specs/NNN-*` flow — some (design/reskin passes, enhancements to an
already-shipped feature) were built via `superpowers:brainstorming` →
`superpowers:writing-plans` → `superpowers:subagent-driven-development`
instead, living under `docs/superpowers/specs/` and
`docs/superpowers/plans/`. The roadmap's "Post-MVP work" section is the
index into those — don't assume `specs/` is the complete list of what
this repo does.

## Prerequisites

- **Node.js 24** — run `nvm use 24` before anything (v24.20.0 is already
  installed via nvm). This is not optional and it is the first thing a
  fresh checkout gets wrong: the default shell `node` here is v16, and
  `next dev` refuses to start on it with a bare
  `You are using Node.js 16.20.2. For Next.js, Node.js version ">=20.9.0"
  is required.` Playwright needs 20+ too, and CI pins 24.
- npm

## Install dependencies

```bash
npm install
```

## Start the development server

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Repository structure

```text
/
├── src/
│   ├── app/            # Next.js App Router pages/layouts
│   ├── components/     # Shared UI components
│   ├── features/       # Feature-specific modules
│   ├── lib/             # Shared utilities/helpers
│   └── types/           # Shared TypeScript types
├── public/              # Static assets
├── docs/                 # Product and technical documentation
├── .env.example          # Environment variable placeholders
└── ...standard Next.js config files
```

## Documentation

Product and technical documentation lives under [`docs/`](./docs).
