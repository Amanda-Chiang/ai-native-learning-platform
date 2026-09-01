# Feature Specification: Deterministic Grading

**Feature Branch**: `007-deterministic-grading`

**Created**: 2026-09-01

**Status**: Draft

**Input**: User description: "deterministic-grading: deterministic reference checkers and a grading pipeline for data-structures-and-algorithms student responses, per docs/technical-prd.md sections 16.1-16.4 and the roadmap's Phase 4 row. Scope: (1) deterministic reference functions for the DSA domains the PRD names -- BFS/DFS traversal state and order, heap operations (insert/extract-min/extract-max, heap-property validity), tree traversal (in-order/pre-order/post-order) and insertion, topological sort validity, shortest paths on bounded/small graphs, and basic complexity calculations where computable from a structured input -- each implemented as a pure, exactly-checkable function, never an LLM judgment call; (2) a code-grading path that runs student/generated code in an isolated sandbox (E2B), records pass/fail plus real output, and uses an LLM only for qualitative explanation of the result, never for primary correctness when deterministic tests already decided it; (3) a text/conceptual-response grading path using a structured rubric with LLM-based grading against that rubric plus a second-pass confidence check on ambiguous responses; (4) grading any response type MUST end by committing evidence through learner-graph-evidence's existing commitEvidence action -- this feature never writes learner_concept_state/learner_edge_state directly. Out of scope: assessment blueprint schema and candidate question generation (assessment-generation-pipeline, built next), visual/drawn graph-tree grading (Phase 6), and bounded math/SymPy grading (not in the Phase 4 roadmap row). This feature is a grading capability consumed by two callers: assessment-generation-pipeline's own independent-solve/deterministic-checker validation step, and real student response grading."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A generated question is proven correct before it reaches a student (Priority: P1)

Before a generated data-structures/algorithms question enters the
reusable question bank, its answer key is checked by an independent
deterministic reference function, not just trusted from generation.
A question whose deterministic check disagrees with its stated answer
never reaches a student.

**Why this priority**: This is the trust guarantee the entire
assessment pipeline depends on — without it, a generated question could
carry a wrong or self-contradictory answer key, and every downstream
grading decision built on that key would be corrupted. Every other
story in this feature and in `assessment-generation-pipeline` builds on
this mechanism existing first.

**Independent Test**: Feed the checker a structured DSA problem (e.g. a
graph plus a claimed BFS traversal order) with a correct answer key and
confirm it validates; feed it one with a deliberately wrong answer key
and confirm it's rejected, not silently accepted.

**Acceptance Scenarios**:

1. **Given** a structured BFS/DFS, heap, tree, topological-sort, or
   bounded-shortest-path problem with a correct claimed answer,
   **When** the deterministic checker evaluates it, **Then** it
   confirms the answer as correct.
2. **Given** the same kind of problem with an incorrect claimed answer,
   **When** the checker evaluates it, **Then** it reports the
   disagreement specifically (what was expected vs. what was claimed),
   not just a generic pass/fail.
