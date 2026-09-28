# Orca redesign — design & sequencing

**Status**: approved 2026-09-27, sequencing/decomposition doc — not a
single bite-sized plan. Built via `superpowers:brainstorming`, same
pattern `docs/implementation-roadmap.md` uses for the original PRD
phases: this doc answers *what order, what depends on what, what's
genuinely risky* — each numbered phase below gets its own
`superpowers:writing-plans` pass (or `/speckit-*` where the feature
warrants it) when its turn comes, not written wholesale now.

**Source**: hand-drawn wireframes (`UX_snapshots.pdf`, attached to this
project 2026-09-27) plus `brain/design-context/brand-identity.md`'s
already-approved Orca brand (name/logo/6-color palette, not yet
applied to any UI). This doc is where that palette actually gets used.

## What this replaces vs. leaves alone

This is a frontend redesign — pages, layout, navigation shell, visual
language. It deliberately does **not** touch:
- The Concept Atlas (React Flow + ELK node/edge graph) — confirmed
  explicitly during brainstorming as staying separate and unchanged;
  the wireframe's organic "island" imagery is a *new, different*
  screen (Home dashboard), not a re-skin of the Atlas.
- Any deterministic grading, evidence-commit, or ontology-reconciliation
  logic — every phase below reuses existing actions/checkers unchanged
  except where a phase explicitly says otherwise.

## Screen → backend compatibility (research summary)

