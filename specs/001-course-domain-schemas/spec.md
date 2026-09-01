# Feature Specification: Course Domain Schemas & Benchmark Corpus

**Feature Branch**: `001-course-domain-schemas`

**Created**: 2026-09-01

**Status**: Draft

**Input**: User description: "course-domain-schemas: Phase 0 of docs/implementation-roadmap.md — define the core domain schemas (CourseConcept, ConceptEdge, EvidenceEvent, Assessment per docs/technical-prd.md §10) and build a small benchmark corpus (5 lecture artifacts, 2 homework sets, 30 labeled concepts, 30 labeled relationships, 20 representative Q&A) from one real data-structures-and-algorithms course, with evaluation rubrics defined before any production prompts are written. Exit criterion: schemas and benchmark are stable enough to diff prompt/pipeline changes against."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Stable domain vocabulary to build every later phase against (Priority: P1)

The platform builder needs one settled, written-down definition of what a
"concept," a "relationship between concepts," a "piece of evidence," and an
"assessment" are, before any ingestion, learner-graph, or assessment-
generation work starts. Every later phase (course-graph ingestion, learner
evidence, assessment generation, review scheduling, visual grading) reads
and writes these same four entities — if the definitions shift after
Phase 2 starts, every downstream phase has to be revisited.

**Why this priority**: everything else in the roadmap (`docs/implementation-
roadmap.md`) depends on this. It is the only phase with no upstream
dependency, and it gates whether Phase 1's Postgres schema needs revision
before it's built.

**Independent Test**: can be fully tested by writing out one real example
of each entity (one concept, one relationship, one evidence event, one
assessment) from the chosen course and confirming every field the later
phases need (per `docs/technical-prd.md` §10) is present, with no field
left ambiguous about what value it should hold.

**Acceptance Scenarios**:

1. **Given** a real lecture, homework, or practice-exam artifact from the
   chosen course, **When** the builder tries to describe one concept it
   teaches using the concept schema, **Then** every required field has an
   unambiguous value (no "TBD" or open interpretation).
2. **Given** two concepts that are genuinely related (e.g. "FIFO queue" and
   "breadth-first search"), **When** the builder tries to describe that
   relationship using the relationship schema, **Then** the relationship
   type, direction, and supporting source anchor are all expressible
   without inventing new schema fields.
3. **Given** a hypothetical student action (a chat answer, a graded
   question attempt, a homework submission), **When** the builder tries to
   record it using the evidence schema, **Then** the schema can distinguish
   exposure-only evidence from stronger retrieval/application/transfer
   evidence, per Constitution Principle III (Exposure Is Not Mastery).

---

### User Story 2 - A benchmark to detect regressions before any generation prompt exists (Priority: P1)

Before any concept-extraction prompt, relationship-classification prompt,
or question-generation prompt is written, the builder needs a small,
manually labeled reference set from a real course to compare pipeline
output against. Without this, there is no way to tell whether a later
prompt change made concept extraction better or worse — only vibes.

**Why this priority**: this is what turns Phase 2–6 development from
guesswork into measurable iteration. It has to exist *before* the first
production prompt (per the roadmap's Phase 0 description), not be
retrofitted afterward once a prompt's blind spots have already been baked
in.

**Independent Test**: can be fully tested by taking the finished benchmark
corpus and confirming a person unfamiliar with it could independently
re-derive most of the same concept/relationship/question labels from the
same source artifacts — i.e., the labels are grounded in the material, not
in the labeler's memory of the course.

**Acceptance Scenarios**:

1. **Given** the 5 selected lecture artifacts and 2 homework sets from one
   real data-structures-and-algorithms course, **When** the builder
   manually labels concepts and relationships from them, **Then** the
   result contains at least 30 labeled concepts and 30 labeled
   relationships, each traceable to the specific source artifact it came
   from.
2. **Given** the labeled concepts and relationships, **When** the builder
   writes representative questions a course-grounded assessment pipeline
   should later be able to generate, **Then** the result contains at least
   20 question/answer pairs, each tagged with which concept(s) or
   relationship(s) it tests and its intended assessment type (retrieval,
   mechanism, application, connection, or transfer, per PRD §15.2).
3. **Given** the finished benchmark, **When** a future pipeline change is
   made (e.g. a different concept-extraction prompt), **Then** its output
   can be scored against the benchmark's labels to produce a pass/fail or
   percentage-agreement number, without needing to re-derive the benchmark.

---

### User Story 3 - Evaluation rubrics defined before generation prompts exist (Priority: P2)

The builder needs written criteria for what "correct" looks like for each
of the ten evaluation areas named in PRD §23.2 (concept extraction, concept
deduplication, relation classification, homework/course-style extraction,
question correctness, question ambiguity, source grounding, text grading,
visual-structure extraction, misconception detection) before writing the
prompts those rubrics will judge — so the rubric isn't unconsciously
shaped to match whatever the first prompt happens to produce.

**Why this priority**: lower priority than the schemas/corpus themselves
(User Stories 1–2) because some rubrics (e.g. visual-structure extraction)
apply to phases that are months away, but every rubric still needs to
exist in outline form now so later phases don't invent inconsistent
success criteria on the fly.

**Independent Test**: can be fully tested by checking that each of the ten
evaluation areas from PRD §23.2 has a written rubric describing what
counts as a pass, without referencing any specific prompt or model.

**Acceptance Scenarios**:

1. **Given** the ten evaluation areas listed in PRD §23.2, **When** the
   builder reviews the rubric document, **Then** each area has at least one
   concrete, checkable pass/fail criterion.
2. **Given** a rubric for a phase that hasn't started yet (e.g. visual-
   structure extraction, which depends on Phase 6), **When** the builder
   reads it, **Then** it is still specific enough to be usable once that
   phase starts, rather than a placeholder restating the area's name.

