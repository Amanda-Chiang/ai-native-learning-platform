# Visual Language

## Mastery (discrete states, redundant encoding)

Every concept node encodes mastery with three redundant signals so it never
depends on color perception alone:

| State | Ring | Color | Label |
|---|---|---|---|
| unverified | dashed | neutral gray | "Unverified" |
| exposed | thin solid | blue | "Exposed" |
| weak | thin solid | amber | "Weak" |
| solid | thick solid | green | "Solid" |

## Relationship types (redundant encoding)

Color alone must never be the only differentiator between relationship
types — pair it with a distinct line style (solid/dashed/dotted) and, where
space allows, an inline label. See `relationship-taxonomy.md` for the type
list.

## Weak-edge indicators

A relationship with weak learner-state renders with reduced opacity *and* a
distinct stroke pattern — not opacity alone, which is easy to miss.

## Layout

- Unit regions are bounded (a visible boundary, not just node clustering).
- Cross-unit relationships are visually distinct (e.g., a different stroke)
  from within-unit relationships so learners can spot integration points.
