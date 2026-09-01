# Phase 1 Data Model: Course Domain Schemas & Benchmark Corpus

Field definitions here are the source of truth for `src/types/domain/*.ts`.
Types are TypeScript-flavored for precision but this file is the design
record — the `.ts` files are the implementation, produced in `tasks.md`.

## CourseConcept

A single teachable idea within one course (spec.md Key Entities;
PRD §10.2).

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Stable identifier, generated on creation, never reused. |
| `courseId` | `string` | Owning course. Cross-course reconciliation is out of scope (PRD decision D1). |
| `unitId` | `string` | Which course unit this concept belongs to. |
| `canonicalName` | `string` | The system's single preferred name for this concept. |
| `aliases` | `string[]` | Other names/phrasings the same concept appears under across source artifacts (e.g. `["BFS", "breadth-first search"]`). Must be non-empty-safe: `[]` is valid (no known aliases yet). |
| `description` | `string` | Normalized, source-grounded description. |
| `importanceScore` | `number` (0–1) | Course-emphasis signal. |
| `sourceAnchors` | `SourceAnchor[]` | Non-empty for any concept that claims to be course-specific (Constitution Principle V / spec FR-007). |
| `status` | `"proposed" \| "confirmed" \| "archived"` | Ontology confidence/status, per PRD §10.2. |
| `confidence` | `number` (0–1) | Source-extraction confidence. |

**Validation rules**: `sourceAnchors.length >= 1` whenever the concept is
attached to a real course (i.e. always, in this MVP — cross-course generic
concepts are out of scope). `aliases` must not contain `canonicalName`
itself (that's not an alias, it's the name).

## SourceAnchor (shared shape, not a top-level entity)

| Field | Type | Notes |
|---|---|---|
| `artifactId` | `string` | References an entry in `benchmark/dsa-course/artifacts.json` (or, post-MVP, an ingested artifact row). |
| `locator` | `string` | Human-readable pointer into that artifact (e.g. "slide 14", "problem 3"). |
| `excerpt` | `string` | Short quoted or paraphrased grounding text. |

## ConceptEdge

A directed, typed relationship between two `CourseConcept`s (spec.md Key
Entities; PRD §10.2). Multiple edges may exist between the same ordered
pair — this is a multigraph (Constitution Principle I, spec FR-003).

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Stable identifier. |
| `sourceConceptId` | `string` | |
| `targetConceptId` | `string` | |
| `relationType` | `"prerequisite_for" \| "part_of" \| "mechanism_for" \| "contrasts_with" \| "used_in" \| "generalizes_to" \| "example_of" \| "other"` | PRD §10.2 taxonomy plus the `"other"` escape hatch from `research.md`. |
| `relationTypeNote` | `string \| undefined` | **Required when `relationType === "other"`**, forbidden otherwise. Records why no standard type fit (spec Edge Cases, FR-002). |
| `explanation` | `string` | Short normalized explanation of *why* this edge holds. |
| `sourceAnchors` | `SourceAnchor[]` | Non-empty, same rule as `CourseConcept.sourceAnchors`. |
| `status` | `"proposed" \| "confirmed" \| "archived"` | |
| `confidence` | `number` (0–1) | |

