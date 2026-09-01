# Quickstart: Course Domain Schemas & Benchmark Corpus

How to prove this feature works once `tasks.md` is implemented. This is a
validation guide, not implementation code — see `data-model.md` for field
definitions and `tasks.md` for the actual build steps.

## Prerequisites

- Node.js 20+ active (`nvm use 24` per `brain/lessons/setup-gotchas.md`).
- Repo dependencies installed: `npm install` (no new dependencies are
  added by this feature — see `research.md`).
- Real source material for one data-structures-and-algorithms course: MIT
  OCW 6.006 (Spring 2020), Lectures 2/6/8/9/10 + Problem Sets 3/4, already
  saved at `benchmark/dsa-course/sources/` — see `research.md`'s "Source
  course material" decision.

## Validation scenario 1 — schemas compile and typecheck

```bash
npm run typecheck
```

**Expected outcome**: exits 0. `src/types/domain/*.ts` type-checks cleanly
against the existing `tsconfig.json` (`strict: true`), and nothing else in
the repo breaks by importing them.

## Validation scenario 2 — every corpus entry conforms to its schema

```bash
node --test tests/unit/domain/
```

**Expected outcome**: all tests pass, specifically confirming:
- Every entry in `benchmark/dsa-course/concepts.json` satisfies
  `CourseConcept` (at least 30 entries, per spec SC-002).
- Every entry in `edges.json` satisfies `ConceptEdge`, including the
  conditional `relationTypeNote` rule (at least 30 entries).
- Every entry in `qa-pairs.json` satisfies `LabeledQAPair` (at least 20
  entries, at least one with `isAmbiguous: true`).
- `edge-cases.json` contains all 4 required cases from spec.md's Edge
  Cases section (non-standard relation type, multi-alias concept,
  multi-target evidence, ambiguous question).
- Every `sourceAnchors` array resolves to a real `artifacts.json` entry
  (no dangling references).

## Validation scenario 3 — benchmark corpus is independently reproducible

Manual scenario (spec SC-004), not automated:

1. Give a second person (or run this yourself after a few days' gap) only
   the 5 lecture + 2 homework source artifacts and `data-model.md`.
2. Ask them to independently label 10 concepts and 10 relationships from
   the same material.
3. Compare against the corresponding entries in `concepts.json`/
   `edges.json`.

**Expected outcome**: at least 80% agreement on canonical name/relation
type — evidence the corpus reflects the source material rather than the
original labeler's private judgment.

## Validation scenario 4 — corpus is scoreable without modification

```bash
node --test tests/unit/domain/benchmark-corpus.test.ts
```

**Expected outcome**: the test includes at least one trivial baseline
"extraction" (e.g. a hardcoded function that returns a fixed subset of
concepts) scored against `concepts.json`, proving the scoring mechanism
itself works end-to-end without needing to touch the corpus files — this
is the mechanism every later phase's real extraction pipeline will reuse
(spec SC-005).

## Validation scenario 5 — rubric completeness

```bash
grep -c '^## ' benchmark/dsa-course/rubrics/evaluation-rubrics.md
```

**Expected outcome**: returns `10` — one section per PRD §23.2 evaluation
area, each containing at least one concrete pass/fail criterion (spec
SC-003, manually reviewed for content since "concrete criterion" isn't
mechanically checkable by a line count alone).
