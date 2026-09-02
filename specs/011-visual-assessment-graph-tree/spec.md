# Feature Specification: Visual Assessment (Graph/Tree)

**Feature Branch**: `011-visual-assessment-graph-tree`

**Created**: 2026-09-01

**Status**: Draft

**Input**: User description: "visual-assessment-graph-tree (Phase 6, PRD 16.5/24 Phase 6, D2). Graph/tree question renderer, web drawing/annotation input, vision parser -> structured node/edge JSON, low-confidence confirmation UX, structural grading, evidence update. Render a constrained graph/tree question from its known structured source representation; let the student draw/annotate their response on a web canvas (pointer events, no native app); send the drawing to a multimodal vision model that extracts nodes/edges/order into structured JSON matching deterministic-grading's existing checker input shapes exactly; grade via the existing deterministic checkers (BFS/DFS, tree traversal/insertion, topological sort, shortest path) already built in Phase 4, never a new checking mechanism; when the vision parser's confidence is low, show the student what was extracted and ask for confirmation before grading proceeds, never silently grade a possibly-misread drawing as wrong; commit real evidence through the existing evidence pipeline, same as every other response modality. Builds on deterministic-grading's checkers and learner-graph-evidence's evidence-commit pipeline rather than reimplementing grading or evidence recording."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Draw an answer to a graph/tree question and have it graded exactly (Priority: P1)

A student is given a constrained graph or tree question -- for example, "draw the order BFS visits these nodes" or "draw the resulting tree after inserting this value." They draw their answer directly on screen (mouse, trackpad, or touch), submit it, and get back a real, exact grading result -- not a vague AI impression of whether the drawing "looks right," but the same deterministic correctness check already used for typed/structured answers to the same kind of question.

**Why this priority**: This is the feature's entire reason to exist -- PRD's own framing (D2, §16.5) is specifically that graph/tree drawing is the first visual-assessment demo because it can be parsed into structured data and verified deterministically; without this, there is no visual assessment loop at all.

**Independent Test**: Given a real, validated graph/tree question and a drawn response that is objectively correct, submit it and confirm the result is a real "correct" outcome from the same deterministic checker already used for that question's domain, with real evidence committed. Submit an objectively incorrect drawing and confirm a real "incorrect" outcome with the specific real divergence shown, not a vague "wrong."

**Acceptance Scenarios**:

1. **Given** a real graph-traversal question with a known correct answer, **When** the student draws a matching, correct response and submits it, **Then** the system reports a real "correct" outcome produced by the same deterministic checker already used for that domain, and commits real evidence.
2. **Given** the same question, **When** the student draws a response that is genuinely incorrect, **Then** the system reports a real "incorrect" outcome naming the specific real divergence (e.g. the first node visited out of order), never a generic "wrong."
3. **Given** a student submits a blank or unreadably scribbled drawing, **When** it's processed, **Then** the system says plainly that no coherent structure could be extracted and lets the student try again, never forcing a nonsensical grading attempt or silently recording it as an ordinary wrong answer.

---

### User Story 2 - A possibly-misread drawing asks for confirmation, never grades silently (Priority: P2)

Sometimes a student's drawing is genuinely ambiguous to read (messy handwriting, an edge that could point either way). Rather than guessing and grading based on a possible misreading, the system shows the student what it thinks it saw and asks them to confirm or correct it before grading proceeds.

**Why this priority**: Without this, a legitimately correct answer that was merely hard to read could be marked wrong through no fault of the student's actual understanding -- a real trust risk PRD calls out explicitly (§16.5 step 5). User Story 1 already delivers the core loop for clearly-readable drawings; this protects the loop's trustworthiness for the harder, still-real case.

**Independent Test**: Submit a drawing constructed to be genuinely ambiguous (e.g. an edge direction that could reasonably be read two ways) and confirm the system shows its extracted interpretation and asks for confirmation rather than grading immediately; confirm that correcting the interpretation before grading changes the outcome to match the corrected structure, not the original misreading.

**Acceptance Scenarios**:

1. **Given** a drawing the extraction step has low confidence in, **When** it's processed, **Then** the student sees a plain-language summary of what was extracted and is asked to confirm it's accurate before any grading happens.
2. **Given** the student confirms the extracted structure is accurate, **When** they confirm, **Then** grading proceeds immediately using that confirmed structure, through the same deterministic checker as any other submission.
3. **Given** the student says the extraction is wrong and corrects it, **When** they submit the correction, **Then** grading uses the corrected structure, never the original low-confidence extraction.
4. **Given** a drawing the extraction step is genuinely confident about, **When** it's processed, **Then** grading proceeds immediately with no confirmation step -- confirmation is reserved for real low-confidence cases, not required on every submission.

---

### User Story 3 - The visual loop works across more than one constrained domain (Priority: P3)

The draw-parse-grade loop isn't hardcoded to one specific question type -- it works for at least two of the constrained domains deterministic grading already supports (for example, a graph-traversal question and a separate tree-structure question), proving the mechanism generalizes rather than being a single hardcoded demo path.

**Why this priority**: PRD's own exit criterion is "one strong visual demo works end-to-end," which User Story 1 alone already satisfies for a single domain -- this proves the same mechanism actually generalizes, which matters for the feature's real reusability but isn't required to prove the core loop works at all.

