# Feature Specification: Concept Atlas Renderer

**Feature Branch**: `003-concept-atlas-renderer`

**Created**: 2026-09-01

**Status**: Draft

**Input**: User description: "concept-atlas-renderer: Phase 2 (renderer half) of docs/implementation-roadmap.md — the Concept Atlas graph visualization: React Flow + ELK rendering of the renderer-neutral course-graph DTO (units, concepts, relationships) already designed in .claude/skills/concept-atlas/ and its references (graph-domain-model.md, visual-language.md, interaction-states.md, relationship-taxonomy.md, testing.md), tested against the existing tests/fixtures/concept-atlas-demo.json fixture. No AI/extraction pipeline in this feature — that's the separate course-graph-ingestion feature, built after this one per the confirmed 2026-09-01 build-order decision (renderer first since it needs no external credentials; ingestion needs a live OpenAI key). Exit criterion: a student can view a course's concept atlas (units as bounded regions, concept mastery rings, typed relationship edges, a stable concept detail panel) that matches the design rules already written in the concept-atlas skill, verified via Playwright visual regression against the existing fixture."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the whole course as a map, not a list (Priority: P1) 🎯 MVP

A student opens a course and sees its concepts organized into bounded
regions by unit, with prerequisite and other relationships drawn between
them — a map of how the course fits together, not a flat list of topics.

**Why this priority**: this is the product's central differentiator (per
the project summary): helping students see the big picture instead of
learning topics in isolation. Without this, there is no atlas at all.

**Independent Test**: can be fully tested by loading the existing demo
fixture (5 units, 24 concepts, 22 relationships) and confirming every
unit renders as a visually bounded region containing its concepts, with
every relationship drawn as an edge between the correct two concepts.

**Acceptance Scenarios**:

1. **Given** a course with multiple units, **When** the student opens the
   atlas, **Then** each unit appears as a distinct, visually bounded
   region — never as a loose scatter of nodes with no visible grouping.
2. **Given** a course whose graph has 20-40+ concepts, **When** the
   student views the whole-course atlas, **Then** the layout remains
   legible (no illegible tangle of overlapping nodes/edges) rather than
   degrading into an unreadable hairball as the course grows.
3. **Given** two concepts in different units connected by a relationship,
   **When** the student views the atlas, **Then** that cross-unit
   connection is visually distinguishable from a within-unit connection,
   so integration points between units are easy to spot.

---

### User Story 2 - Expand a unit to see its concepts in detail (Priority: P1)

A student expands one unit to see its individual concepts clearly, without
every other unit's concepts also expanding and cluttering the view.

**Why this priority**: without progressive disclosure, a full course
atlas with 20-40+ concepts is unusable at a glance — this is what keeps
User Story 1's map legible as a course grows.

**Independent Test**: can be fully tested by expanding one unit in the
demo fixture and confirming its concepts become visible while sibling
units remain in their collapsed/summary form (or only reflow if space
genuinely requires it).

**Acceptance Scenarios**:

1. **Given** a collapsed unit, **When** the student expands it, **Then**
   its individual concepts become visible.
2. **Given** one unit is expanded, **When** the student looks at sibling
   units, **Then** they are not forced open or rearranged unless the
   available space genuinely requires it.
3. **Given** a student has expanded/collapsed specific units, **When**
   they return to the atlas later, **Then** the atlas remembers their
   layout preference rather than resetting to a default every visit.

---

### User Story 3 - Inspect one concept without losing the map (Priority: P2)

A student clicks a concept to see its full detail — canonical name, other
names it's known by, current mastery level, and what it connects to —
without the surrounding map jumping around or disappearing.

**Why this priority**: the atlas is a navigation and diagnostic tool, not
just a picture — students need to drill into one concept's evidence to
act on what the map shows them, but P1 is possible without this.

**Independent Test**: can be fully tested by clicking a concept in the
demo fixture and confirming a detail view opens showing its canonical
label, aliases, mastery state, and relationships, while the rest of the
map stays in place (no repositioning of unrelated nodes).

**Acceptance Scenarios**:

1. **Given** the whole-course atlas, **When** a student clicks a concept,
   **Then** a detail view opens showing that concept's canonical name,
   known aliases, current mastery level, and its relationships to other
   concepts.
2. **Given** a concept's detail view is open, **When** the student looks
   at the rest of the atlas, **Then** unrelated concepts and relationships
   are visually de-emphasized (not hidden) so the student can still see
   where the focused concept sits in the whole map.