3. **Given** a problem whose structured input is genuinely ambiguous
   (e.g. a graph where tie-breaking order isn't fully specified),
   **When** the checker evaluates it, **Then** it reports the ambiguity
   explicitly rather than silently picking one interpretation and
   grading against it as if it were the only valid one.

---

### User Story 2 - A student's structured DSA answer is graded exactly (Priority: P1)

When a student submits a response in one of the supported deterministic
domains (a BFS/DFS order, a heap's state after operations, a tree after
insertion/traversal, a topological order, a shortest-path result), the
system grades it by exact computation against a real reference
implementation, not by asking a language model whether it looks right.

**Why this priority**: This is the product's core differentiator
applied to grading specifically — an "AI-graded" DSA answer that's
actually just an LLM guessing would silently reintroduce the exact
trust problem the whole learner-evidence system exists to prevent.

**Independent Test**: Submit a correct structured answer for a
supported domain and confirm it grades as correct with a specific,
inspectable reason; submit an incorrect one and confirm it grades as
incorrect with what was actually wrong.

**Acceptance Scenarios**:

1. **Given** a student's structured answer in a supported deterministic
   domain, **When** it's graded, **Then** the result is produced by
   exact computation against a real reference implementation of that
   domain, never an LLM's holistic judgment of correctness.
2. **Given** a correct answer, **When** graded, **Then** the result is
   "correct" with no ambiguity.
3. **Given** an incorrect answer, **When** graded, **Then** the result
   identifies specifically what differs from the correct answer (e.g.
   which step of a traversal diverged), not just "incorrect."
4. **Given** a graded structured response, **When** grading completes,
   **Then** real evidence is committed reflecting the actual outcome —
   grading never itself changes a mastery score directly.

---

### User Story 3 - A student's code is graded by actually running it (Priority: P2)

When a student submits code, it runs in an isolated sandbox against
real tests, and the pass/fail result — not an LLM's read of the code —
determines correctness. A language model may explain the result
afterward but never overrides what the tests actually showed.

**Why this priority**: Code is the one response type where "just run
it" is unambiguously the right answer, and building deterministic
grading without this path would leave real code submissions ungraded or
graded like free text.

**Independent Test**: Submit code that passes all tests and confirm it
grades as correct with the real test output attached; submit code that
fails and confirm the result reflects the actual failure, not a
plausible-sounding explanation invented instead of it.

**Acceptance Scenarios**:

1. **Given** a student's code submission and a set of tests for the
   question, **When** it's graded, **Then** the code actually executes
   in an isolated sandbox and the result is the real pass/fail outcome
   of those tests.
2. **Given** code that fails one or more tests, **When** graded,
   **Then** the result records which tests failed and the real output,
   not a summary invented without running the code.
3. **Given** a graded code submission, **When** an explanation is
   generated, **Then** the language model explains the real test
   result — it never contradicts or substitutes for that result.
4. **Given** code that times out or exceeds the sandbox's resource
   limits, **When** graded, **Then** the result says so plainly (e.g.
   "timed out"), never silently reported as a pass or a fail it didn't
   actually reach.

---

### User Story 4 - A free-text conceptual answer is graded against a real rubric (Priority: P2)

When a student answers in free text and no exact checker applies, the
response is graded against a structured rubric — required ideas,
acceptable alternative phrasings, known misconceptions, partial-credit
criteria — rather than an unconstrained model judgment call. A grading
result the model isn't confident about is flagged as such instead of
being committed as if it were certain.

**Why this priority**: This is the one domain where an exact checker
genuinely can't exist, so it's the feature's explicit test of "when no
exact checker exists, is grading still constrained and honest about its
own uncertainty" — lower priority than the deterministic paths because
it's inherently the least trustworthy signal, but still required for
DSA's actual mix of question types (e.g. "why does BFS guarantee
shortest paths in an unweighted graph?").

**Independent Test**: Grade a free-text answer that clearly satisfies
the rubric's required ideas and confirm it grades as correct; grade one
that's genuinely ambiguous relative to the rubric and confirm it's
flagged as low-confidence rather than committed as a confident
correct/incorrect result.

**Acceptance Scenarios**:

1. **Given** a free-text response and a structured rubric for the
   question, **When** it's graded, **Then** the grading result is
   produced against that rubric's specific required ideas/misconceptions,
   not an unconstrained "does this seem right" judgment.
2. **Given** a response that clearly satisfies the rubric, **When**
   graded, **Then** it's marked correct with the rubric criteria it
   satisfied identified.
3. **Given** a response the grading model isn't confident about, **When**
   graded, **Then** the result is explicitly flagged as low-confidence —
   it is never committed as evidence with the same certainty as a
   confident result.
4. **Given** a response matching a known misconception in the rubric,
   **When** graded, **Then** that specific misconception is identified
   in the result, not just a generic "incorrect."

---

### Edge Cases

- What happens when a checker receives structurally invalid input (e.g.
  a heap-operation trace that isn't a valid sequence of operations)? It
  must report the input as invalid, never silently coerce it into
  something checkable and grade that instead.
- What happens when the code sandbox itself fails to start or crashes
  for a reason unrelated to the student's code (an infrastructure
  failure)? This must be distinguishable from the student's code
  actually failing — never recorded as a grading result at all.
- What happens when a rubric-graded response's low-confidence flag fires
  repeatedly for the same question across many students? Out of scope
  for this feature to auto-remediate — that's a signal for whoever
  authors/reviews the question (`assessment-generation-pipeline`'s own
  validation), not something this grading feature resolves itself.
- What happens when a deterministic checker and a rubric-based grading
  path could both apply to the same response (e.g. a question that
  accepts either a structured trace or a prose explanation)? The
  response's actual modality determines which path runs — this feature
  doesn't choose between them speculatively.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide an independent deterministic
  checker for each of: BFS/DFS traversal state and order, heap
  operations and heap-property validity, tree traversal and insertion,
  topological sort validity, and shortest paths on bounded graphs.
- **FR-002**: Each deterministic checker MUST report a specific
  disagreement (what was expected vs. what was claimed/submitted) when
  its input doesn't check out, not merely a pass/fail boolean.
- **FR-003**: A deterministic checker MUST report genuinely ambiguous
  input as ambiguous rather than silently resolving it to one
  interpretation and grading against that.
- **FR-004**: The system MUST NOT use a language model's judgment as
  the primary correctness signal for any domain FR-001 covers.
- **FR-005**: The system MUST run student/generated code in an isolated
  sandbox and use the real pass/fail outcome of its tests as the
  correctness result.
- **FR-006**: A code grading result MUST include which tests failed and
  the real output produced, not a model-invented summary in place of
  actually running it.
- **FR-007**: A language model MAY generate a qualitative explanation of
  a code grading result but MUST NOT override or contradict the real
  test outcome.
- **FR-008**: A code execution that times out, crashes for
  infrastructure reasons, or exceeds sandbox resource limits MUST be
  reported as such — never recorded as an ordinary pass or fail.
- **FR-009**: A free-text/conceptual response MUST be graded against a
  structured rubric (required ideas, acceptable alternatives, known
  misconceptions, partial-credit criteria) associated with its
  question, not an unconstrained model judgment.
- **FR-010**: A rubric-graded response the grading model is not
  confident about MUST be explicitly flagged as low-confidence, and
  MUST NOT be committed as evidence with the same certainty as a
  confident grading result.
- **FR-011**: Every grading result, of any response type, MUST result in
  a real evidence commit through the existing validated evidence-commit
  mechanism (`learner-graph-evidence`) reflecting what was actually
  observed — no grading code path may write learner state directly.
- **FR-012**: The evidence committed from a grading result MUST reflect
  the response's actual independence/assistance level and the grading
  result's actual confidence — never a fabricated or default value
  standing in for either.

### Key Entities

- **Checker Result**: The outcome of a deterministic domain check —
  whether the input was valid, whether it matched the expected result,
  and if not, specifically what differed.
- **Code Grading Result**: The outcome of a sandboxed code execution —
  pass/fail per test, real output, and a distinct "did not complete"
  state for infrastructure failures/timeouts, separate from a genuine
  fail.
- **Grading Rubric**: The structured criteria (required ideas,
  acceptable alternatives, known misconceptions, partial-credit rules)
  a free-text response is graded against.
- **Rubric Grading Result**: The outcome of grading a free-text response
  against a rubric — which criteria were satisfied/missed, which known
  misconception (if any) was matched, and a confidence level that
  determines whether the result is flagged as low-confidence.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of generated questions in the supported deterministic
  domains have their answer key independently verified before entering
  the question bank — none reach a student unverified.
- **SC-002**: A structured response in a supported deterministic domain
  is graded with the same result every time it's submitted unchanged —
  grading is fully reproducible, not subject to model variance.
- **SC-003**: 100% of code submissions are graded from an actual
  sandboxed execution result — zero code grading results are produced
  without the code having actually run.
- **SC-004**: 100% of graded responses, across all response types,
  produce a real, traceable evidence record — zero direct learner-state
  writes from grading code.
- **SC-005**: Grading agreement with human-labeled correctness reaches
  at least 90% on deterministic/code domains and at least 80% on
  rubric-based conceptual responses (matching the PRD's own benchmark
  target), measured against a held-out labeled sample.
- **SC-006**: Low-confidence rubric gradings are flagged, not silently
  merged with confident ones, in 100% of cases below the confidence
  threshold.

## Assumptions

- This feature grades a response already in structured/final form (a
  parsed traversal order, a code submission, free text) — parsing a
  response out of its original modality (e.g. vision-parsing a drawn
  graph) is a different feature's job (Phase 6's
  `visual-assessment-graph-tree`), out of scope here.
- E2B is the sandbox for code execution, per this project's existing
  technology decision (`docs/technical-prd.md` 9.6) — no new sandbox
  technology is introduced by this feature.
- "Bounded" graphs/inputs for shortest-path and similar checks means the
  same realistic classroom scale already assumed elsewhere in this
  project (dozens of nodes, not web-scale graphs) — no special
  performance engineering beyond correctness is in scope.
- This feature's rubrics are authored/attached to questions by
  `assessment-generation-pipeline` (or manually for now, since that
  feature doesn't exist yet) — this feature consumes a rubric, it
  doesn't decide how rubrics get written.
- "Student" and course owner remain the same account for now, matching
  every other feature's current scope in this project — no separate
  enrollment model exists yet.
- The confidence threshold below which a rubric grading is flagged
  low-confidence is a tunable starting parameter (same treatment as
  `learner-graph-evidence`'s weights and `tutor-agent`'s ladder
  weights), not a fixed, precisely-calibrated cutoff from day one.
