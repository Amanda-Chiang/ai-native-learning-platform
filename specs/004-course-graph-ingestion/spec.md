# Feature Specification: Course Graph Ingestion

**Feature Branch**: `004-course-graph-ingestion`

**Created**: 2026-09-01

**Status**: Draft

**Input**: User description: "course-graph-ingestion: Phase 2 (ingestion half) of docs/implementation-roadmap.md, built after concept-atlas-renderer per confirmed 2026-09-01 build-order decision. Takes uploaded course material (already stored via Phase 1's artifact upload) and an OpenAI API key, and produces a CourseGraph (units, concepts, relationships) matching the renderer-neutral DTO in src/types/graph/course-graph.ts, populated with source anchors back to the uploaded artifacts (Constitution: course-specific claims must carry source anchors). Uses the existing tests/fixtures corpus (concepts.json, edge-cases.json, qa-pairs.json under .claude/skills/concept-atlas or wherever the domain corpus lives) as an eval/scoring harness for extraction quality, per Constitution Principle IV (offline-scoreable). Exit criterion: given an uploaded course artifact, the system extracts a CourseGraph that a downstream call to concept-atlas-renderer can render as-is, with extraction quality measured against the checked-in corpus rather than eyeballed."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Extract concepts and relationships from an uploaded artifact (Priority: P1)

An instructor or admin has already uploaded a course artifact (lecture
notes, slides, a problem set) via the existing artifact upload flow. They
trigger extraction, and the system reads the artifact and produces a set of
candidate concepts and typed relationships between them, each one anchored
back to the specific part of the artifact it came from.

**Why this priority**: Without this, there is no course ontology at all —
every other story in this feature depends on candidate concepts and edges
existing first. This is the MVP: an artifact goes in, a first-pass graph
comes out.

**Independent Test**: Upload a single artifact, run extraction, and confirm
the system produces at least one concept and one relationship, each with a
non-empty source anchor pointing back into that same artifact.

**Acceptance Scenarios**:

1. **Given** an uploaded lecture artifact discussing a well-defined topic
   (e.g., "Binary Search Trees"), **When** extraction runs, **Then** the
   system produces at least one concept whose canonical name and
   description reflect that topic, with a source anchor citing the
   artifact.