3. **Given** a concept's detail view is open, **When** the student closes
   it, **Then** the atlas returns to its prior layout — nothing was
   permanently rearranged by opening the detail view.

---

### User Story 4 - Recognize which connections are still weak (Priority: P2)

A student can tell, at a glance, which relationships between concepts are
weakly demonstrated versus solidly understood — not just which individual
concepts are weak.

**Why this priority**: per the project's core differentiator, understanding
two concepts individually is not the same as understanding how they
connect — this is what makes that distinction visible, but the atlas is
still useful (P1-P3) without it.

**Independent Test**: can be fully tested by loading the demo fixture
(which includes both weak and strong relationships) and confirming weak
relationships are visually distinguishable from strong ones using more
than one visual cue.

**Acceptance Scenarios**:

1. **Given** a relationship with weak learner-demonstrated understanding,
   **When** the student views the atlas, **Then** it is visually distinct
   from a strongly-demonstrated relationship using at least two different
   visual cues (e.g. not opacity alone), so it remains noticeable even to
   a colorblind student or in a quick glance.
2. **Given** a weak relationship, **When** the student clicks it, **Then**
   they see why it's rated weak (e.g. what evidence, or lack of it, led to
   that rating).

---

### User Story 5 - Use the atlas on a tablet or phone (Priority: P3)

A student on a tablet or phone can still view and navigate the atlas,
even though the primary experience is designed for a larger screen.

**Why this priority**: nice-to-have reach, not core to the differentiator
— the PRD explicitly treats desktop/laptop as primary and mobile as
"remains usable," not equally optimized.

**Independent Test**: can be fully tested by viewing the demo fixture at
a tablet/phone-sized viewport and confirming the atlas is still navigable
(pan/zoom works, concept detail is reachable) without relying on a
side-by-side layout that doesn't fit the screen.

**Acceptance Scenarios**:

1. **Given** a tablet or phone-sized viewport, **When** the student opens
   the atlas, **Then** unit regions either stack or the atlas becomes
   pan/zoom-navigable rather than rendering an unusably cramped desktop
   layout.
2. **Given** a tablet/phone viewport, **When** the student opens a concept
   detail view, **Then** it appears in a way suited to the smaller screen
   (e.g. from the bottom) rather than a side panel that doesn't fit.

---

### Edge Cases

- What happens when two relationship records represent essentially the
  same connection reached through different extraction passes (a
  duplicate/alias edge, e.g. two edges between the same pair of concepts
  with different types)? This feature renders exactly what it is given —
  deduplication is an ingestion-time concern (a separate feature), not
  something the renderer silently hides or merges. The demo fixture
  includes two such cases specifically so this is a real, testable
  scenario, not a hypothetical.
