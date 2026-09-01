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

- **Decision**: MIT OpenCourseWare's *6.006 Introduction to Algorithms*
  (Spring 2020) — specifically Lectures 2 (Data Structures), 6 (Binary
  Trees I), 8 (Binary Heaps), 9 (Breadth-First Search), and 10 (Depth-First
  Search), plus Problem Sets 3 and 4. Condensed, attributed source notes
  are saved at `benchmark/dsa-course/sources/` (see that directory's
  `README.md` for the full citation and license).
- **Rationale**: spec.md Assumptions require real, non-fabricated course
  material (per SC-004, grounding labels in actual source, not invented
  content). MIT OCW publishes this course under a Creative Commons
  Attribution-NonCommercial-ShareAlike 4.0 license, which permits this
  non-commercial, attributed, educational reuse. The five chosen lectures
  map directly onto the PRD's own worked demo domain (§28: BFS, FIFO
  queues, graph traversal, trees) — the same concepts `docs/technical-prd.md`
  already uses as its running example — so the benchmark corpus and the
  PRD's demo story stay grounded in the same material. Problem Sets 3 and 4
  supply real homework-style questions spanning retrieval through
  transfer-tier difficulty (PRD §15.2), satisfying spec FR-008.
- **Alternatives considered**: Stanford's CS161/CS166 (rejected — lecture
  notes are not uniformly published under an open license, unlike MIT
  OCW); generating synthetic DSA lecture content (rejected — directly
  contradicts spec.md User Story 2's requirement that labels be grounded in
  real source artifacts, not invented ones); using MIT 6.006's Fall 2011
  offering instead (rejected — Spring 2020's notes are more complete and
  already the version OCW's current resource index highlights).
