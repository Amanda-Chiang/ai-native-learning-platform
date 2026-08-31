# Assessment Pipeline

## Pipeline shape

```text
learner/course state
  -> assessment blueprint
  -> candidate generation
  -> independent solve/check
  -> quality validation
  -> student attempt
  -> modality-specific grading
  -> evidence commit
```

## Rules

- No one-shot, unvalidated assessment generation — every generated question
  passes through independent solve/check and quality validation before it's
  shown to a student.
- Prefer deterministic grading (code, data structures, boolean logic,
  numeric/symbolic math) wherever an exact checker can be written.
- When model grading is required, it must use structured rubrics, not free-
  form judgment.
- Ambiguous visual/handwritten parsing requires confirmation before grading
  proceeds.
- The tutor/generation model never writes learner mastery directly — only
  the evidence-commit step does, and only after grading.
- Generated practice must avoid copying source homework verbatim.
- Every course-specific question must be traceable to a source anchor in the
  uploaded course material.
