# Orca Phase 4 — Quick Review Quiz Flow Design

**Status:** Approved, ready to plan
**Date:** 2026-09-29
**Parent:** `docs/superpowers/specs/2026-09-27-orca-redesign-design.md` (Phase 4
of its build sequence)
**Predecessor:** `docs/superpowers/specs/2026-09-28-orca-phase3-home-dashboard-design.md`

## Scope

Replace `/courses/<id>/study` — today's working daily review session,
rendered as one scrolling list of every item — with the wireframe's
one-question-at-a-time quiz: a progress bar and percentage, a single
question per screen, free back/forward navigation, a skip that commits
nothing, and an end screen reporting the real score and the concepts
covered.

This is a UI change over an unchanged backend. `getDailyReviewSession`
already returns an ordered `SessionItem[]`, so one-at-a-time is
pagination over an array we already have. Yes/No is a two-option
`multiple_choice` row, so no new answer type is needed. Grading,
evidence, and ranking are untouched: every answer routes through the
existing `submitTextReviewAnswer` / `submitStructuredReviewAnswer` /
`submitMultipleChoiceReviewAnswer` actions exactly as the current page
does.

Out of scope, and deliberately: Deep review (Phase 9, on hold — the end
screen's offer ships visibly disabled, see below), review configuration
(Phase 6), and any change to question generation or the review
scheduler's ranking.

## What the wireframe shows

`UX_snapshots.pdf` has two panels for this phase. The quiz screen: an
orange progress bar with "49%" beside it, the question ("Is this XOR
truth table accurate?") with a figure, two lettered pill options
(Ⓐ Yes, Ⓑ No), and a `Next` button bottom-right. Neither panel shows
the bottom nav that the Home and Concepts panels do.

The end screen: an ✕ top-left, "Go to next task" top-right, the
headline "Keep going. Keep growing.", "Do a deep review to level 4",
"4/4 correct", a "Concepts covered in this review" list, and `Done`
bottom-right.

We build all of it except the ✕, with the changes below, each explained.

## Decisions

### Replace `/study` in place rather than adding a second route

Every existing entry point — Home's ▷, the Review page, the e2e specs —
already points at `/courses/<id>/study`. Rewriting that route means no
link changes anywhere and, more importantly, one review UI instead of
two divergent ones over the same session data. Phase 3 anticipated this
exactly: its ▷ links to the working `/study` flow precisely so that
Phase 4 "changes the destination, not the control". Here the
destination does not even change.

The old list-rendering `StudySession.tsx` is deleted, not kept behind a
flag. Two UIs over one data source is how screens drift apart.

### Every modality is paginated, not just multiple choice

`composeDailySession` returns whatever question the bank holds for each
due concept: text, structured (a checker domain like graph or tree), or
multiple choice. The wireframe only draws an MCQ, but filtering the
session down to MCQs would silently drop due concepts from a student's
review — the session would look complete while skipping work.

So the flow paginates every item, dispatching on modality: MCQ gets the
lettered pill options from the sketch, text gets a textarea, structured
gets the existing `StructuredAnswerForm`. All three forms already
exist and are reused unchanged.

The honest cost: "quick" review can hand a student a graph-drawing
task. That is a question-bank composition question, not a UI question,
and hiding it in the UI would hide it from the person who could fix it.

### Feedback is immediate, not saved for the end screen

The wireframe implies options → `Next` → score at the end. We show the
outcome the moment it is submitted instead.

The outcome is already known at that point — the answer commits real
evidence through the existing grading actions synchronously — so
withholding it is a deliberate choice to show the student less than we
know. Retrieval practice is also at its most useful when feedback
arrives while the attempt is still in working memory; batching it to
the end delays it to when it is least actionable. The end screen still
reports the total, so nothing the sketch shows is lost.

### Skip commits nothing, and never penalizes mastery

A student can skip any question. Skipping writes no evidence row, makes
no mastery change, and advances to the next question — the skipped
question stays in place, since the student can navigate back to it
freely.

**An unanswered question offers only Skip; a bare "Next" never appears
until the question is answered.** The footer originally shipped both
buttons on every unanswered question, which created a third state the
rest of the design never accounted for: a student who pressed "Next"
repeatedly without ever answering or skipping left every concept
neither answered nor recorded as skipped. That silently defeated the
skip-confirmation dialog below (its condition is "anything skipped,"
which stayed empty) and the end screen understated the session as
"0/0 correct" with no skipped line — the whole-branch review caught
this before merge, recorded in
`brain/decisions/architecture-log.md`. The fix folds forward motion for
an unaddressed question into Skip itself: Skip both advances and
records the concept in the skip set, exactly as it always did, so there
is no way to leave a question without one of the two recorded outcomes.
Once a question is answered, Skip disappears — there is nothing left to
skip — and Next (or Finish, on the last question) takes its place.

Two rejected alternatives, both considered and both wrong here:

**Penalizing mastery on skip** would violate this project's central
invariant. Every learner-state mutation must be backed by an immutable
evidence record, and exposure is not mastery. A skip is the *absence*
of evidence, not evidence of failure — writing a penalty from a
non-event fabricates a signal the student never produced, which is the
silent-placeholder defect pointed the other way. A student who skips
because they ran out of time would be recorded as having failed.

**Re-queuing a similar question** has nothing to re-queue.
`composeDailySession` takes one question per due concept
(`questions[0]`), so a same-session re-queue would re-show the identical
question. Across days the behavior the user wants already exists for
free: a skipped concept produced no evidence, so its `evidenceGap` stays
high and `isDue` still returns true. It is in tomorrow's session,
ranked high, with no new code and no new persistence.

What this defers: a *persisted* avoidance signal — "this student keeps
skipping graph traversal" — would genuinely improve ranking, but it
needs a new evidence type carrying zero mastery weight plus a weights
decision. That belongs with Phase 6's configurable weights. Recorded
under "Open questions deferred by design" rather than smuggled in here.

### Back and forward navigation, with answered questions read-only

`‹` moves freely across the session in both directions, unconditionally.
Forward motion is `Skip` while a question is unanswered and `Next` (or
`Finish`, on the last question) once it is answered — see above.

An already-answered question renders read-only on return: the answer
given, the outcome, the explanation. It cannot be re-answered, because
its evidence is already committed and a second submission would be
recorded as a second, independent retrieval attempt — inflating the
evidence log with an attempt the student did not make. A skipped
question, having committed nothing, is fully answerable when revisited.

### A skip confirmation before the end screen

Because each answer commits its own evidence as it is given, there is no
submit step to intercept. The trigger is leaving the last question
going forward — by `Skip` if it is still unanswered, or by `Next`/
`Finish` once it is answered. If anything was skipped:

> **2 questions skipped**
> 3 of 5 answered.
> [Answer them] [Finish anyway]

"Answer them" jumps to the first skipped question rather than merely
dismissing the dialog. With no skips, leaving the last question goes
straight to the end screen and no dialog appears.

### One bounded session — no load-more

Today's `/study` has a load-more control calling
`getDailyReviewSession(id, { excludeConceptIds })` for another batch.
Quick review drops it: the session is one time-budgeted batch, which is
what makes the progress percentage meaningful end-to-end. A student
wanting more depth is the Deep review path (Phase 9), not a second
helping of the same session.

The load-more plumbing is deleted with it, end to end: the `loadMore`
server-action prop, `getDailyReviewSession`'s `excludeConceptIds`
option, `composeDailySession`'s `excludeConceptIds` parameter, and the
unit test covering it.

Keeping that parameter was considered and rejected. The argument for it
was that Phase 9's Deep review would want it — but Deep review is a
separate feature with its own selection of what to review, not another
page of today's daily session, so it will not call this. A parameter
with no caller in any planned phase is not a spare capability; it is
something the next reader has to investigate before discovering it is
inert.

### The deep-review offer ships visibly disabled, worded from the real model

Deep review is Phase 9 and on hold, so the offer has nothing to link to.
It ships **visibly** disabled and labeled as coming — a dead control
that announces itself, which the no-silent-placeholder rule permits and
an unlabeled one would not.

The sketch's wording ("to level 4") does not survive contact with the
data model: this codebase has no numeric levels. Mastery is the band
enum `unverified | exposed | weak | solid`, persisted on
`learner_concept_state.mastery_state`. The stub names the real next band
for the session's concepts — "Deep review to reach **solid** — coming
soon" — so the sentence is true against the model now and stays correct
when Phase 9 wires it up. Introducing numeric levels purely to match the
sketch would add a second, parallel mastery vocabulary across the whole
app for cosmetic fidelity.

### Three exits become two, with distinct destinations

The sketch's ✕, "Go to next task", and `Done` are three controls for
what is nearly one job. The ✕ is removed.

- **Done** → `/courses/<id>`, the course you were reviewing.
- **Go to next task** → the next due course's session, so a student
  working through Home's rail keeps moving without a round trip. When
  no other course is due, it renders disabled with "Nothing else due
  today" rather than linking nowhere.

Mid-quiz, the `‹` in the quiz header is the way out — a navigation
control back to the course, not a dialog dismissal. Leaving costs
nothing: every answer already committed its own evidence.

### Focused mode on mobile only

Below 768px the bottom nav is hidden for this route, giving the question
the full screen; above it, the nav stays as on every other screen. This
is why the `‹` matters — on a phone it is the only exit.

Implemented with the injected-`<style>` + `@media (max-width: 768px)`
pattern already used by `ConceptDetailPanel.tsx` and `DueQueue.tsx`'s
`CONNECT_PANEL_MEDIA_QUERY`, not a JS breakpoint hook, so the page stays
a server component.

## Architecture

`/courses/<id>/study/page.tsx` stays a server component: it calls
`getDailyReviewSession(courseId)`, resolves the next-due-course link,
and passes the three submit actions down. The `loadMore` server-action
prop is removed.

Client components, replacing `StudySession.tsx`:

- **`QuickReviewSession.tsx`** — the state machine:
  `{ index, results, skipped, phase: "question" | "confirm-skips" | "end" }`.
  Owns submit, skip, and navigation. Nothing else.
- **`QuickReviewQuestion.tsx`** — one item: header (`‹`, progress bar,
  percentage), question text, the modality-dispatched answer form, the
  outcome once submitted, and the footer that shows exactly one forward
  control: `Skip` while unanswered, `Next`/`Finish` once answered.
- **`QuickReviewEndScreen.tsx`** — score, skipped count, concepts
  covered, the disabled deep-review stub, and the two exits.

Splitting this way keeps each file small enough to hold in context at
once and lets the end screen be tested without a session running —
`StudySession.tsx` at 309 lines had grown past that.

The three answer forms (`MultipleChoiceForm`, `StructuredAnswerForm`,
and the text form lifted out of `StudySession`) are reused unchanged.

## Data

`SessionItem` carries neither of the two fields the end screen needs, so
`composeDailySession` gains both, read from columns that already exist:

- **`conceptName`** — `course_concepts.canonical_name`, the same column
  `concept-path-actions.ts` reads for the Concepts screen.
- **`masteryState`** — `learner_concept_state.mastery_state`. A missing
  row is genuinely `unverified`, which is a real state, not a fallback
  standing in for an unknown one.

The next-due-course link reuses `getHomeOverview`'s `orderSummaries`
output, excluding the current course and taking the first that is
actually due. No second copy of the "what is due" rules.

## Error handling

- **A failed submission** shows the error inline, leaves the question
  answerable, and counts as neither correct nor answered. A
  graded-wrong answer and a failed-to-grade answer must never render
  alike.
- **`no_content` / `budget_too_small`** keep their existing messages,
  shown in place of the quiz rather than as a zero-question session.
- **An empty session** renders the honest empty state, never a 0/0 quiz.
- **A failed next-due-course lookup** disables "Go to next task" with
  the reason visible — distinct from the "Nothing else due today"
  disabled state, which is a calm fact rather than a failure.

## Testing

Unit (pure functions, no database):

- progress percentage across answered/skipped/unanswered mixes;
- skip accounting, including the "answer them" jump target;
- next-band selection for the deep-review stub across band mixes;
- end-screen score from mixed outcomes, including the code-sandbox
  `graded` + `allPassed` case that `isPassedOutcome` already handles —
  a passing code submission must not render as a red X.

Visual baselines at desktop **and** mobile for the question screen, the
skip dialog, and the end screen. Mobile is not optional here: Phase 3's
only real defect was a desktop-only layout that shipped green until the
mobile baseline caught it, on an app whose target form factor is
bottom-nav and phone-shaped.

E2E: drive a seeded session through answer → skip → back → answer →
finish, asserting the end screen's real counts.

## Open questions deferred by design

- **A persisted skip/avoidance signal** feeding review priority — needs
  a zero-mastery-weight evidence type and a weights decision; belongs
  with Phase 6's configurable weights.
- **"Quick" review can serve a structured, slow question**, because the
  question bank holds one question per concept and the flow refuses to
  drop due concepts to look fast. Fixing it means richer per-concept
  question sets, which is assessment-generation work, not Phase 4.
- **Deep review's actual design** (Phase 9) — the end screen's stub is
  the only thing Phase 4 asserts about it.

## Spec self-review

- **Placeholder scan:** one placeholder ships, and it is deliberate and
  labeled — the disabled deep-review offer, which states in its own copy
  that it is coming. No TBDs elsewhere.
- **Internal consistency:** the skip rules, the back-navigation rules,
  and the progress-percentage definition agree — skipped items commit
  nothing, stay in place, remain answerable on return, and do advance
  the bar (see the amendment below, which supersedes this doc's
  original rule that they did not).
- **Scope check:** one screen, one route, two new `SessionItem` fields,
  no backend logic change. Single-plan sized.
- **Ambiguity check:** "next task" was ambiguous between "next question"
  and "next course" — fixed to mean the next due *course's* session
  explicitly, in both the decision and the error-handling section.

## Amendment (2026-09-29): the progress bar counts skipped items

This doc originally specified that the progress percentage counted
answered items only, on the reasoning that a bar including skips would
overstate what the student had actually retrieved.

That reasoning conflated two different questions. The bar answers "how
far through today's review am I", not "how well am I doing". A skipped
question has been dealt with — the student saw it, decided, and moved
on, and it does not reappear later in the session — so leaving it out
left the bar reading 0% for someone who had worked through half the
session. That misreports the one thing a progress bar exists to report.

The percentage is therefore computed over every **addressed** item,
answered or skipped. Nothing is overstated by this, because correctness
was never the bar's job: the end screen reports `N/M correct` and the
skipped count as separate numbers, and the pre-finish confirmation
names the skips explicitly ("3 questions skipped · 0 of 3 answered").
Two numbers each meaning one thing, rather than one number trying to
mean both.

One case deliberately does **not** advance the bar: a submission that
failed to grade. `statusFor` leaves it "unanswered" and it stays
answerable, so a grading failure is not progress — consistent with the
rule elsewhere in this design that a failed submission and a
graded-wrong answer must never be treated alike.