**Independent Test**: Submit a correct drawn response to a graph-traversal question and, separately, a correct drawn response to a tree-structure question; confirm both are graded correctly through their respective existing deterministic checkers with no domain-specific code added anywhere in this feature beyond what routes a drawing to the right existing checker.

**Acceptance Scenarios**:

1. **Given** a graph-traversal question and a tree-structure question, both with real, validated content, **When** a student draws and submits a correct response to each, **Then** both are graded correctly by their own real, existing deterministic checker.

---

### Edge Cases

- What happens when the vision parser extracts a structure with the wrong number of nodes/edges compared to what the question actually specifies (e.g. it hallucinated an extra node)? The extracted structure still goes through the deterministic checker, which already has its own real `invalid_input` handling for a malformed/inconsistent structure -- this feature does not need a second validation layer, only to route the real extracted structure through the checker honestly.
- What happens if the vision model call itself fails (network/API error) rather than producing a low-confidence result? The student sees a real, distinct failure message and can retry -- never silently treated as an incorrect answer.
- What happens when a student wants to redraw before submitting? The canvas supports clearing/undoing before submission; nothing is sent for parsing until the student actually submits.
- What happens when the confirmed/corrected structure a student provides doesn't match the question's declared checker domain's real input shape at all? The same real failure handling deterministic-grading's checkers already have applies -- an honest `invalid_input`-style outcome, never a fabricated pass or crash.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST render a graph/tree question from its real, known structured source representation (an already-validated question), so the student sees a concrete, real structure to respond to.
- **FR-002**: System MUST let a student draw/annotate a response using pointer input (mouse, trackpad, or touch) on a web canvas -- no native app or special hardware required.
- **FR-003**: A submitted drawing MUST be parsed into structured node/edge/order data matching exactly the shape the corresponding existing deterministic checker already expects -- this feature MUST NOT introduce a new or parallel structural-checking mechanism.
- **FR-004**: Grading a parsed drawing MUST use the same existing deterministic checker already used for that question's domain (graph traversal, tree traversal/insertion, topological sort, or shortest path) -- never a second, visual-specific correctness mechanism.
- **FR-005**: When the extraction step's confidence is low, system MUST show the student a plain-language summary of what was extracted and require confirmation (or a correction) before grading proceeds -- never silently grading a possibly-misread drawing.
- **FR-006**: A student's confirmation or correction of an extracted structure MUST be what's actually graded -- grading MUST NOT proceed against the original low-confidence extraction once the student has corrected it.
- **FR-007**: When extraction produces no coherent structure at all (blank/unreadable drawing), system MUST say so honestly and let the student retry -- never force a grading attempt on empty/nonsensical input.
- **FR-008**: Completing a visual response MUST commit real evidence through the existing evidence-commit pipeline, identical in kind to every other response modality -- this feature MUST NOT introduce a second evidence-recording path.
- **FR-009**: The mechanism MUST work across at least two of deterministic grading's existing constrained domains (e.g. graph traversal and tree structure), not be hardcoded to a single question type.
- **FR-010**: The rendered question and the structure ultimately graded MUST both be traceable back to the same real, underlying validated question -- never a mismatch between what was asked and what was graded.

### Key Entities

- **Drawing Submission**: A student's raw drawn response to one question, captured as canvas input, before and during extraction -- ephemeral working state, not a new mastery-affecting entity of its own.
- **Parsed Structure**: The vision model's extracted node/edge/order data plus its own confidence, in the exact shape the target checker domain expects -- what confirmation (User Story 2) operates on, and what grading actually consumes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A student can complete the full draw-submit-grade loop for a graph or tree question in a single sitting, receiving a real, specific grading result every time.
- **SC-002**: Zero visual submissions are graded using anything other than the same deterministic checker already used for that domain's typed/structured submissions -- no separate "visual correctness" judgment ever exists.
- **SC-003**: Every low-confidence extraction is shown to the student for confirmation before grading, with zero silent grades against an unconfirmed low-confidence reading.
- **SC-004**: A student's confirmed or corrected structure, not the original extraction, is what determines the grading outcome every time the two differ.
- **SC-005**: The mechanism is demonstrated working correctly across at least two distinct constrained domains, not only the one used for the very first demo.

## Assumptions

- This feature consumes already-validated graph/tree questions from the existing question bank (`assessment-generation-pipeline`) -- it is not a new way of generating or validating question content.
- Grading reuses `deterministic-grading`'s existing checkers (BFS/DFS, tree traversal/insertion, topological sort, shortest path) completely unchanged; this feature only adds the drawing-to-structure translation step in front of them.
- Evidence commit reuses `learner-graph-evidence`'s existing pipeline end to end; this feature does not decide correctness or write learner state itself.
- The drawing is captured as a raster image (a rendered snapshot of pointer/touch strokes) and sent to a vision-capable model for structural extraction, matching PRD §16.5's documented design -- this is not a structured, click-to-place interactive graph-builder input method.
- The submitted drawing image is retained (not discarded immediately after parsing) so a graded attempt remains auditable later, consistent with this project's general evidence-provenance expectations.
- Native/tablet-specific drawing input (Apple Pencil, PencilKit) is explicitly out of scope -- PRD frames that as a later, separate companion effort; this feature is web-only, pointer-event input.
- "Low confidence" is a real, reported value from the extraction step itself (the vision model's own stated confidence), not a value this feature invents independently.
