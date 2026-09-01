# Research: Course Graph Ingestion

## Extraction provider integration: OpenAI Structured Outputs, direct file input

- **Decision**: Send the artifact's file content directly to an OpenAI
  Structured Outputs call (a JSON-schema-constrained response) that
  returns candidate concepts and relationships in one pass per artifact.
  For PDFs, use the Responses API's native file input (the model reads
  the PDF directly — text and layout both, useful for lecture slides
  where structure carries meaning); for image uploads (PNG/JPEG/HEIC/WEBP
  — the handwritten-notes case from `status.ts`), use the same call with
  image input, since these models accept both.
- **Rationale**: `benchmark/dsa-course/sources/*.md` (the corpus this
  feature is scored against) shows concept/relationship extraction is a
  single-artifact-at-a-time task — no cross-artifact retrieval is needed
  to extract from *one* lecture. Structured Outputs gives a
  deterministically-validated *shape* even though the *content* is
  probabilistic (Constitution Principle IV's stated middle ground for
  domains without an exact checker). Direct file input avoids a separate
  OCR/text-extraction pre-step and its own failure surface.
- **Alternatives considered**: OpenAI's `file_search` tool over a
  per-course vector store (mentioned as an ingredient in
  `docs/implementation-roadmap.md`'s Phase 2 row) — rejected *for this
  feature's scope*. `file_search` earns its cost when a query needs to
  retrieve from *many* artifacts at once; single-artifact extraction
  doesn't need that, and standing up a vector store per course is exactly
  the kind of new persistence surface `CLAUDE.md` says not to add without
  a demonstrated requirement. Revisit if/when a later feature (e.g.
  cross-artifact grounded chat) actually needs retrieval across many
  artifacts at once — that's a real, different requirement, not this
  one. A separate OCR/text-extraction library (e.g. pdf-parse) before
  sending text to the model — rejected: adds a dependency and a failure
  mode (garbled extracted text) for no benefit over native file input,
  which existing OpenAI models already handle.

## Reconciliation: LLM comparison against the existing concept list, not embeddings

- **Decision**: When extraction produces a candidate concept, reconciliation
  sends the model the candidate plus the course's current concept list
  (canonical names + aliases + short descriptions only, not full source
  text) and asks it to classify the candidate as: matches an existing
  concept (which one) → merge as alias; clearly new → keep separate;
  neither confident → flag for review. This is a second, small Structured
  Outputs call, not a similarity-search index.
- **Rationale**: At this feature's scale (~30-80 concepts per course, per
  `benchmark/dsa-course/concepts.json`'s size), a full concept list fits
  comfortably in one model call — no retrieval infrastructure is needed
  to compare against "all of them." This keeps reconciliation auditable
  (`reconciliation_decisions` records the model's own stated reasoning)
  and keeps the three-way outcome (merge / keep-separate / flag) an
  explicit classification rather than a distance-threshold guess.
- **Alternatives considered**: pgvector + embedding similarity search —
  rejected. This is a new persistence layer (a new Postgres extension,
  new index type, new write path for embeddings) that `CLAUDE.md`
  requires an ADR to add "without a demonstrated requirement" — and at
  this scale there's no demonstrated requirement it solves that a direct
  LLM comparison doesn't already solve more auditably. Worth
  reconsidering only if a course's concept count grows far past what fits
  in one model call, which isn't this project's current scale.
  String-similarity matching (Levenshtein/Jaro-Winkler on canonical
  names) alone — rejected: `edge-cases.json`'s
  `multiAliasConcept` case ("BFS" / "Breadth-First Search") is exactly
  the kind of match a string-distance metric would miss and a model
  correctly wouldn't.

## "Substantially overlaps" (spec FR-004/FR-005), made concrete

- **Decision**: The reconciliation call's output is one of exactly three
  values, no numeric threshold exposed elsewhere in the system to tune:
  `"merge"` (with the matched existing concept's id), `"distinct"`, or
  `"uncertain"`. `"merge"` → FR-004's alias-merge path. `"distinct"` →
  kept as its own proposed concept. `"uncertain"` → kept as its own
  proposed concept *and* explicitly marked for reviewer attention (not
  silently treated the same as "distinct" — a reviewer should be able to
  tell "the system wasn't sure" from "the system was confident these are
  different"), satisfying FR-005's "don't silently auto-merge an
  uncertain case."
- **Rationale**: This spec deliberately left the exact matching mechanism
  to planning (spec.md Assumptions) but a plan can't leave it vague too —
  per the no-silent-placeholders rule, "some similarity computation
  happens" is not an implementable contract. A closed three-way
  classification is directly implementable, directly testable against
  `edge-cases.json`'s `multiAliasConcept` case, and avoids inventing a
  numeric confidence threshold that isn't backed by any real calibration
  data yet (a magic number like "merge if similarity > 0.8" would itself
  be exactly the kind of unearned-looking-precise placeholder value this
  project is now avoiding).
- **Alternatives considered**: a numeric confidence score with a
  configurable threshold — rejected for the reason above: no real data
  exists yet to justify any specific number, and a fabricated-looking
  threshold is worse than a closed three-way decision a reviewer can
  directly reason about.

## Extraction scoring: precision/recall over concept identity, not exact string match

- **Decision**: `scripts/score-extraction.ts` runs extraction against
  every artifact listed in `benchmark/dsa-course/artifacts.json` that has
  a corresponding file under `sources/`, then compares the resulting
  candidate concepts/edges against `concepts.json`/`edges.json` using:
  - **Concept match** = candidate's canonical name or any alias
    case-insensitively equals the expected concept's canonical name or
    any of its aliases, OR the reconciliation step itself would classify
    them as a match (reuses the same reconciliation call from above,
    applied once between "extracted" and "expected" — not a second,
    different matching algorithm).
  - **Precision** = matched concepts / total extracted concepts.
    **Recall** = matched concepts / total expected concepts in
    `concepts.json` for that artifact's `sourceAnchors`.
  - Same precision/recall computation for edges, matching on
    (source concept match, target concept match, same `relationType` or
    both `"other"`).
  - Score is reported per-artifact and aggregated; the script exits
    non-zero if aggregate recall drops below the last-recorded baseline
    (stored in the script's own output file, not a hardcoded number that
    would itself be a placeholder) — flagging regressions without
    inventing a specific "pass" number this project has no basis for yet.
- **Rationale**: Directly answers FR-013/SC-001 ("repeatable, not
  eyeballed") without inventing a precision/recall target the project has
  no historical data to justify. Reusing the reconciliation call for
  concept matching (rather than a separate fuzzy-match algorithm) means
  the scoring harness tests the same logic that runs in production, not
  a parallel implementation that could silently drift from it.
- **Alternatives considered**: exact string equality only — rejected,
  would fail the corpus's own `multiAliasConcept` edge case by
  construction. A fixed pass/fail threshold (e.g. "must hit 80% recall")
  — rejected for now per the reasoning above; regression-detection
  against a recorded baseline is honest about not having a real target
  yet, where a fabricated threshold would not be.

## Chaining onto Phase 1's ingest-artifact task

- **Decision**: A new Trigger.dev task, `extract-course-graph`, is
  triggered from within `ingest-artifact` (`trigger/ingest-artifact.ts`)
  immediately after it sets an artifact's status to `"ready"` — not
  merged into that task's own `run` function.
- **Rationale**: `trigger/ingest-artifact.ts`'s existing comment is
  explicit that "content interpretation (concept extraction) is
  explicitly out of scope for this feature (spec FR-010) — Phase 2's job,
  not this one," and its idempotency pattern (re-read status before
  acting) already assumes each task has one clear responsibility. Keeping
  extraction a separate, separately-idempotent task preserves that: a
  retried `ingest-artifact` run doesn't risk re-triggering extraction
  multiple times, since `extract-course-graph` does its own
  idempotency check (an `extraction_runs` row already `"completed"`
  for that artifact means skip, same pattern as
  `isValidStatusTransition`).
- **Alternatives considered**: extending `ingest-artifact`'s own `run`
  function to also call OpenAI — rejected, violates the single-responsibility
  boundary that function's own comments already establish, and would make
  Phase 1's task (which has its own already-shipped tests/contracts)
  depend on an OpenAI key being configured just to validate a file exists.

## Missing OPENAI_API_KEY: explicit failure, not a silent no-op

- **Decision**: `extract-course-graph` checks for `process.env.OPENAI_API_KEY`
  before attempting any OpenAI call. If unset, the `extraction_runs` row
  is written with a distinct status (`"failed"`) and a `failure_reason`
  of `"OpenAI is not configured for this environment."` — the same
  distinct-failure-status shape FR-012 already requires for an unreadable
  artifact, reused rather than inventing a second failure representation.
  The review-queue UI surfaces this reason directly to the reviewer.
- **Rationale**: Direct application of the no-silent-placeholders rule
  (`brain/decisions/architecture-log.md`, 2026-09-01) to a case this
  feature will actually hit in dev before the user's key is wired up —
  an extraction run that silently produces zero concepts because the key
  is missing would be indistinguishable from "this artifact genuinely had
  no course content" (spec.md Edge Cases), which is the exact failure
  mode FR-012 exists to prevent.

## New `course_units` table

- **Decision**: Add `course_units` in this feature's migration —
  `id`, `course_id`, `title`, `created_at`. `course_concepts.unit_id`
  references it.
- **Rationale**: `CourseConcept.unitId` (domain type, already shipped in
  Phase 0) and `CourseGraph.Unit` (renderer DTO, already shipped in
  `concept-atlas-renderer`) both assume units are real, addressable
  entities, but no table for them exists yet — `concept-atlas-renderer`
  only ever consumed a static JSON fixture (`tests/fixtures/concept-atlas-demo.json`),
  never a persisted course. This feature is the first to actually
  populate a course's units, so it's responsible for the table that makes
  `unitId` resolvable rather than a dangling string.
- **Alternatives considered**: inferring units implicitly from
  `artifacts.unit` (a plain text field in `benchmark/dsa-course/artifacts.json`,
  not part of the shipped schema) — rejected, conflates "which artifact"
  with "which unit," and a unit can (and in the benchmark corpus does)
  span multiple artifacts (e.g. "Trees" spans two lectures).

## Self-referencing relationships (FR-011)

- **Decision**: After reconciliation resolves both endpoints of a
  candidate edge to their final (possibly merged) concept ids, if both
  ids are equal, the edge is dropped before it's ever written as a
  `proposed` row — logged (not silently discarded) via the same
  `extraction_runs` record's summary so a reviewer can see "N edges
  dropped as self-referential after merge" rather than the count simply
  not adding up with no explanation.
- **Rationale**: Direct enforcement of FR-011, applied at the one point
  (post-reconciliation) where a self-reference can actually appear —
  extraction alone can't produce one against concepts that don't exist
  yet, but merging two *originally distinct* candidate endpoints into the
  same existing concept can.
