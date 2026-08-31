# Learner Evidence Model

## Principle

Mastery is never written directly. Every change to learner state (mastery
level, misconception flags) is derived from an immutable evidence record
that says what happened, when, and with what confidence.

## Evidence tiers (from PRD P2)

- **Exposure** — low-confidence evidence from notes, uploads, or
  conversation. Does not by itself raise mastery.
- **Retrieval / application / transfer / validated performance** —
  stronger evidence, produced by independent recall or grading, required to
  raise mastery.

## Rules

- Conversations and note uploads create exposure evidence by default, not
  mastery.
- The tutor model never updates learner mastery directly — only the
  validated evidence-commit step does (see `assessment-pipeline.md`).
- Student-reported flags/corrections are evidence *about* the student's
  belief, not ground truth about the ontology.