**Validation rules**: `(sourceConceptId, targetConceptId, relationType)` is
NOT required to be unique — multiple edges of different types (or even the
same type with different explanations, though that's unusual) may exist
between the same pair, per spec FR-003. `relationTypeNote` presence is
conditionally required as noted above — this is the one cross-field rule
in the model and must be enforced by the benchmark-corpus test, not left
implicit.

## EvidenceEvent

An immutable record of something a specific student did that bears on
their understanding (spec.md Key Entities; PRD §10.3; Constitution
Principle II).

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | |
| `userId` | `string` | |
| `courseId` | `string` | |
| `conceptIds` | `string[]` | Zero or more — an event can target concepts, edges, or both (spec Edge Cases, third bullet). |
| `edgeIds` | `string[]` | Zero or more. `conceptIds` and `edgeIds` MUST NOT both be empty. |
| `evidenceType` | `"exposure" \| "retrieval" \| "explanation" \| "application" \| "transfer" \| "relationship_explanation" \| "misconception" \| "annotation_confusion_signal" \| "instructor_feedback"` | PRD §10.3. This is the field that structurally separates exposure from mastery-grade tiers (Constitution Principle III, spec FR-005). |
| `correctness` | `boolean \| null` | `null` when not applicable (e.g. `exposure` events have no correctness). |
| `graderConfidence` | `number` (0–1) | |
| `assistanceLevel` | `number` (0–6) | Position on the PRD §14.3 assistance ladder used, if any. |
| `difficulty` | `number` (0–1) | |
| `transferDistance` | `number` (0–1) | How far this evidence is from rote repetition. |
| `studentConfidence` | `number \| undefined` | Optional self-reported confidence. |
| `sourceArtifactId` | `string \| undefined` | Optional — set when evidence comes from an uploaded artifact. |
| `assessmentAttemptId` | `string \| undefined` | Optional — set when evidence comes from a graded attempt. |
| `conversationTurnId` | `string \| undefined` | Optional — set when evidence comes from a tutor conversation. |
| `createdAt` | `string` (ISO 8601) | |

**Validation rules**: no `update`/`delete` operation is defined anywhere in
this model — the type itself has no mutable counterpart, enforcing
append-only by construction (Constitution Principle II). At least one of
`sourceArtifactId`, `assessmentAttemptId`, `conversationTurnId` must be set
(every event traces to a concrete origin).

**Design note — exposure vs. mastery boundary (FR-005)**: this schema
makes exposure structurally distinguishable from mastery-grade tiers via
the closed `evidenceType` enum, but does *not* itself compute or store a
mastery score — that's `LearnerConceptState`/`LearnerEdgeState` from PRD
§10.2, out of scope for this phase (arrives in Phase 3,
`learner-graph-evidence`). This phase only needs the evidence record to be
expressive enough that a later mastery calculation can't accidentally
treat `exposure` as equivalent to `retrieval`/`application`/`transfer`.

## Assessment (blueprint)

A specification for a practice/exam item — what it targets, not the item
itself (spec.md Key Entities; PRD §15.2).

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | |
| `targetConceptIds` | `string[]` | |
| `targetEdgeIds` | `string[]` | |
| `assessmentType` | `"retrieval" \| "mechanism" \| "application" \| "connection" \| "transfer"` | PRD §15.2. |
| `difficulty` | `number` (0–1) | |
| `courseStyleRefs` | `string[]` | Source anchors this blueprint should stylistically match. |
| `requiredPrerequisites` | `string[]` | Concept IDs. |
| `forbiddenConcepts` | `string[]` | Concept IDs explicitly out of scope, bounding the item. |
| `responseModality` | `"text" \| "code" \| "graph" \| "tree" \| "diagram"` | |
| `expectedSolutionProperties` | `string[]` | Free-text checkable properties (e.g. "returns nodes in level order"). |
| `maxTimeMinutes` | `number` | |

**Validation rules**: `targetConceptIds` and `targetEdgeIds` MUST NOT both
be empty (a blueprint must target something).

## Benchmark corpus entities (data, not schema)

These live in `benchmark/dsa-course/` as JSON conforming to the schemas
above, plus two corpus-specific wrapper shapes:

| Entity | Shape | Notes |
|---|---|---|
| `SourceArtifact` | `{ id, title, artifactType: "lecture" \| "homework", unit, date }` | Metadata for the 5 lecture + 2 homework source artifacts (spec FR-008). Referenced by `SourceAnchor.artifactId`. |
| `LabeledQAPair` | `{ id, question, answer, targetConceptIds, targetEdgeIds, assessmentType, isAmbiguous, sourceAnchors }` | The 20 representative Q&A pairs (spec FR-010). `isAmbiguous: true` on at least one entry, per the required ambiguous-question edge case. |

## Relationships

```text
CourseConcept ──(sourceConceptId/targetConceptId)── ConceptEdge
CourseConcept ──(conceptIds)── EvidenceEvent ──(edgeIds)── ConceptEdge
CourseConcept ──(targetConceptIds)── Assessment ──(targetEdgeIds)── ConceptEdge
CourseConcept / ConceptEdge / Assessment ──(sourceAnchors.artifactId)── SourceArtifact
LabeledQAPair ──(targetConceptIds/targetEdgeIds)── CourseConcept / ConceptEdge
```

No entity in this data model has a foreign key into a database — these are
structural (in-memory/JSON) relationships only. Postgres foreign keys are
Phase 1's (`account-course-artifact-foundation`) concern, not this
feature's.

## Evaluation rubrics (not a data entity)

`benchmark/dsa-course/rubrics/evaluation-rubrics.md` holds ten prose
sections, one per PRD §23.2 area (concept extraction, concept
deduplication, relation classification, homework/course-style extraction,
question correctness, question ambiguity, source grounding, text grading,
visual-structure extraction, misconception detection). Each section states
at least one concrete pass/fail criterion, per spec FR-012. This is
produced directly as Markdown in `tasks.md`, not derived from the schemas
above.