2. **Given** an artifact that introduces two related ideas (e.g., "Binary
   Search Tree" and "Balanced Binary Search Tree"), **When** extraction
   runs, **Then** the system produces a typed relationship between the two
   corresponding concepts, with its own source anchor and a plain-language
   explanation of the relationship.
3. **Given** an artifact with no extractable course content (e.g., a blank
   or purely administrative document), **When** extraction runs, **Then**
   the system completes without error and produces zero concepts rather
   than fabricating placeholder ones.

---

### User Story 2 - Reconcile new extractions against the existing course ontology (Priority: P1)

An instructor uploads a second artifact for a course that already has
concepts and relationships from a prior extraction. The same idea often
reappears under a different name or with additional detail. The system
must recognize that overlap rather than creating duplicate concepts, while
still recording the new artifact as an additional source anchor.

**Why this priority**: A course is built from many artifacts over time. If
every new upload created its own disconnected set of concepts, the
resulting ontology would fragment into near-duplicates almost immediately,
making the atlas confusing and the extraction quality unmeasurable against
a stable corpus. This has to work from the second artifact onward, so it
ships alongside first-pass extraction rather than after it.

**Independent Test**: Extract from two artifacts that both discuss the same
underlying concept under different phrasing, and confirm the system
produces one concept (with both names captured — one canonical, one as an
alias) with source anchors into both artifacts, not two separate concepts.

**Acceptance Scenarios**:

1. **Given** an existing confirmed concept "Breadth-First Search" and a
   newly uploaded artifact that refers to the same idea as "BFS" in a
   different context, **When** extraction runs, **Then** the system
   attaches "BFS" as an alias of the existing concept and adds the new
   artifact as an additional source anchor, rather than creating a second
   concept.
2. **Given** two artifacts that describe genuinely different concepts that
   happen to share a similar name, **When** extraction runs, **Then** the
   system keeps them as separate concepts rather than incorrectly merging
   them.
3. **Given** a new artifact that describes a relationship between two
   concepts that already exist from prior extractions, **When** extraction
   runs, **Then** the system adds that relationship referencing the
   existing concepts rather than re-creating them.

---

### User Story 3 - Review queue for extracted candidates before they become part of the visible course graph (Priority: P2)

An admin/instructor reviewer opens a queue of newly extracted concepts and
relationships that have not yet been confirmed, and accepts, edits, or
rejects each one before it becomes part of what students see in the
concept atlas.

**Why this priority**: Extraction is probabilistic — it will sometimes be
wrong, vague, or produce a relationship that doesn't hold up. Per
Constitution Principle V, canonical course ontology is system-owned and
must go through a validated process, not be trusted un-reviewed the moment
a model produces it. This depends on US1/US2 already producing candidates
to review.

**Independent Test**: With a course that has pending "proposed" concepts
and edges from a prior extraction run, open the review queue, confirm one
candidate and reject another, and verify only the confirmed one becomes
visible to the renderer/atlas while the rejected one is excluded.

**Acceptance Scenarios**:

1. **Given** a freshly extracted concept in "proposed" status, **When** a
   reviewer confirms it, **Then** its status becomes "confirmed" and it
   becomes eligible to appear in the rendered course atlas.
2. **Given** a freshly extracted concept a reviewer determines is wrong or
   redundant, **When** the reviewer rejects it, **Then** it is archived and
   excluded from the rendered course atlas, without deleting the historical
   record of the extraction.
3. **Given** a reviewer wants to correct a clearly-mistyped canonical name
   or an overly narrow description before confirming, **When** they edit
   the candidate, **Then** the correction is saved and carried into the
   confirmed record.

---

### User Story 4 - Student flags a concept or relationship as confusing or wrong (Priority: P3)

A student viewing the concept atlas notices a relationship that seems
wrong, or a concept that seems duplicated or mislabeled, and flags it. That
flag is recorded and routed for reconciliation review — it does not, by
itself, change what every other student sees.

**Why this priority**: This closes the loop between the people actually
using the graph and its ongoing correctness, but it is not required for
the graph to exist or be useful in the first place — it's a quality-signal
feature layered on top of US1-US3.

**Independent Test**: As a student, flag a live concept or relationship
with a reason; confirm the flag is recorded as feedback tied to that
student and that concept/relationship's current state, and that the
concept/relationship itself is visually unchanged for other students
immediately after.

**Acceptance Scenarios**:

1. **Given** a student viewing a relationship they believe is mislabeled,
   **When** they submit a "wrong relationship" flag with a short reason,
   **Then** the flag is recorded against that relationship without
   altering its type, status, or visibility for any student.
2. **Given** a concept has received multiple independent student flags,
   **When** a reviewer opens the review queue, **Then** those flags are
   visible as a prioritization signal alongside the original extraction
   context.

---

### Edge Cases

- What happens when an artifact's content doesn't cleanly fit any of the
  standard relationship types? (Already resolved by the existing
  `ConceptEdge.relationType: "other"` + required `relationTypeNote` shape —
  extraction must produce this shape rather than forcing a bad fit into one
  of the standard types.)
- How does the system handle an artifact that is unreadable (corrupted
  upload, unsupported format, empty file)? Extraction must fail visibly
  with a clear status, not silently produce zero concepts indistinguishable
  from "this artifact genuinely had no course content."
- How does the system handle two artifacts that directly contradict each
  other (e.g., a corrected slide deck superseding an earlier draft)? Both
  extractions are recorded with their own source anchors; reconciliation
  does not silently pick a winner — a reviewer resolves the conflict.
- What happens if extraction produces a relationship between two concepts
  that turn out to be the exact same concept once reconciliation runs
  (a self-relationship)? The system must not produce a self-referencing
  relationship — it collapses into the alias-merge case from US2 instead.
- What happens when a course has zero confirmed concepts yet (first
  artifact, still pending review)? The concept atlas for that course must
  render as an empty-but-valid graph, not an error state.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow triggering extraction against a
  specific already-uploaded artifact and produce zero or more candidate
  concepts, each carrying: a canonical name, a description, an importance
  signal, and at least one source anchor pointing back into that artifact.
- **FR-002**: The system MUST allow triggering edge extraction that
  produces zero or more candidate relationships between concepts (existing
  or newly extracted in the same run), each carrying: a relationship type
  drawn from the standard seven-type taxonomy or `"other"` with a required
  explanatory note, a plain-language explanation, and at least one source
  anchor.
- **FR-003**: Every extracted concept and relationship MUST start in a
  `"proposed"` status and MUST NOT be visible in the rendered concept atlas
  until it reaches `"confirmed"` status.
- **FR-004**: When new extraction output substantially overlaps with an
  existing confirmed or proposed concept (same underlying idea under a
  different name or phrasing), the system MUST attach the new artifact as
  an additional source anchor and record the alternate name as an alias,
  rather than creating a duplicate concept.
- **FR-005**: The system MUST NOT merge two concepts that reconciliation
  cannot confidently determine are the same idea — an uncertain case MUST
  be left as separate proposed concepts for a reviewer to resolve, not
  silently auto-merged.
- **FR-006**: The system MUST provide a review interface where a reviewer
  can confirm, edit, or reject each proposed concept and relationship, and
  MUST record which action was taken.
- **FR-007**: Rejecting a proposed concept or relationship MUST archive it
  (preserving the record of what was extracted and why) rather than
  deleting it outright.
- **FR-008**: Every concept and relationship exposed by this feature MUST
  carry at least one source anchor (artifact reference, locator, and
  excerpt) at all times — this must hold for freshly proposed records, not
  only confirmed ones, since Constitution Principle V applies to any
  course-specific claim regardless of review status.
- **FR-009**: The system MUST allow a student to submit a flag on a
  specific concept or relationship with a short reason, and MUST record
  that flag as feedback tied to the student and the flagged item's current
  state.
- **FR-010**: A student flag MUST NOT itself alter the flagged concept or
  relationship's canonical data (name, description, type, status,
  visibility) — it can only appear as a signal in the reviewer queue.
