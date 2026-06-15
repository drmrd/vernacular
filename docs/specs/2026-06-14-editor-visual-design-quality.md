# Editor visual-design-quality pass

Date: 2026-06-14
Status: Draft, pending review

## Target and relationship

This pass closes the design-craft gap the running shell shows against the directional
mockup, working entirely within the approved Draughtsman's Restraint language (ADR-0069:
brass `#b08646`, EB Garamond and Inter, a warm vellum ramp). The UX Pilot mockup stays a
directional reference for warmth, depth, and polish, not for palette or type. Its own
identity (clay accent, Libre Baskerville, IBM Plex) is recorded in the appendix for
possible future use, per the owner's decision, and is not adopted here.

It builds on the fidelity pass (#155), which fixed the structural and unstyled-control
problems. Those repairs left the shell correct but cool and flat where the mockup reads as
warm parchment.

## Why

An audit of the running build against the mockup found the warmth gap is execution, not
the token vocabulary. The warm vellum, umber, and brass tokens already exist, but the
canvas is drawn in cool hardcoded greys and the surfaces carry no layered depth.

## Findings

Grounded in the source, not eyeballed.

- The canvas is drawn cool. `draw-plan.ts` and `ruler.ts` hardcode the grid at `#e6e9ee`,
  the ruler band at `#f5f7fa` with `#c2c8d0` ticks and `#5a6470` text, the room fill at
  `#eef2f6`, the walls at pure black `#222222`, and the selection at blue `#1a7fd4`. None
  of that is vellum, umber, or brass. The canvas is the largest surface on screen and it
  is empty in this build, so the cool grid sets the whole impression.
- Surface layering is weak. `--color-surface` (vellum-100, `#f4efe4`) and
  `--color-surface-raised` (vellum-50, `#fbf7ef`) are nearly identical, so panels barely
  separate from the canvas or from each other. The mockup uses three distinct warm tones
  for depth.
- There is no brand mark. The wordmark is bare text; the mockup pairs it with a crosshair
  glyph.
- The header reads plainer than the mockup: icon-only toggles, no labels.
- Brass is under-present relative to the roles the design language assigns it.

## Decisions

1. The canvas reads the palette from tokens. Resolve a `PlanPalette` once from the CSS
   custom properties and thread it into `drawPlan`, replacing the cool hardcoded constants
   for the grid, rulers, walls, room fill, and selection. Light-theme intent: the grid is
   a low-contrast warm vellum tone, the ruler band is a vellum surface with umber-muted
   ticks and text, walls are umber-900, the room fill is a warm light vellum, and the
   selection ring is brass-500. Reading tokens rather than swapping in new warm hardcoded
   hex also honors the realignment spec's stated intent and sets up the deferred
   dark-canvas pass.
2. Surfaces gain layered depth. Establish three distinct warm surface roles so the canvas,
   the panels, and raised elements separate visually, with subtle borders or elevation.
   This is a re-mapping and small extension of the vellum semantic tokens, not a new raw
   palette.
3. Add the brand mark. Place the crosshair glyph as an inline SVG in brass beside the
   wordmark.
4. Refine the header. Give the Grid and Dimensions toggles text labels alongside their
   icons and group them as a set. The zoom control's wiring stays with the cycle-4 effort;
   this pass only reserves and styles its slot.
5. Tighten density and rhythm. Bring the rail and inspector spacing toward the mockup's
   denser cadence and confirm the section labels and type scale read as intended.
6. Make brass present where the language assigns it: the selection ring (decision 1),
   period tags, the Export action, and active indicators.

Kept unchanged: the brass, EB Garamond, Inter, and vellum identity; the quiet rail chip
style (vellum fill with a brass left border) from the design language; and all structural
work from #155.

## Architecture and components

- `editor/design-system/tokens.css`: tune the light-theme surface mapping for layered
  depth, and add canvas-role tokens (grid, wall, room fill, ruler band, ruler tick, ruler
  text, selection) so the canvas has semantic colors to read.
- A `PlanPalette` resolver that reads the CSS custom properties, threaded through
  `DrawPlanOptions`; `draw-plan.ts` and `ruler.ts` consume it instead of the hardcoded
  cool constants.
- `editor/shell`: a brand-mark SVG beside the wordmark; labelled header toggles; spacing
  and density tuning in the rail and inspector styles.
- An ADR recording the canvas-reads-tokens decision, since it changes how the canvas
  sources color.

## Build sequence

Small red-green-blue cycles on the fidelity-pass base.

1. The `PlanPalette` resolver and the canvas-role tokens; thread the palette into
   `drawPlan` and migrate the grid, rulers, walls, room fill, and selection onto it. This
   is the largest single visual change.
2. Surface layering and depth in the tokens and the panel surfaces.
3. The brand mark.
4. Header toggle labels and the rail/inspector density tuning.

## Out of scope

The dark-canvas tuning pass (its own deferred effort, though decision 1 prepares it), the
cycle-4 zoom wiring, the cycle-6 canvas compass and scale bar, and adopting the mockup's
alternative identity (appendix).

## Appendix: the mockup's alternative identity (recorded, not adopted)

Captured from the UX Pilot HTML for possible future incorporation, per the owner's
decision. This is reference material, not a commitment.

- Accent: clay `#c2956b` (clayDark `#a87a54`, clayLight `#dbb898`).
- Fonts: Libre Baskerville (display serif), IBM Plex Sans (UI), IBM Plex Mono (numbers).
- Borders: a cool lavender `#d8d4e8`.
- Surfaces and ink: canvas `#faf9f7`, blueprint `#f4f1eb`, panel `#f0ede8`, grid line
  `#e8e4dc`, poche wall `#3d3a34`, deep graphite `#2a2723`, primary ink `#1c1a17`,
  secondary `#807a72`.
- Type scale (size and line height): 10/14, 11/16, 12/18, 13/20, 14/22.
- Brand mark: a 20 by 20 crosshair, an outer circle of radius 8.5 stroked, an inner dot of
  radius 2.5 filled, and four radial ticks.

## References

- Design language: ADR-0069 and `docs/specs/2026-06-13-visual-design-language.md`.
- Fidelity pass: `docs/specs/2026-06-14-editor-fidelity-pass.md` and PR #155.
- Shell realignment: `docs/specs/2026-06-14-editor-shell-realignment.md`.
- Directional mockup: the UX Pilot 2D editor reference.
