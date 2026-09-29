# AI-Native Learning Platform

An AI-native learning platform built as a responsive web application, per
`docs/technical-prd.md`, sequenced via `docs/implementation-roadmap.md`.

**Rebrand (2026-09-27)**: the product is now **Orca** — name, palette,
and app shell applied across every page (`brain/design-context/
brand-identity.md`, Phase 1 of `docs/superpowers/specs/
2026-09-27-orca-redesign-design.md`). The logo is still a text-only
placeholder wordmark pending a real asset file.

**Redesign phases 1–4 are built and merged to `main`.** Phase 1 was the
rebrand and app shell; Phase 2 the per-course Concepts screen, a
top-level AI Chat tab and a create-course modal; Phase 3 the island Home
dashboard with its review rail; Phase 4 the quick-review quiz flow that
replaced `/courses/{id}/study`. Phases 5–9 (material upload, review
configuration, calendar, onboarding, deep review) are scoped in the
parent design doc's build sequence but have no per-phase design or plan
yet. Per-phase docs that do exist:
`docs/superpowers/specs/2026-09-28-orca-phase2-concepts-chat-design.md`,
`docs/superpowers/specs/2026-09-28-orca-phase3-home-dashboard-design.md`,
`docs/superpowers/specs/2026-09-29-orca-phase4-quick-review-design.md`,
and their plans under `docs/superpowers/plans/`. The Phase 4 design doc
carries an amendment at the end (the progress bar counting skipped
questions) — read it, not just the body, which states the superseded
rule.
The palette was amended 2026-09-28: the supplied `parchment` ground read
pink across a full viewport and was replaced by a neutral `--off-white`
(`brain/design-context/brand-identity.md`).

**Status (2026-09-29)**: All six roadmap phases fully implemented and
verified live, plus Orca redesign phases 1–4, plus a long tail of
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
`superpowers:subagent-driven-development` end to end — and, most
recently, Orca redesign Phase 4 (the quick-review quiz flow, described
below), after which visual regression moved to a single macOS-only
baseline set. The heavy (checker-domain/free-text)
assessment-generation path is still real, tested, and unwired to any
UI — a known, separate, still-open gap. See
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

Orca Phase 4 — the quick-review quiz flow — **is built and merged to
`main`**. `/courses/{id}/study` was replaced in place: one question at
a time, a progress percentage, Yes/No handled as a 2-option multiple
choice, immediate feedback, a Skip that commits no evidence, a
skip-confirmation dialog before finishing, and an end screen with a
visibly-disabled deep-review offer. Home's ▷ controls still link to
that same `/courses/{id}/study` route — Phase 4 changed what the route
renders, not where anything points.

Two behaviours are easy to misread from an older description, so state
them exactly:

- **Navigation is back-anywhere, forward-only-once-addressed.** The `‹`
  control is always available. Forward motion is `Skip` while a
  question is unanswered and `Next` (or `Finish`, on the last question)
  once it is answered — a bare "Next" past an unanswered question does
  not exist. It used to, and that created a third state neither
  answered nor skipped: a student could press through the whole session
  and reach the end with nothing recorded, no confirmation dialog, and
  an end screen reading "0/0 correct". Folding forward motion into Skip
  means every question leaves with one of two recorded outcomes.
