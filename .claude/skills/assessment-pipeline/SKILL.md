---
name: assessment-pipeline
description: Use when building or modifying question generation, validation, grading, or evidence-commit logic for the assessment pipeline.
---

# Assessment Pipeline

Full pipeline and rules in `brain/architecture/assessment-pipeline.md` and
`brain/architecture/ai-boundaries.md`. Summary:

```text
learner/course state -> blueprint -> candidate generation ->
independent solve/check -> quality validation -> student attempt ->
modality-specific grading -> evidence commit
```

## Rules

- No one-shot, unvalidated generation reaches a student — every candidate
  question passes independent solve/check and quality validation first.
- Prefer deterministic graders (code execution, symbolic/numeric checkers,
  boolean/graph logic) whenever an exact checker exists for the domain.
- Model-based grading requires a structured rubric — never free-form
  judgment presented as a grade.
- Ambiguous visual/handwritten input requires an explicit confirmation step
  before grading, not a best-effort guess.
- The generation/tutor model never updates learner mastery directly — only
  the evidence-commit step does, after grading completes.
- Generated practice must not copy source homework verbatim — check
  similarity, not just topical relevance.
- Course-specific questions/answer keys/explanations must carry a source
  anchor into the uploaded course material; if no source material exists,
  the item cannot be labeled course-specific.

## Should not own

Visual frontend implementation, or any learner-state mutation outside the
validated evidence-commit API.
