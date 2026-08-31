# AI / Deterministic Boundaries

From PRD P4: foundation models reason, deterministic software verifies
whenever possible.

## Use an LLM for

- Interpretation of open-ended student input.
- Generation (questions, explanations, hints).
- Pedagogy (what to explain, how much to reveal).
- Grading only when no exact checker exists, and only via structured rubric.

## Use deterministic/executable checkers for

- Code correctness.
- Data-structure state and invariants.
- Boolean logic.
- Numeric/symbolic math.
- Graph traversal/reconciliation logic.

## Hard boundary

The LLM layer must never be the sole authority that mutates learner mastery
or the canonical ontology. It proposes; validated pipelines (evidence
commit, ingestion reconciliation) decide.