---

### Edge Cases

- What happens when a concept from the source course material doesn't
  cleanly fit any of the PRD's standard relationship types
  (`prerequisite_for`, `part_of`, `mechanism_for`, `contrasts_with`,
  `used_in`, `generalizes_to`, `example_of`)? The benchmark corpus must
  include at least one such case and record how it was resolved (e.g. the
  closest-fit type plus a note), since Phase 2's real extraction pipeline
  will hit this too.
- What happens when the same concept appears under two different names in
  different source artifacts (e.g. "BFS" in lecture notes vs. "breadth-
  first search" in a homework prompt)? The concept schema must be able to
  represent this as one canonical concept with recorded aliases, not two
  separate concepts — this is a required test case in the benchmark
  corpus, not an assumption.
- What happens when a piece of student evidence should plausibly support
  more than one concept or more than one relationship at once (e.g. a
  question that tests both a concept and its connection to another
  concept)? The evidence schema must support attaching evidence to
  multiple concept IDs and multiple edge IDs simultaneously, per PRD §10.3.
- What happens when a labeled benchmark question has no single correct
  answer (i.e., it's ambiguous)? The benchmark corpus must include at
  least one deliberately ambiguous question, labeled as such, so the
  question-ambiguity rubric (User Story 3) has a real positive test case.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The concept schema MUST represent, at minimum, a stable
  identifier, the owning course, a canonical name, aliases/source-specific
  terminology, a normalized description, unit membership, a course-
  importance signal, source provenance, and an ontology confidence/status
  (proposed/confirmed/archived), per PRD §10.2.
- **FR-002**: The relationship (concept-edge) schema MUST represent a
  stable identifier, source and target concept identifiers, a semantic
  relationship type drawn from the PRD's standard taxonomy (or an
  explicitly recorded non-standard type, per the Edge Cases section),
  directionality, a short normalized explanation, source provenance
  (anchored to the originating artifact), and an ontology confidence/
  status.
- **FR-003**: The schema MUST support more than one relationship existing
  between the same pair of concepts at once (a multigraph), per PRD §10.1
  and Constitution Principle I — uniqueness MUST NOT be inferred from the
  (source, target) pair alone.
- **FR-004**: The evidence schema MUST represent, at minimum, a stable
  identifier, the student and course it belongs to, the concept(s) and/or
  edge(s) it provides evidence about, an evidence type (exposure,
  retrieval, explanation, application, transfer, relationship_explanation,
  misconception, annotation_confusion_signal, or instructor_feedback, per
  PRD §10.3), correctness, grader confidence, assistance level, difficulty,
  transfer distance, and a link back to its originating source (artifact,
  assessment attempt, or conversation turn).
- **FR-005**: The evidence schema MUST make it structurally impossible to
  represent an exposure-tier event as directly producing a mastery-tier
  state change — i.e., the schema itself must distinguish "this happened"
  from "this counts as independent demonstration," consistent with
  Constitution Principle III.
- **FR-006**: The assessment schema MUST represent, at minimum, the target
  concept(s) and edge(s) an assessment item is meant to test, an assessment
  type (retrieval, mechanism, application, connection, or transfer, per PRD
  §15.2), a difficulty level, the response modality it expects, required
  prerequisites, forbidden concepts (to bound scope), expected solution
  properties, and a maximum recommended time.
- **FR-007**: Every course-specific instance of the concept, relationship,
  and assessment schemas MUST be able to carry at least one source anchor
  pointing into an uploaded course artifact, per Constitution Principle V.
- **FR-008**: The benchmark corpus MUST be built from artifacts belonging
  to one real data-structures-and-algorithms course and MUST include at
  least 5 lecture artifacts and 2 homework sets as source material.
- **FR-009**: The benchmark corpus MUST include at least 30 manually
  labeled concepts and 30 manually labeled relationships, each using the
  schemas from FR-001–FR-003 and each traceable to a specific source
  artifact from FR-008.
- **FR-010**: The benchmark corpus MUST include at least 20 representative
  question/answer pairs, each tagged with the concept(s)/edge(s) it targets
  and its assessment type per FR-006.
- **FR-011**: The benchmark corpus MUST include the edge-case examples
  named in the Edge Cases section (a non-standard relationship type, a
  concept with multiple source-specific aliases, evidence attached to
  multiple concepts/edges at once, and one deliberately ambiguous
  question), so later validation logic has real positive test cases rather
  than only clean examples.
- **FR-012**: A written rubric MUST exist for each of the ten evaluation
  areas named in PRD §23.2, each stating at least one concrete, checkable
  pass/fail criterion, independent of any specific prompt or model choice.
- **FR-013**: The schemas and benchmark corpus MUST be recorded in a form
  that a later change to a generation prompt or extraction pipeline can be
  scored against without needing to redo the labeling work — i.e., the
  benchmark is a stable, reusable artifact, not throwaway scratch work.

### Key Entities

- **CourseConcept**: a single teachable idea within a course (e.g. "breadth-
  first search"). Belongs to a course and a unit, has a canonical name plus
  aliases, an importance signal, source provenance, and a confidence/status
  reflecting how settled the system considers it.
- **ConceptEdge**: a directed, typed relationship between two
  `CourseConcept`s (e.g. "FIFO queue" `mechanism_for` "breadth-first
  traversal"). Multiple edges may exist between the same two concepts.
  Carries its own provenance and confidence, independent of the two
  concepts it connects.
- **EvidenceEvent**: an immutable record of something a specific student
  did that bears on their understanding of one or more concepts and/or
  edges (a conversation turn, a graded attempt, an uploaded artifact
  interaction). Tagged with an evidence type that determines how strongly
  it can move learner state, per Constitution Principle II.
- **Assessment** (blueprint): a specification for a practice or exam
  question — what it targets, at what difficulty, in what modality — used
  to generate or select an actual question, distinct from the question
  itself.
- **Benchmark corpus**: the fixed, versioned collection of source artifacts
  plus their manual `CourseConcept`, `ConceptEdge`, and question/answer
  labels, used as a stable comparison point for all later pipeline work.
- **Evaluation rubric**: a written pass/fail standard for one of the ten
  PRD §23.2 evaluation areas, used to judge pipeline output against the
  benchmark corpus.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All four domain schemas (concept, relationship, evidence,
  assessment) can represent every entity in the benchmark corpus without
  requiring an undocumented field or an ad hoc exception.
- **SC-002**: The benchmark corpus contains at least 30 labeled concepts,
  30 labeled relationships, and 20 labeled question/answer pairs, all
  traceable to source artifacts from one real course, plus the 4 named
  edge-case examples.
- **SC-003**: A written rubric with at least one concrete pass/fail
  criterion exists for all 10 evaluation areas named in PRD §23.2.
- **SC-004**: A person other than the original labeler, given only the
  source artifacts and the schemas, can independently produce concept and
  relationship labels that agree with the existing benchmark labels on at
  least 80% of cases — evidence that the labels reflect the source
  material rather than the labeler's private judgment.
- **SC-005**: When a future prompt or pipeline change is scored against the
  benchmark corpus, the comparison can be completed without modifying the
  benchmark corpus itself.

## Assumptions

- One real data-structures-and-algorithms course, already accessible to
  the builder (their own coursework or an equivalent real syllabus), is
  used as the sole source for the benchmark corpus, per PRD §5 and the
  confirmed MVP scope (see `docs/implementation-roadmap.md`).
- "Lecture artifacts" means slides, notes, or recordings' transcripts
  covering distinct lecture sessions; "homework sets" means assignment
  prompts (with or without solutions) from that same course.
- Labeling is done manually by the builder for this phase; no extraction
  model is used to produce the benchmark's ground-truth labels, since the
  benchmark's purpose is to be an independent check on later model-driven
  extraction, not itself model-generated.
- The relationship type taxonomy from PRD §10.2 (`prerequisite_for`,
  `part_of`, `mechanism_for`, `contrasts_with`, `used_in`,
  `generalizes_to`, `example_of`) is the starting vocabulary; the benchmark
  corpus's non-standard-relationship edge case exists specifically to test
  whether that vocabulary needs extension, not to imply it's already known
  to be incomplete.
- This feature produces schemas and a benchmark corpus as durable
  artifacts (written documents/data files); it does not include building
  the Postgres tables, API endpoints, or any UI — that begins in Phase 1
  per `docs/implementation-roadmap.md` and is out of scope here.
- Cross-course concept reconciliation is out of scope, per PRD decision D1
  — the benchmark corpus and schemas are course-specific for this MVP.
