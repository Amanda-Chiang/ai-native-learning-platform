# Learner Graph Model

Source of truth: `docs/technical-prd.md`. This file tracks durable
architectural decisions about the graph, not the full spec.

## Core separation

- **Course ontology** (concepts, relationships) is canonical, shared across
  learners, and only mutated through validated ingestion/reconciliation —
  never directly from a student's assertion.
- **Learner state** (exposure, mastery, misconceptions) is per-student and
  always backed by an evidence record.
- **Layout state** (positions, collapsed/expanded regions, viewport) is
  renderer-local and never mutates semantic meaning.
- **Canonical graph data** is renderer-neutral. React Flow/G6/ELK-specific
  properties (coordinates, styling) live only in a view adapter layer, never
  in the domain model.

## Graph shape

- Concepts and edges both carry independent learner state.
- The canonical graph supports multiedges (multiple relationship types
  between the same two concepts).
- Aliases and canonical concepts are separate — a student's phrasing does not
  create a new concept.
- Graph mutations must preserve provenance (source, ingestion run, or
  evidence record that produced them).

## Open questions

(Track unresolved architecture questions here as they come up. None recorded
yet — this file was seeded during initial project setup on 2026-08-31.)
