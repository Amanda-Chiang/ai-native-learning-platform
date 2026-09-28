# Brand identity — Orca

**Status: approved 2026-09-27; name/palette/app-shell applied
2026-09-27 (Phase 1 of `docs/superpowers/specs/
2026-09-27-orca-redesign-design.md`).** The logo remains a text-only
placeholder — no real SVG/PNG asset exists yet (see "Logo" below). This
doc exists so a future UX/flow design pass (and its implementation) has
a real style guide to build from, per `brain/decisions/architecture-log.md`'s
2026-09-27 entry. Read `tech-constraints.md` alongside this — it has no
design-token system today; this palette is the real target for one when
that work happens.

## Name

Product name is now **Orca** (was "AI-Native Learning Platform" /
"AI Learning Project" in various docs — none of those are renamed yet,
they're pointed at this doc instead).

## Logo

Wordmark "Orca" in black, set in a rounded sans-serif, paired with a
small black-and-white orca icon (simplified, friendly, mid-leap/diving
pose) and a stylized sound-wave glyph (three curved bars) to its right
— reads as "the orca is speaking/listening." Rendered on a white/off-
white card in the reference screenshot.

**Open gap**: only a screenshot exists right now, not a real SVG/PNG
asset. Before any real implementation, an actual logo file needs to
land in `public/` (or wherever brand assets end up living) — a
screenshot isn't a usable asset.

## Color palette

Six brand colors — the five supplied plus black, pulled from the
logo's own wordmark/icon color.

| Token | Hex | HSL | First-pass role |
|---|---|---|---|
| `--black` | `#000000` | `hsl(0, 0%, 0%)` | Logo wordmark/icon color; likely primary text on light backgrounds |
| `--prussian-blue` | `#151d3a` | `hsl(227, 47%, 15%)` | Darkest brand color besides black; candidate for dark-mode surface or a secondary ink color |
| `--alice-blue` | `#e1ecfa` | `hsl(214, 71%, 93%)` | Light, cool background |
| `--parchment` | `#fcf7f4` | `hsl(22, 57%, 97%)` | Light, warm background/off-white |
| `--periwinkle` | `#afb5f2` | `hsl(235, 72%, 82%)` | Mid-tone accent |
| `--wisteria-blue` | `#839bec` | `hsl(226, 73%, 72%)` | Mid-tone accent, more saturated than periwinkle; candidate for primary interactive color (links/buttons) |

Roles above are a first-pass guess for a future design pass to confirm
or override — not a locked decision. `alice-blue`/`prussian-blue`/
`periwinkle`/`wisteria-blue`/`parchment` values are exactly as supplied
(alpha channel `ff`, i.e. fully opaque — dropped from the hex column
above since CSS hex without an alpha suffix is already opaque).

### CSS custom properties (as supplied, kept as given for copy-paste)

```css
:root {
  --black: #000000;
  --alice-blue: #e1ecfaff;
  --prussian-blue: #151d3aff;
  --periwinkle: #afb5f2ff;
  --wisteria-blue: #839becff;
  --parchment: #fcf7f4ff;
}
```

### Gradients (as supplied)

Linear gradients in all 8 directions plus a radial, each stepping
through all five non-black colors in this fixed order: alice-blue →
prussian-blue → periwinkle → wisteria-blue → parchment. Black is not
part of the supplied gradients — if a gradient needs to incorporate it,
that's a new decision for whoever designs the pass that uses one, not
assumed here.

```scss
$gradient-top: linear-gradient(0deg, #e1ecfaff, #151d3aff, #afb5f2ff, #839becff, #fcf7f4ff);
$gradient-right: linear-gradient(90deg, #e1ecfaff, #151d3aff, #afb5f2ff, #839becff, #fcf7f4ff);
$gradient-bottom: linear-gradient(180deg, #e1ecfaff, #151d3aff, #afb5f2ff, #839becff, #fcf7f4ff);
$gradient-left: linear-gradient(270deg, #e1ecfaff, #151d3aff, #afb5f2ff, #839becff, #fcf7f4ff);
$gradient-top-right: linear-gradient(45deg, #e1ecfaff, #151d3aff, #afb5f2ff, #839becff, #fcf7f4ff);
$gradient-bottom-right: linear-gradient(135deg, #e1ecfaff, #151d3aff, #afb5f2ff, #839becff, #fcf7f4ff);
$gradient-top-left: linear-gradient(225deg, #e1ecfaff, #151d3aff, #afb5f2ff, #839becff, #fcf7f4ff);
$gradient-bottom-left: linear-gradient(315deg, #e1ecfaff, #151d3aff, #afb5f2ff, #839becff, #fcf7f4ff);
$gradient-radial: radial-gradient(#e1ecfaff, #151d3aff, #afb5f2ff, #839becff, #fcf7f4ff);
```

## Explicitly out of scope for this doc

No UX/navigation/page-flow redesign is captured here — that was
deliberately dropped from this pass at the user's direction. This doc
is brand identity only (name, logo, color tokens). A future pass, when
it happens, should treat this palette as a given input, not something
it re-derives.