- **FR-011**: The system MUST NOT produce a self-referencing relationship
  (a relationship whose source and target resolve to the same concept after
  reconciliation).
- **FR-012**: When an artifact cannot be read or processed, extraction MUST
  end in a distinct failure status, not a "succeeded with zero concepts"
  status.
- **FR-013**: The system MUST provide a way to run extraction against the
  checked-in benchmark corpus's source artifacts and score the resulting
  concepts and relationships against that corpus's expected concepts and
  relationships, producing a repeatable, non-eyeballed quality measure
  (Constitution Principle IV).
- **FR-014**: The set of confirmed concepts and relationships for a course
  MUST be retrievable in the renderer-neutral course-graph shape
  (`src/types/graph/course-graph.ts`) so that an existing consumer (the
  concept atlas renderer) can render it without any ingestion-specific
  knowledge; concepts with no learner evidence yet MUST default to the
  DTO's baseline mastery/relationship states rather than a fabricated
  higher state (Constitution Principle III).

### Key Entities

- **CourseConcept** *(already defined, `src/types/domain/concept.ts`)*: A
  single teachable idea within one course — canonical name, aliases,
  description, importance score, source anchors, review status
  (`proposed`/`confirmed`/`archived`), and confidence. This feature is
  responsible for producing and reconciling instances of this type; it
  does not redefine it.
- **ConceptEdge** *(already defined, `src/types/domain/concept-edge.ts`)*: A
  directed, typed relationship between two `CourseConcept`s — relation
  type (from the standard taxonomy or `"other"` with a note), explanation,
  source anchors, review status, and confidence. Multiple edges between
  the same pair are valid (multigraph).
