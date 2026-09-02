# AI-Native Learning Platform

An AI-native learning platform built as a responsive web application, per
`docs/technical-prd.md`, sequenced via `docs/implementation-roadmap.md`.

**Status (2026-09-01)**: Phases 0-5 fully implemented and verified live
(schemas + benchmark corpus, Supabase Auth/Postgres/RLS/Storage/Trigger.dev
foundation, course-graph ingestion with a real OpenAI extraction pipeline,
React Flow + ELK concept atlas renderer, evidence-backed learner state
with a recompute-from-log mastery algorithm, a tool-using tutor agent
with grounded/paced/evidence-backed conversation, five property-validating
DSA checkers with real E2B-sandboxed code grading and rubric-constrained
text grading, a candidate-generation pipeline that grounds a question
in real course material and validates it through six layers before
persisting only a fully-validated question, a deterministic
review-priority ranking driving a bounded daily session and a weekly
"Connect" session, and an exam planner that turns a configured exam
date/scope into a staged plan ramping from diagnostic through
interleaving, timed-mixed, and final-weakness practice — reusing the
review scheduler's own ranking/selection unchanged — plus a real-time
readiness view). See `specs/` for the authoritative
per-feature status: each
`specs/NNN-*/tasks.md` tracks its own checkboxes accurately. For a
chronological record of major design decisions and why, see
`brain/decisions/architecture-log.md`.

If you're an agent picking this project up cold: read `CLAUDE.md` and
`AGENTS.md` first (durable rules), then `docs/implementation-roadmap.md`
for phase sequencing, then the highest-numbered `specs/NNN-*/tasks.md`
for exactly what's done and what's next — do not assume this file or the
roadmap's own prose is more current than that.

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