- What happens when a concept has no relationships to any other concept
  yet (an isolated "knowledge island")? It must still render inside its
  unit region, visibly disconnected, rather than being dropped from the
  atlas — a disconnected concept is itself meaningful information for the
  student (per the project's differentiators).
- What happens when a concept legitimately has more than one relationship
  of different types to the same other concept? Both relationships render
  as separate edges — the atlas does not collapse them into one.
- What happens when the atlas is opened for a course with only one unit
  and a handful of concepts (the opposite extreme from the 20-40+ case)?
  It must still render correctly — bounded region, mastery rings, etc. —
  not assume a minimum course size.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The atlas MUST render each course unit as a distinct,
  visually bounded region (not merely nodes with no grouping boundary).
- **FR-002**: The atlas MUST render every concept's mastery level using
  at least two redundant visual signals together (a discrete state plus
  more than one visual encoding of it) — never a single cue such as color
  alone.
- **FR-003**: The atlas MUST render every relationship with both a
  standardized type and a human-readable label describing that specific
  connection, using visual encoding beyond color alone to distinguish
  relationship types from each other.
- **FR-004**: The atlas MUST visually distinguish a relationship that
  crosses between two different units from one that stays within a single
  unit.
- **FR-005**: The atlas MUST visually distinguish a weak relationship from
  a strong one using at least two different visual cues together, never
  opacity alone.
- **FR-006**: The atlas MUST support collapsing and expanding individual
  units independently, without forcing sibling units open or rearranging
  them unless space genuinely requires it.
- **FR-007**: The atlas MUST remember a student's expand/collapse and
  positioning choices for a course across visits, rather than resetting
  to a default layout every time.
- **FR-008**: Clicking a concept MUST open a stable detail view showing
  its canonical name, known aliases, current mastery level, and its
  relationships, without causing unrelated concepts to move.
- **FR-009**: While a concept's detail view is open, unrelated concepts
  and relationships MUST be visually de-emphasized, not hidden entirely.
- **FR-010**: Closing a concept's detail view MUST return the atlas to
  its prior layout, not a freshly recomputed one.
- **FR-011**: Clicking a weak relationship MUST surface why it is rated
  weak (the evidence or gap that produced the rating).
- **FR-012**: The atlas MUST remain legible (no illegible overlapping
  nodes/edges) for courses with at least 20-40 concepts across multiple
  units, not only for small/toy courses.
- **FR-013**: The atlas MUST render correctly and usably on a tablet or
  phone-sized viewport, adapting its layout (stacked regions and/or
  pan/zoom navigation, and a differently-placed detail view) rather than
  shrinking the desktop layout until it's unreadable.
- **FR-014**: The atlas MUST render exactly the units, concepts, and
  relationships it is given, including duplicate/alias relationships
  between the same concept pair — it MUST NOT silently merge, hide, or
  deduplicate relationship data (that is a separate, ingestion-time
  concern per `.claude/skills/concept-atlas/references/relationship-taxonomy.md`).
- **FR-015**: A concept with no relationships MUST still render inside
  its unit region, not be omitted from the atlas.

### Key Entities

- **Unit**: a bounded region of the atlas grouping related concepts, e.g.
  "Graphs" or "Dynamic Programming."
- **Concept**: a single teachable idea shown as a node, with a canonical
  name, known aliases (display-only — an alias never becomes a separate
  concept), and a current mastery level.
- **Relationship**: a typed, labeled connection between two concepts,
  carrying its own strength/state independent of either concept's own
  mastery level, and a flag for whether it crosses unit boundaries.
- **Layout preference**: which units a specific student has
  expanded/collapsed and how the view is arranged for a given course —
  personal to the student, and never changes what a unit/concept/
  relationship actually means.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Loading a course with 20-40+ concepts across multiple units
  produces zero overlapping or clipped nodes/edges in the rendered atlas.
- **SC-002**: 100% of relationships in a course's graph are distinguishable
  from each other by type using a visual cue beyond color alone (verified
  by checking each relationship type against every other for a redundant
  non-color differentiator).
- **SC-003**: 100% of weak relationships remain identifiable as weak even
  when color is removed from consideration (e.g. viewed in grayscale or
  by a colorblind reviewer).
- **SC-004**: Expanding one unit changes the rendered position of concepts
  in 0 sibling units unless the available screen space is insufficient to
  avoid it.
- **SC-005**: A student's unit expand/collapse state for a course is still
  correct after closing and reopening the atlas.
- **SC-006**: The atlas remains usable (concepts readable, detail view
  reachable) at a tablet-width and a phone-width viewport, verified
  visually, not just "does not crash."

## Assumptions

- This feature renders a course-graph DTO (units, concepts, relationships)
  that already exists as data — it does not fetch, generate, or extract
  that data itself. For this feature's development and testing, the
  existing checked-in fixture (`tests/fixtures/concept-atlas-demo.json`)
  stands in for real extracted course data; wiring the atlas to real,
  per-course data from the database is the responsibility of whichever
  future feature owns "give the atlas page a real course's graph" (Phase 1
  established courses/artifacts; the graph tables themselves and the
  extraction pipeline that populates them are `course-graph-ingestion`,
  built after this feature per the confirmed build order).
- Mastery levels and relationship strength are read as already-given input
  data (four discrete concept mastery states — unverified, exposed, weak,
  solid — and weak/strong relationship states, per
  `.claude/skills/concept-atlas/references/visual-language.md`) — this
  feature does not compute or update them.
- Layout preference (expand/collapse, positions) is stored per student per
  course and is separate from the canonical graph data — changing it never
  alters what a unit/concept/relationship means, consistent with
  `brain/architecture/graph-model.md`'s separation of canonical data from
  renderer-local layout state.
- The relationship type vocabulary is the five types already defined in
  `.claude/skills/concept-atlas/references/relationship-taxonomy.md`
  (`prerequisite-of`, `builds-on`, `applies-to`, `analogous-to`,
  `contrasts-with`) — this feature does not introduce new types.
- Desktop/laptop is the primary target; tablet/phone (User Story 5) must
  remain usable but is not required to be equally polished, per PRD §7.1's
  framing of the concept atlas benefiting from larger screen area while
  staying usable on smaller ones.