Full findings from a live repo audit (file:line citations preserved in
this session's agent output, condensed here):

| Screen | Verdict | Note |
|---|---|---|
| Home dashboard, cross-course due list | Needs extension | `today.ts`'s `getTodayOverview` is currently single-course-scoped for daily items; needs a new cross-course aggregation over existing `getDueQueue`/`getDailyReviewSession` per course. No schema change. |
| Per-course Concepts list, each independently playable | Compatible as-is | `listCourses()` + per-course `getDailyReviewSession(courseId)` already gives this; new UI only. |
| Quick review quiz (one question at a time, progress %, Yes/No) | Compatible / minor extension | `getDailyReviewSession` already returns an ordered array; one-at-a-time is UI-only pagination. Yes/No is a 2-option `multiple_choice` row — no new answer-type needed. |
| Quiz end screen, same-session "start Deep review?" offer | Compatible as-is | No persistence — confirmed same-session-only during brainstorming, so this is pure client-side UI composed from the existing session's own results. |
| Configurations (Quick/Deep/Exam tiers + tunable weights) | New table needed | `ReviewPriorityWeights` already exists as a function parameter (`review-priority.ts`) but nothing persists a student's chosen weights/durations today — needs a new `review_preferences`-style table (user+course scoped). The ranking function itself needs no change. |
| Calendar (exam dates + future review-session dates) | Needs an ADR | Exam dates are already persisted/calendar-ready (`exam_configs.exam_date`). Review-scheduler deliberately never persists a future schedule (`specs/009-review-scheduler/data-model.md`) — showing future review dates on a calendar reverses that documented decision. Confirmed in scope by the user; sequenced late (Phase 7) specifically because it needs its own ADR before building, per `CLAUDE.md`'s "no new persistence layer without an ADR" rule. |
| Class/course creation | Compatible as-is | `createCourse(name)` already takes exactly a name field. |
| AI Chat entry point | Needs extension | `tutor_conversations.course_id` is a hard NOT NULL FK — resolved during brainstorming as a course-picker step before the first message, no schema change, tutor-grounding invariant untouched. |
| Material upload w/ type/coverage/due metadata + HW reflection | New columns needed | `artifacts` table has no material-type/coverage/due-date columns today. Additive, no ingestion-pipeline change. The HW "reflect" text field (below) needs its own evidence-boundary design. |
| Onboarding (intro yes/no branching) | Not designed yet | On hold — user will sketch it out before this is planned. |
| Deep review (endless one-at-a-time, non-MCQ, per-concept stream) | Not designed yet | On hold — user's own words: "isn't fully fleshed out yet." Explicitly last in sequence. |

## Key decisions made during brainstorming

- **Island shapes need real persistence, not a pure hash.** A pure
  `hash(course.id) % N` shape assignment breaks the moment the shape
  library grows (adding shape #31 would reshuffle every existing
  course's mod-N assignment). Instead: a new `courses.island_shape_index
  int` column, assigned once at course creation (`createCourse`) from
  the *current* library size, never recomputed. The shape library
  itself is a static, ordered, **append-only** array in code — shapes
  are only ever added at the end, never reordered or removed, so a
  stored index always points at the same visual shape forever. Color
  assignment can stay a cheap deterministic hash of `course.id` (no
  storage needed there — the 6-color palette isn't going to grow the
  way the shape library will).
- **Island shape library is placeholder-first.** No procedural
  generation and no hand-designed set exists yet — the user may
  commission a hand-designed ~30-shape set later. Phase 3 (Home
  dashboard) ships with an explicit, visually-obvious **placeholder**
  set (plain, uniform rounded-blob outlines, not styled to look
  finished) per this project's no-silent-placeholder rule — a
  placeholder must never look like real, finished art. Swapping in a
  real set later is a pure asset-replacement at the same stable
  indices; no schema or code change.
- **"Deep review" unlock is same-session only.** No persisted
  unlock-state table. The quiz end screen's "start Deep review?" offer
  is a same-session UI prompt only — re-asked fresh every time, nothing
  remembered across visits. This was deliberately chosen over a
  persisted-unlock design to avoid a new piece of learner state that
  would need its own evidence-boundary justification for no real
  product need yet.
- **HW "reflect" field is signal, not evidence.** When a student
  uploads completed homework and optionally writes free text like "I
  guessed on the Karnaugh-map question" or "I didn't understand XOR
  simplification," that text must not directly write learner mastery
  state (`CLAUDE.md`'s "exposure/self-report is not mastery" and
  "student flags are signal, not ontology truth" rules both apply — a
  self-report of confusion is even weaker than a flag, since it's
  unverified and self-selected). The Phase 5 spec must design this as
  a signal that nudges review-scheduler priority (e.g., boost priority
  for a self-flagged concept) or surfaces the concept for extra
  practice — never as a direct mastery-state write. This is called out
  explicitly here so Phase 5's own spec doesn't re-derive it loosely.
- **AI Chat stays course-scoped**, reached via a course-picker step
  from the new global nav entry — no DB constraint change.
- **Calendar scope includes future review-session dates**, which is a
  real scope increase over "exam dates only" and requires its own ADR
  (`brain/decisions/`) before Phase 7 starts, per `CLAUDE.md`.

## Build sequence

1. **Rebrand + app shell** — apply `brand-identity.md`'s palette/logo,
   replace the sidebar shell with the wireframe's bottom icon nav.
   Pure frontend, zero backend risk. *(Next: first sub-spec.)*
2. **Course creation + per-course Concepts screen + AI Chat
   course-picker entry** — mostly UI over existing actions.
3. **Home dashboard** — cross-course due-today/tomorrow aggregation +
   one placeholder island per course (`island_shape_index` migration).
4. **Quick review quiz flow** — one-question-at-a-time UI, Yes/No as
   2-option MCQ, end screen with the same-session Deep-review offer.
5. **Material upload w/ metadata + HW reflection** — new `artifacts`
   columns; the reflection-signal design called out above.
6. **Configurations screen** — Quick/Deep/Exam tiers + tunable weights;
   new `review_preferences` table.
7. **Calendar** — exam dates + future review-session dates; needs its
   own ADR first (documented persistence-layer decision).
8. **Onboarding** — on hold, awaiting the user's own sketch.
9. **Deep review** — on hold, explicitly last, not yet fleshed out.

Phases 8 and 9 are placeholders in this sequence, not committed
designs — they get brainstormed properly once sketched.

## Spec self-review

- Placeholder scan: none left unmarked — the one genuine placeholder
  (island shapes) is called out explicitly as visually-obvious and
  temporary, not a silent stand-in.
- Internal consistency: Atlas-untouched constraint matches
  `brand-identity.md`'s own "no UX/flow changes" note from the prior
  session (that note is now superseded by this doc for the flow
  portion; brand-identity.md still owns naming/logo/palette source of
  truth).
- Scope check: 9 phases is a lot, but each is independently
  shippable and only Phase 1 is being planned now — matches this
  project's established "sequence now, plan-in-detail per phase"
  pattern from `docs/implementation-roadmap.md`.
- Ambiguity check: the HW-reflection evidence boundary is flagged as
  needing its own design decision at Phase 5, not resolved here —
  intentional, not an oversight, since Phase 5 is several phases out
  and the exact mechanism (priority nudge vs. extra-practice flag)
  should be decided against Phase 5's real spec, not guessed now.
