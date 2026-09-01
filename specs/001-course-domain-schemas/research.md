# Phase 0 Research: Course Domain Schemas & Benchmark Corpus

No `NEEDS CLARIFICATION` markers were left in the Technical Context — all
were resolved directly against existing project decisions
(`docs/technical-prd.md`, `.specify/memory/constitution.md`,
`docs/implementation-roadmap.md`) rather than requiring new research. This
file records those resolutions in the standard Decision/Rationale/
Alternatives format for traceability.

## Schema representation: plain TypeScript types, no runtime validation library

- **Decision**: Define `CourseConcept`, `ConceptEdge`, `EvidenceEvent`, and
  `Assessment` as plain TypeScript `interface`/`type` declarations under
  `src/types/domain/`.
- **Rationale**: nothing in this phase validates untrusted input at
  runtime — the benchmark corpus is hand-authored, not user-submitted.
  Constitution's Technology & Architecture Constraints forbid adding a new
  dependency without a demonstrated need; a runtime schema library earns
  its place once Phase 1 puts these shapes behind an actual API boundary
  (untrusted request bodies, DB row parsing), not before.
- **Alternatives considered**: Zod (rejected — no runtime boundary exists
  yet in this phase; would be an unused dependency until Phase 1);
  io-ts/Valibot (same rejection reason, plus smaller ecosystem fit for a
  Next.js project already leaning toward Zod-shaped conventions when the
  need arrives).

## Test runner: Node's built-in `node --test`

- **Decision**: Use `node --test` + `node:assert/strict` for schema-shape
  and benchmark-corpus validation tests.
- **Rationale**: the repo has no unit-test framework yet (only Playwright
  for e2e/visual). Node 20+ is already a hard requirement here (per
  `brain/lessons/setup-gotchas.md`), and its built-in runner covers this
  phase's whole test surface (shape checks, corpus scoring) without adding
  a dependency, matching the same constitution constraint as above.
- **Alternatives considered**: Vitest (rejected — capable, but nothing in
  this phase needs its watch mode, snapshot testing, or JSX transform;
  adding it now for four schema files is disproportionate); Jest (rejected
  — heavier setup, same disproportionate-for-this-phase reasoning, and
  Vitest would be preferred over it if a richer runner is ever justified
  later).

## Corpus storage format: JSON for structured entries, Markdown for rubrics

- **Decision**: `concepts.json`, `edges.json`, `qa-pairs.json`,
  `edge-cases.json`, and `artifacts.json` hold structured, schema-shaped
  data; `rubrics/evaluation-rubrics.md` holds the ten prose rubrics.
- **Rationale**: JSON round-trips directly against the TypeScript schemas
  with no parsing step (`resolveJsonModule` is already enabled in
  `tsconfig.json`), which is what the corpus-scoring test needs. Rubrics
  are prose judgment criteria, not structured records — Markdown is the
  right fit and matches how every other durable decision doc in this repo
  (`brain/`, `docs/`) is written.
- **Alternatives considered**: YAML (rejected — no existing YAML tooling
  in the repo, and JSON's stricter shape is preferable for something a
  test will parse and diff against a TypeScript type); one combined
  Markdown file with embedded tables for everything (rejected — 30+30+20
  structured rows in Markdown tables is harder to diff and impossible to
  `JSON.parse` directly in the scoring test).

## Non-standard relationship type handling

- **Decision**: `ConceptEdge.relation_type` is typed as the seven PRD §10.2
  standard types plus a literal `"other"` variant that requires a
  `relation_type_note` field when used.
- **Rationale**: spec.md's Edge Cases section requires the benchmark corpus
  to include at least one relationship that doesn't cleanly fit the
  standard taxonomy, and requires recording how it was resolved — an
  `"other"` variant with a mandatory explanatory note is the smallest
  schema addition that satisfies FR-002 and FR-011 without silently
  expanding the taxonomy or forcing a bad-fit standard label.
- **Alternatives considered**: forcing the closest standard type with no
  escape hatch (rejected — spec explicitly requires recording *how* the
  mismatch was resolved, which needs a field to record it in); open string
  type instead of enum + `"other"` (rejected — defeats the point of a
  closed taxonomy for the other 90%+ of relationships that do fit).

## Source course material

- **Decision**: real lecture/homework material for the benchmark corpus is
  supplied by the project owner (Amanda), not synthesized — deferred as an
  explicit input needed before the corpus-building tasks in `tasks.md` can
  be completed.
- **Rationale**: spec.md Assumptions state the course is "the builder's own
  coursework or an equivalent real syllabus"; fabricating placeholder
  course content would defeat the benchmark's purpose (grounding labels in
  real material, per spec SC-004) and risks producing a corpus that has to
  be redone once real material arrives.
- **Alternatives considered**: generating synthetic DSA lecture content
  now to unblock corpus-building immediately (rejected — directly
  contradicts spec.md User Story 2's requirement that labels be grounded in
  real source artifacts, not invented ones).
