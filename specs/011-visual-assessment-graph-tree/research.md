# Research: Visual Assessment (Graph/Tree)

## No handwriting-recognition library -- a vision-capable LLM, same client already in use

- **Decision**: The drawing is sent as a raster image to the existing
  `openai` client (a vision-capable model, e.g. the `gpt-4.1` family),
  which extracts structured node/edge/order data directly -- no OCR
  engine, no dedicated ink-recognition SDK, no new dependency.
- **Rationale**: the target isn't general handwriting transcription --
  it's extracting a constrained graph/tree structure from a simple
  line drawing, which a general vision model already does, and it
  naturally produces a real confidence value FR-005's confirmation
  step needs. A dedicated OCR/handwriting library would be a new
  dependency solving a narrower problem an existing dependency already
  solves well enough for this constrained case (this project's
  standing "no new dependency when an existing one solves the
  problem" rule).
- **Alternatives considered**: Mathpix (rejected for this feature --
  PRD names it specifically for handwritten *math* transcription in
  the later PencilKit/tablet phase, not graph/tree drawings on the web
  MVP). PencilKit stroke data (rejected -- native/tablet-only,
  explicitly out of scope per spec.md Assumptions).

## Only the answer-claim fields are extracted, not the whole checker input

- **Decision**: `problem-setup.ts` strips every `claimed*`-prefixed
  field from a question's real `checkerInput` (data-model.md's own
  naming convention across all five `deterministic-grading` domains --
  `claimedOrder`, `claimedPath`, `claimedExtractedSequence`,
  `claimedFinalState`, `claimedResultTree`, `claimedTotalDistance`),
  leaving only the real problem setup (the graph/tree structure itself)
  to render. `vision-extraction.ts`'s Structured Outputs schema asks
  the model for only those same claim fields, per domain, and
  `merge-structure.ts` recombines them with the real problem setup
  into a full checker input before grading.
- **Rationale**: `assessment-generation-pipeline`'s own `checkerInput`
  still carries the *candidate's own* claimed answer baked in from
  generation-time validation (research.md there, "one structural
  funnel"). Rendering that whole object to the student would leak the
  answer. This feature is the first place that actually needs the
  "strip the claimed fields, keep the rest as problem setup" mechanism
  that `review-scheduler`'s own research.md flagged and deliberately
  deferred as future work when it came up during that feature's UI
  wiring -- it now has a real, demonstrated need (rendering a question
  without leaking its answer), not a hypothetical one.
- **Alternatives considered**: rendering the whole `checkerInput`
  as-is and trusting the UI not to display the claim fields (rejected
  -- fragile, and directly risks leaking the answer through a rendering
  bug rather than making it structurally impossible to leak).

## Custom, small layout functions -- not elkjs

- **Decision**: `graph-layout.ts`/`tree-layout.ts` are small, custom,
  deterministic layout functions (a simple circular/grid placement for
  a bounded graph, a standard recursive placement for a bounded binary
  tree) -- not `elkjs`, despite it already being a project dependency
  (used by `concept-atlas-renderer`).
- **Rationale**: `elkjs` solves layered, potentially-large,
  interactive course-graph layout -- real sophistication this
  feature's bounded, dozens-of-nodes assessment graphs (the same scale
  `deterministic-grading`'s own benchmark corpus already assumes)
  don't need. The same "add a heavier tool only when a demonstrated
  need exists" reasoning `concept-atlas-renderer`'s own research.md
  already used to defer Graphology applies here in the same direction
  -- pulling in `elkjs`'s layout engine for a fixed, small, one-shot
  question rendering would be reaching for more power than the problem
  requires, not a reuse of something already proven necessary at this
  scale.
- **Alternatives considered**: reusing `elkjs` for consistency with
  `concept-atlas-renderer` (rejected -- consistency alone isn't a
  reason when the actual computational need is much smaller; Principle
  I also keeps this feature's question-rendering view state completely
  separate from the course graph's own renderer adapters regardless).

## No new database table -- the drawing's reference lives in `assessment_attempts.response`

- **Decision**: The drawing's Storage path and the confirmed/extracted
  structure are recorded inside the existing
  `assessment_attempts.response` `jsonb` column
  (`0006_deterministic_grading.sql`) -- no new column, no new table.
- **Rationale**: that column's own documented design is "a lightweight
  snapshot of the question/response/grading result," deliberately
  `jsonb` rather than a rigid schema specifically so a new response
  shape (a drawing reference plus extracted structure, in this case)
  doesn't require a migration. The one new table this feature *does*
  need is not a database table at all -- see below.
- **Alternatives considered**: a new `visual_responses` table
  (rejected -- no demonstrated need; `assessment_attempts` already
  exists precisely to hold "whatever this response modality looked
  like," and a real requirement to query drawings independently of
  their attempt hasn't been demonstrated).

## One new Storage bucket -- the drawing image itself needs somewhere to live

- **Decision**: a new private Storage bucket, `assessment-drawings`,
  `user_id`-keyed RLS, same shape `course-artifacts`'s own bucket
  already established (client uploads directly to Storage, server only
  records the path).
- **Rationale**: spec.md's own Assumption is that the drawing image is
  retained for audit, consistent with this project's general
  evidence-provenance stance -- and nothing existing can hold an
  arbitrary-sized image file (`assessment_attempts.response` can hold
  the *path*, not the bytes). Object storage is an already-approved
  stack component (`.specify/memory/constitution.md`'s Technology &
  Architecture Constraints); a new bucket within it is the same kind of
  addition `course-artifacts` already made, not a new persistence layer
  requiring an ADR.
- **Alternatives considered**: discarding the image immediately after
  extraction (rejected by spec.md's own Assumption -- an unauditable
  graded attempt is a real trust gap this project's provenance stance
  doesn't accept elsewhere). Storing the image as a base64 string
  inside `assessment_attempts.response` itself (rejected -- Storage
  already exists specifically for file bytes; stuffing binary data into
  `jsonb` would be working against the tool that already fits).

## Confirmation is enforced structurally, not left to the UI

- **Decision**: `actions.ts`'s grading entrypoint requires an explicit,
  already-confirmed set of claim fields as its input -- there is no
  server-side path that goes from "low-confidence extraction" straight
  to `gradeStructuredResponse` without a value the student actually
  saw and approved (or corrected) passing back through first.
- **Rationale**: FR-005/FR-006 are a trust guarantee (Constitution
  Principle IV's literal text), not a UI nicety -- making it
  structurally impossible for a low-confidence extraction to reach
  grading unconfirmed is the same discipline this project already
  applies to evidence commit itself (Principle II: no code path writes
  learner state without going through the one real evidence-commit
  step).
- **Alternatives considered**: a client-side-only confirmation gate
  (rejected -- trusts the UI to remember a rule the server should
  enforce, the same class of mistake Principle II already rules out
  for evidence writes).
