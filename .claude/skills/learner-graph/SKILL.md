---
name: learner-graph
description: Use when designing or modifying learner-state/mastery logic, evidence records, graph mutation code, or ontology reconciliation — the backend data-model side of the learner graph.
---

# Learner Graph

Backend/data-model rules for the graph and learner state. Full model in
`brain/architecture/graph-model.md` and `brain/architecture/learner-evidence.md`.

## Rules

- Course ontology and learner state are separate tables/entities. Never
  store per-learner mastery on the canonical concept/relationship record.
- Every mastery change is evidence-backed: write the evidence record first,
  derive the mastery update from it, never the reverse.
- Exposure (notes, uploads, conversation) does not imply mastery — it's a
  separate, lower-confidence evidence tier (see `learner-evidence.md`).
- Both concepts and relationships/edges carry independent learner state.
  Don't collapse edge mastery into node mastery.
- The canonical graph supports multiedges — two concepts can have more than
  one relationship type between them simultaneously.
- Aliases and canonical concepts are stored separately. A student's phrasing
  variant is an alias pointer, never a new concept record.
- Every graph mutation preserves provenance: which ingestion run, evidence
  record, or reconciliation pass produced it.
- Student feedback/flags are a signal that feeds reconciliation review —
  never a direct write to the canonical ontology.
- Layout/view state (positions, collapsed state) lives outside this domain
  entirely and never mutates semantic graph meaning — see
  `.claude/skills/concept-atlas/`.

## Should not own

Renderer-specific coordinates or styling, frontend appearance, or AI prompt
wording (unless required by an API contract) — those belong to the
frontend/`concept-atlas` skill.