- **The progress bar counts skipped questions.** It reports how far
  through today's review you are, not how well you are doing — a
  skipped question has been dealt with. Correctness is reported
  separately (the end screen's `N/M correct` and skipped count). A
  submission that *failed to grade* still does not advance the bar,
  since it stays answerable.

See `docs/implementation-roadmap.md`'s Phase 4 entry and the
`brain/decisions/architecture-log.md` entries dated 2026-09-29 for the
full account, including the real bugs the build found — two of which
were written into the plan document's own code samples and have since
been corrected there. Those entries are also the clearest worked
example in the repo of how this project expects a feature to be built
and reviewed.

**CI as of 2026-09-29 — read this before you debug a red run.**

CI has **two jobs** (this layout is new): `quality-gates` — lint,
typecheck, build — on Linux, because that is what the deployment target
runs; and `e2e-visual` — Playwright — on macOS, because that is where
the visual baselines are authored (trap 4 explains why that matters).
Branch protection configured against the old single-job name needs to
add `e2e-visual`, or the visual suite will not block a merge.

**Local state on `main` is fully green**: typecheck clean, eslint 0
errors (8 pre-existing warnings), 405/405 unit, and Playwright across
`tests/visual` + `smoke` + `basic-flows` + `quick-review-flow` at 31
passed / 3 skipped / 0 failed (the 3 skips are the unrelated
`tutor-agent-e2e` project).

**CI has not actually run on any of this yet** — `main` is ahead of
`origin/main` and unpushed. Lint, typecheck and build were green on CI
before the Phase 4 merge, and nothing in it touches their inputs.

When CI does run, expect **one known failure**, and it is not a defect
in the code under test: `tests/e2e/course-graph-ingestion-pipeline.spec.ts`
— the one spec that makes a real, un-doubled model call — fails with
`429 You have no credits remaining`. The OpenAI account has no credits.
Adding credits should turn it green with no code change. Don't go
looking for a bug in the ingestion pipeline.

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

**Six traps that will cost you an hour each if you don't know them:**

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
4. **Visual baselines are macOS-only, on purpose — there are no
   `-linux` baselines any more.** Playwright suffixes snapshot files by
   platform because a browser hands glyph rasterization to the OS
   (CoreText on macOS, FreeType on Linux) and lets the OS draw native
   form controls, so identical CSS yields slightly different pixels per
   platform. That difference is invisible in production — a user only
   ever sees one platform — but it breaks an image comparison run
   across two. This repo used to keep both sets, which meant every
   visual change needed a one-off workflow temporarily committed to
   `main` to regenerate the Linux half on a matching runner: seven such
   cycles, zero real bugs caught. CI's `e2e-visual` job now runs on
   `macos-latest`, so the baselines you generate locally are the ones
   CI compares against, and `--update-snapshots=all` is the whole
   procedure. `quality-gates` (lint/typecheck/build) stays on Linux,
   because that is what the deployment target runs.

   Worth knowing if you read older entries in the architecture log or
   git history: `regen-linux-snapshots.yml` and the add-dispatch-remove
   ritual around it are gone, not merely unused.

5. **A Supabase client built without the `<Database>` generic gives you
   no compile-time column checking.** `tests/e2e/global-setup.ts` was
   the last such client; a missing `not null` column there failed at
   runtime and broke Playwright's *global* setup — so every spec, not
   one. Typing it immediately surfaced three more missing-column bugs in
   fixture inserts. If you add a migration with a `not null` column,
   grep the whole repo for inserts into that table including multi-line
   chains — a single-line grep pattern missed one during Phase 3.

6. **A Playwright screenshot can make a page report a hydration error
   that does not exist in the product.** Playwright hides the text caret
   before capturing by writing `caret-color` directly into the inline
   `style` of every `input`, `textarea` and `[contenteditable]`
   (`playwright-core`'s injected screenshot helper). On a slower runner
   that mutation interleaves with React hydration, React compares its
   own markup against an already-modified DOM, and the captured image
   comes back wearing Next's red "1 Issue" badge. This cost a real
   session an investigation: Phase 4's first Linux baselines showed the
   badge on the two question screens and nowhere else, and the clean
   end-screen capture — the one screen rendering no inputs at all — is
   what identified the cause. The fix is `caret: "initial"` on the
   screenshot call, which opts out of the mutation; it is pixel-neutral
   wherever there is no visible caret to hide. `tests/visual/quick-review.spec.ts`
   does this and says why. If you write a visual spec that captures a
   form, do the same.

**Fixed, so you won't hit it, but worth knowing why baselines changed:**
visual baselines used to capture the Next.js dev-mode route-status
indicator, which made snapshots churn with no code change behind it.
`next.config` now sets `devIndicators: false`. If you ever see a
baseline diff whose only visible change is a small badge in a corner,
that is the class of problem.

Note what that setting does **not** do: it removes the always-present
route-status pill, but per Next's own docs it still surfaces real
compile and runtime errors. So a red "1 Issue" badge in a captured image
is not the old churn returning — it means the page genuinely logged an
error during that capture, and it is worth finding out why before you
re-baseline over it. Trap 6 above is the case that has actually
happened here.

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
- **A `.env.local` with real credentials.** This project talks to a live
  Supabase project, a real OpenAI account, E2B for sandboxed code
  grading, and Trigger.dev for background jobs. Almost nothing works
  without it — not `npm run dev` past the first authenticated page, and
  not the e2e suite at all.

## First run, in order

```bash
nvm use 24          # not optional; default node here is v16
npm install
cp .env.example .env.local   # then fill it in, see below
npx next typegen    # see note below — do this before typecheck
npm run dev         # http://localhost:3000
```

**Filling in `.env.local`.** `.env.example` documents every variable and
where in each provider's dashboard to find it. Five matter:

| Variable | Sensitivity |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public (browser-exposed) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public — RLS, not this key, enforces isolation |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret** — bypasses RLS |
| `OPENAI_API_KEY` | **secret** |
| `TRIGGER_SECRET_KEY` | **secret** |

If you are an agent: ask the human to paste the secret ones into the
file themselves. Never print a service-role or API key into a
conversation, a log, a commit, or a report.

CI reads the same values from repository secrets (Settings → Secrets and
variables → Actions), which is why a fresh CI checkout can run the e2e
suite at all.

**`npx next typegen` before your first typecheck.** `tsconfig.json`
includes `.next/types/**/*.ts` and `.next/dev/types/**/*.ts`, and
`src/app/layout.tsx` uses the generated `LayoutProps<"/">` type. On a
checkout with no `.next/` directory, `npm run typecheck` therefore fails
with exactly:

```
src/app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'.
```

`next dev` and `next build` generate those types as a side effect;
`tsc` does not. `npx next typegen` alone is enough to fix it (verified
by deleting `.next/` and running it). CI runs it explicitly before
typecheck for this reason. This bites hardest in a fresh git worktree,
which starts with no `.next/` at all — if you see that error, you have
not hit a real type bug.

## Verifying your work

Run these before claiming anything is done — the project's rules require
evidence, not assertion.

```bash
npm run typecheck                   # tsc --noEmit
npx eslint src tests trigger        # expect 0 errors, 8 pre-existing warnings
npm run test:unit                   # node --test, ~405 tests, no database needed
npm run test:e2e                    # Playwright: e2e + visual, needs .env.local
```

`npm run test:unit` is pure-function tests only — it runs on plain
`node --test` with no browser and no database, which is why the decision
logic in this codebase lives in alias-free modules rather than inside
React components. There is **no component-test tooling** (no jsdom, no
testing-library); component behaviour is covered by Playwright instead.

Before any Playwright run, check `lsof -ti:3000` is empty — see trap 2.

To run a subset (much faster than the whole suite):

```bash
npx playwright test tests/visual/quick-review.spec.ts
npx playwright test tests/visual tests/e2e/smoke.spec.ts
```

Note that `npm run test:e2e` includes
`tests/e2e/course-graph-ingestion-pipeline.spec.ts`, which makes a real
model call and currently fails on billing — see the CI section above
before treating that failure as yours.

## Repository structure

```text
/
├── src/
│   ├── app/             # Next.js App Router pages/layouts; (app)/ is the
│   │                    #   authenticated shell, route groups in parens
│   ├── components/      # Shared UI (app-shell, course-shell, icons)
│   ├── features/        # One directory per feature -- where most code lives
│   ├── lib/             # Supabase clients, generated database.types.ts
│   └── types/           # Shared domain/graph types
├── supabase/migrations/ # SQL migrations, applied to a live project
├── trigger/             # Trigger.dev background tasks
├── tests/
│   ├── unit/            # node --test, pure functions, no DB/browser
│   ├── e2e/             # Playwright behaviour specs (+ global setup/teardown)
│   ├── visual/          # Playwright screenshot specs + committed baselines
│   └── fixtures/        # Checked-in JSON fixtures for ?demo=1 routes
├── specs/NNN-*/         # Spec Kit features: spec, plan, tasks, contracts
├── docs/
│   ├── technical-prd.md         # full requirements
│   ├── implementation-roadmap.md # phase sequencing + post-MVP + open items
│   └── superpowers/             # specs/ and plans/ for non-Spec-Kit work
├── brain/               # durable context: architecture, decisions, lessons
│                        #   (brain/README.md indexes it; read before
│                        #    touching a subsystem)
├── benchmark/           # extraction benchmark corpus
├── UX_snapshots.pdf     # hand-drawn wireframes, source of truth for the redesign
├── .env.example         # every environment variable, documented
└── ...standard Next.js config files
```

**Where to put new code.** Feature logic goes in
`src/features/<feature>/`, with the pure, testable rules in plain
modules (relative imports only, so `node --test` can load them) and the
database-touching parts in `actions.ts` marked `"use server"`.
Components live in `src/features/<feature>/components/`. That split is
not cosmetic — it is what makes anything testable here, given there is
no component-test tooling.

## Documentation

Product and technical documentation lives under [`docs/`](./docs).
