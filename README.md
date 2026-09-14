# AI-Native Learning Platform

An AI-native learning platform built as a responsive web application, per
`docs/technical-prd.md`, sequenced via `docs/implementation-roadmap.md`.

**Status (2026-09-14)**: All six roadmap phases fully implemented and
verified live, plus a long tail of post-completion hardening and
enhancement passes — a browser/Playwright hardening pass (RLS gaps,
Server/Client boundary violations, an unsanitized Storage filename,
missing input bounds), a full design-system reskin, a unit-extraction &
reconciliation rework for `course-graph-ingestion`, a review-queue
popup fix, a CI hardening pass that took `quality-gates` from
never-once-green to genuinely green, and — most recently — a real,
user-reported bug/polish batch (header, page-fill layout, a stale-style
React bug found and fixed three separate times, a raw-UUID display bug,
an exam-scope UUID text field replaced with a real picker, an
extraction-validation gap) plus a new feature: an automatic lightweight
daily multiple-choice quiz, closing a real gap where `question_bank`
had sat empty in every real course because the existing heavy
assessment-generation pipeline was built but never wired to any UI.
That heavy pipeline is still unwired — a known, separate, still-open
gap. See `brain/decisions/architecture-log.md`'s entries from
2026-09-02 onward, and `docs/implementation-roadmap.md`'s "Post-MVP
work" + "Known open items" sections, for the full current list; this
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

If you're an agent picking this project up cold, read in this order:

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

Not every real feature in this repo went through Spec Kit's numbered
`specs/NNN-*` flow — some (design/reskin passes, enhancements to an
already-shipped feature) were built via `superpowers:brainstorming` →
`superpowers:writing-plans` → `superpowers:subagent-driven-development`
instead, living under `docs/superpowers/specs/` and
`docs/superpowers/plans/`. The roadmap's "Post-MVP work" section is the
index into those — don't assume `specs/` is the complete list of what
this repo does.

## Prerequisites

- Node.js 18.18+ (or 20+)
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