- **SourceAnchor** *(already defined, `src/types/domain/source-anchor.ts`)*:
  A pointer from a concept or edge claim back to the specific artifact,
  locator, and excerpt it was grounded in.
- **Extraction Run**: A record of one attempt to extract concepts/edges
  from one artifact — which artifact, when, what it produced, and whether
  it succeeded, failed, or produced zero results. New to this feature;
  needed to distinguish "genuinely no content" from "processing failed"
  (Edge Cases) and to give reviewers extraction context.
- **Reconciliation Decision**: A record of how a candidate concept/edge was
  resolved against existing ontology — merged as an alias, kept separate,
  or flagged for manual review. New to this feature; needed so US2's
  merge/no-merge decisions are auditable, not silent.
- **Student Flag**: A student's reported concern about a specific concept
  or relationship — reason, who flagged it, when, and which item's
  current state it refers to. New to this feature; explicitly feedback
  evidence, never a direct ontology mutation (Constitution Principle V).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Running extraction against the benchmark corpus's source
  artifacts produces concepts and relationships that match the corpus's
  expected concepts/relationships at a measurable, repeatable rate (not
  eyeballed), and that rate can be re-checked after any prompt or pipeline
  change without new manual review.
- **SC-002**: A course with zero prior extractions goes from "artifact
  uploaded" to "reviewer sees a non-empty candidate queue" without any
  manual data entry.
- **SC-003**: After two artifacts covering overlapping material are both
  processed, the confirmed concept count for the overlapping material is
  the same as if only the more detailed artifact had been processed alone
  — i.e., no duplicate concepts survive to confirmation for the same idea.
- **SC-004**: 100% of concepts and relationships ever exposed by this
  feature (proposed, confirmed, or archived) carry at least one source
  anchor — zero unanchored course claims, checked automatically.
- **SC-005**: A reviewer can take a course from "N proposed candidates" to
  "0 proposed candidates" (all confirmed, edited, or rejected) using only
  the review interface, without needing direct database access.
- **SC-006**: A student-submitted flag never changes what a second student
  viewing the same concept or relationship sees, verified immediately
  after submission.

## Assumptions

- Extraction runs against artifacts already uploaded and stored via the
  Phase 1 artifact pipeline (`account-course-artifact-foundation`); this
  feature does not add a new upload mechanism.
- This feature produces and reconciles canonical course ontology
  (`CourseConcept`/`ConceptEdge`) — it does not compute per-learner mastery
  or relationship strength. Per `docs/implementation-roadmap.md`, that is
  `learner-graph-evidence` (Phase 3). Concepts and relationships with no
  learner evidence yet are rendered using the course-graph DTO's baseline
  states (`masteryState: "unverified"`, `learnerState: "strong"` — "weak"
  is an earned, evidence-backed state per Constitution Principle III, not
  a default absence-of-evidence state).
- "Substantially overlaps" (FR-004/FR-005) is a similarity judgment made
  by the extraction/reconciliation process itself; the exact
  matching/confidence approach is a technical decision for the planning
  phase, not a product-level ambiguity — this spec only fixes the required
  behavior at each confidence tier (merge as alias / keep separate / route
  to reviewer).
- The review interface (US3) is for admins/instructors, reusing whatever
  authenticated-role distinction already exists from Phase 1; this feature
  does not introduce a new user role system.
- The benchmark corpus at `benchmark/dsa-course/` (concepts.json,
  edges.json, artifacts.json, edge-cases.json, and the source markdown
  under `sources/`) is the offline scoring corpus referenced by FR-013 and
  SC-001; `qa-pairs.json` in the same directory belongs to the separate
  `assessment-generation-pipeline` feature and is out of scope here.
- OpenAI is the extraction model provider (per the confirmed 2026-09-01
  build-order decision and the user's existing API key); provider choice
  is a technical/plan-level decision, not re-litigated here.
