# Interaction States

- **Default**: whole-course atlas, units collapsed or expanded per last
  saved layout state (per learner, per course).
- **Unit expanded**: reveals concepts within a unit; does not reflow
  sibling units unless space genuinely requires it.
- **Concept focused**: click opens a stable detail panel (side panel, not a
  modal that blocks the graph) showing canonical label, aliases, mastery
  state, incoming/outgoing relationships, and linked evidence.
- **Relationship focused**: click/hover on an edge highlights both
  endpoints and dims unrelated nodes/edges (don't hide them — dim).
- **Weak-relationship state**: visually distinct per `visual-language.md`;
  clicking surfaces the specific evidence that produced the weak rating.
- **Mobile/tablet breakpoint**: unit regions stack or the atlas becomes
  pan/zoom-only with the detail panel as a bottom sheet instead of a side
  panel — verify this breakpoint explicitly, don't assume desktop layout
  scales down cleanly.
