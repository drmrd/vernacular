# Visual design language: Draughtsman's Restraint

Date: 2026-06-13
Status: Approved, pending implementation plan

## Summary

Vernacular's visual design language is called Draughtsman's Restraint. It targets a specific
tension in the product's audience: people who care deeply about old houses and want a tool
that signals that respect, but who may spend hours at a time in the application and need it
to stay comfortable throughout. The resolution is not a compromise between those two goals
but a reframing of how the heritage aesthetic is expressed. The warmth comes from the
material layer (the parchment canvas, the warm ink text, the serif type on named artifacts),
not from saturating the UI chrome with color. Brass appears only where it carries semantic
meaning: measurement lines on the canvas, the active-selection indicator, period and era tags,
and the primary Export action. Everywhere else, panels are quiet.

This spec defines the color system, typography, iconography, rail structure, and the
anatomy of each major UI region. The interaction model, command dispatch, and keyboard
layer are covered by the editor experience makeover spec
(`docs/specs/2026-06-10-editor-experience-makeover.md`) and are not repeated here.

## The guiding principle

A draughtsman's table has a clear hierarchy of layers: the cream paper carries the subject,
the dark graphite or ink is the drawing itself, and the annotation layer (dimensions, notes,
corrections) uses a contrasting medium, traditionally a colored pencil or red ink. The
contrast between layers is what makes each layer readable without any one of them fighting
for attention. Brass in Vernacular's UI plays the annotation-layer role: it marks things that
are measurements, selections, or period attributes. It does not color the structural chrome.

## Color

### Palette

The primitive ramp stays unchanged. Only the semantic assignments shift.

```
Primitive ramp (unchanged):
  --vellum-50:  #fbf7ef   warm white, panel surfaces
  --vellum-100: #f4efe4   canvas background
  --vellum-200: #ece3d2   active surface fill, grid lines
  --vellum-300: #d9cdb4   borders

  --umber-900:  #2f2615   primary text
  --umber-700:  #4a3c26   secondary text
  --umber-500:  #6e5a3c   muted text, section labels

  --ink-950:    #1a2738   dark mode surface
  --ink-900:    #23344d   dark mode raised, focus ring (light mode)
  --ink-800:    #2c3e57   dark mode border, detail
  --ink-600:    #3a5273   dark mode muted

  --brass-500:  #b08646   accent: canvas annotations, active indicator,
                           period tags, primary actions
  --brass-600:  #8b692a   NEW: stronger accent for hover states and
                           primary button background (vellum-50 label
                           text clears WCAG AA 4.5:1 at 4.72:1)
  --brass-300:  #c8b78f   active-state icon fill, subtle highlight
```

### Semantic tokens: light mode changes

The main change from the prior token assignment is that `--color-accent` moves to
brass in light mode, matching what dark mode already uses. Ink-900 stays for the
focus ring because brass at 2.8:1 against vellum-100 does not clear the WCAG 2.2
3:1 focus-indicator threshold.

```
--color-text:           var(--umber-900)
--color-text-muted:     var(--umber-500)
--color-surface:        var(--vellum-100)      (canvas background)
--color-surface-raised: var(--vellum-50)       (panel surfaces)
--color-surface-active: var(--vellum-200)      NEW semantic token
--color-border:         var(--vellum-300)
--color-accent:         var(--brass-500)       CHANGED from ink-800
--color-accent-strong:  var(--brass-600)       CHANGED from ink-900
--color-on-accent:      var(--vellum-50)       (unchanged)
--color-focus-ring:     var(--ink-900)         (unchanged -- accessibility)
--color-indicator:      var(--brass-500)       NEW: left-border active state
```

### Dark mode

Dark mode tokens are unchanged. In dark mode the surface is already deep ink and brass
is already the accent, so the Draughtsman's Restraint principle already holds there.

### Canvas annotation color

Dimension lines, measurement text, the active-selection ring around a selected element,
and the in-progress draw ghost all use `--color-accent` (brass-500). Walls and room fills
use `--color-text` (umber-900). The canvas grid uses `--color-surface-active` (vellum-200).

## Typography

### Typefaces

Three families, all from Google Fonts for cross-platform consistency:

```
--font-family-heading: 'EB Garamond', 'Iowan Old Style', 'Palatino Linotype',
                        Georgia, serif;
--font-family-ui:      'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
--font-family-mono:    ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo,
                        Consolas, monospace;
```

EB Garamond and Inter load as a single Google Fonts request using the minimum
variant subset: EB Garamond 400, 400 italic, 500; Inter 400, 500, 600.

### Roles

| Role            | Family  | Size    | Weight     | Notes                             |
| --------------- | ------- | ------- | ---------- | --------------------------------- |
| Project name    | heading | 1.1rem  | 500        | In rail header and inspector      |
| Period subtitle | heading | 0.85rem | 400 italic | "American Farmhouse, c.1887"      |
| Component title | heading | 1rem    | 500        | Inspector: "Double-Hung Window"   |
| Section label   | ui      | 0.68rem | 600        | Uppercase, 0.09em letter-spacing  |
| Tool label      | ui      | 0.75rem | 400        | Rail chip text                    |
| Property label  | ui      | 0.7rem  | 600        | Uppercase, inspector field names  |
| Property value  | ui      | 0.85rem | 400        | Inspector field values            |
| Button          | ui      | 0.8rem  | 500        |                                   |
| Coordinate      | mono    | 0.8rem  | 400        | Status bar and inspector position |
| Dimension       | mono    | 0.75rem | 400        | Canvas annotation layer           |

EB Garamond appears only on project names and component titles. Everything else uses Inter.
This keeps the serif legible at size and limits it to naming things rather than labeling controls.

## Iconography

The icon set uses Phosphor Icons at Regular weight on a 24px grid. Regular weight (2px
effective stroke) matches the line weight of wall outlines on the canvas, so icons and
walls read at the same visual weight.

Period section icons (Fireplace, Chimney, Stairs, and future era-specific components)
use Phosphor approximations until custom SVG icons are drawn. Custom icons should follow
the same 24px grid and 2px stroke so they stay interchangeable with Phosphor. This work
lands separately in the Period component asset track.

Phosphor icon assignments for the first-pass tool set:

| Tool      | Phosphor name                       |
| --------- | ----------------------------------- |
| Select    | `CursorClick`                       |
| Pan       | `Hand`                              |
| Wall      | `Minus` (oriented; may need custom) |
| Door      | `Door`                              |
| Window    | `FrameCorners`                      |
| Dimension | `Ruler`                             |
| Label     | `Tag`                               |

## Left rail

### Structure

The rail has four sections, each with a small-caps Inter section label as a divider:

1. **Select:** Select, Pan (single-column rows)
2. **Draw:** Wall, Door, Window (2-column grid)
3. **Period:** Fireplace, Chimney, Stairs, and future era components (2-column grid)
4. **Annotate:** Dimension, Label (2-column grid)

Snap controls are not in the rail. Snap state is reported in the status bar; per-kind
snap toggles live in the opt-in precision panel described in the editor experience
makeover spec.

### Active state

The active tool chip gets `--color-surface-active` as its background and a 2px solid
`--color-indicator` (brass) left border. No other color change. Inactive chips have a
transparent background and `--color-text-muted` label text. Hover gets
`--color-surface` as a subtle background lift.

### Sizing

Rail outer width: approximately 108px. Tool chip padding: 4px vertical, 4px horizontal.
Icon size: 16px (scaled from 24px grid). Section label padding: 8px top, 2px bottom.
The rail is resizable following the existing pane-resize behavior.

## Top bar

Left to right:

1. **Wordmark:** "Vernacular" in Inter 600, umber-900.
2. **Breadcrumb:** Inter 400, umber-500. Separator is a forward slash. The active
   segment (Floor Plan Editor) uses umber-700.
3. **Zoom controls:** minus, percentage readout, plus. Percentage in Inter 500.
4. **View toggles:** Grid and Dimensions as icon-only buttons with tooltips ("Grid (G)"
   and "Dimensions (D)"). No Layers toggle: the current data model has no user-defined
   layers, so this is deferred until layers exist. Active state: `--color-surface-active`
   fill with a brass border, matching the tool chip active treatment. Inactive: transparent
   background, umber-500 icon. Tooltips surface the keyboard shortcuts so users can
   discover them without hunting through the command palette.
5. **Undo / Redo:** icon buttons using `ArrowCounterClockwise` and `ArrowClockwise`
   from Phosphor.
6. **Export:** primary Button variant (brass background), text "Export".
7. **Save status:** neutral, text-only or icon: "Saved", "Unsaved changes",
   "Saving...". No button border when idle.

## Inspector panel

### Header

"PROPERTIES" in Inter 600, uppercase, umber-500. A right-aligned selection count badge
("1 selected") in a vellum-200 chip with umber-700 text sits beside it.

### Sections

Each section opens with an Inter 600 uppercase label in umber-500, 8px top padding.
A 1px vellum-300 rule separates sections. Within a section, property rows are label
above value: label in Inter 600 uppercase 0.7rem umber-500, value in Inter 400 0.85rem
umber-900.

### Component title

EB Garamond 500 1rem umber-900 for the component name ("Double-Hung Window").
The component ID in Inter 400 0.72rem umber-500 sits below it.

### Period attributes section

Era and preservation tags use pill chips: brass-500 background, vellum-50 text, Inter
600 0.65rem, 8px horizontal padding. Multiple tags wrap. This section appears only
when the selected element has period metadata.

### Precision controls

For dimension fields that support fractional-inch adjustment (Width, Height, Sill
Height, etc.), a row of pill chips below the input shows the available fractions:
1/16, 1/8, 1/4, 3/8, 1/2, 5/8, 3/4, 7/8. Tapping a chip nudges the value by that
fraction. The active chip uses `--color-surface-active` fill with umber-900 text.

## Status bar

Left to right:

1. **Floor selector:** tabs for each floor in the project (Bsmt, Grade, 1st Fl.,
   2nd Fl., Attic, and any named custom floors). Active tab: umber-900 text, 2px
   brass bottom border. Inactive: umber-500 text. Tabs scroll horizontally if the
   project has many floors.
2. **Active tool:** "Tool: Select" in Inter 400 0.75rem umber-500.
3. **Cursor coordinates:** monospace, live x/y in the project's display unit.
4. **Snap status:** name of the currently engaged snap ("Grid Snap", "Wall Snap",
   "Along Wall") or empty when no snap is active.
5. **Scale:** "Scale 1:48" when a scale is set.
6. **Zoom:** "100%" with the current viewport zoom.

## Canvas chrome

- Background: `--color-surface` (vellum-100)
- Grid: 1px lines in `--color-surface-active` (vellum-200) at the project's grid
  interval. The grid renders below the drawing geometry.
- Rulers: thin strips at the left and top edges, Inter 400 0.6rem umber-500 tick labels.
- North compass: a small traditional compass rose in the top-right corner of the drawing
  area, rendered at 0.4 opacity so it reads as metadata rather than content.
- Dimension lines: brass-500 lines and arrowheads. Dimension text in monospace brass-600.
- Active selection: brass-500 dashed outline around the selected element.
- In-progress wall ghost: umber-500 at 0.6 opacity with a small brass-500 circle (6px
  diameter) at the current snapped endpoint.

## Component states

| Element        | Default                                 | Hover            | Active / selected             | Disabled    |
| -------------- | --------------------------------------- | ---------------- | ----------------------------- | ----------- |
| Tool chip      | transparent bg                          | surface fill     | surface-active + brass border | 0.5 opacity |
| Neutral button | surface-raised bg, border               | slight bg darken | accent bg, on-accent text     | 0.6 opacity |
| Primary button | accent-strong bg, on-accent text        | brass-600 bg     | same + outline                | 0.6 opacity |
| Text input     | surface-raised bg, border               | border darkens   | focus-ring outline            | 0.6 opacity |
| Period tag     | brass-500 bg, vellum text               | --               | --                            | --          |
| Era date tag   | vellum-200 bg, umber text, brass border | --               | --                            | --          |

## Spacing and density

The existing five-step spacing scale (`--space-1` through `--space-5`) stays. The rail
and inspector use compact density: 4px vertical padding for most rows, 8px for section
dividers. The top bar uses 8px vertical padding. The status bar uses 4px.

Border radius: 4px for chips and inputs, 6px for panels and cards, 999px for tags and
badges.

## Motion

`--motion-duration: 150ms` (existing token) applies to all state transitions: background
color, border color, opacity. No layout animations. Reduced motion zeroes the token per
the existing `@media (prefers-reduced-motion)` rule.

## Token changes required

The following changes to `editor/design-system/tokens.css` are required:

1. Add `--brass-600: #8b692a` to the primitive ramp.
2. In the light-mode `:root` block:
   - Change `--color-accent` from `var(--ink-800)` to `var(--brass-500)`.
   - Change `--color-accent-strong` from `var(--ink-900)` to `var(--brass-600)`.
   - Add `--color-surface-active: var(--vellum-200)`.
   - Add `--color-indicator: var(--brass-500)`.
   - Keep `--color-focus-ring: var(--ink-900)` (accessibility, unchanged).
3. Update `--font-family-heading` to lead with `'EB Garamond'`.
4. Update `--font-family-ui` to lead with `'Inter'`.
5. Add a Google Fonts `<link>` in `index.html` for the EB Garamond and Inter subsets.

The typed token registry in `editor/design-system/tokens.ts` gains entries for
`colorSurfaceActive` and `colorIndicator`.

The existing palette-contrast test in `editor/design-system/palette-contrast.test.ts`
must be updated to assert the new accent and accent-strong assignments and verify that
vellum-50 label text on brass-600 (#8b692a) clears WCAG AA 4.5:1 at 4.72:1.

## Storybook documentation

The existing `Design System/Foundation` story gains a `DraughtsmansRestraint` story
that shows:

- The swatch ramp (all primitives including new brass-600)
- The semantic token assignments in a labeled table
- A component gallery: neutral button, primary button, tool chip (default, hover,
  active), period tag, era tag, text input (default, focus, disabled)
- A typography specimen: project name in EB Garamond 500, period subtitle in
  EB Garamond 400 italic, section label in Inter 600 uppercase, body value in
  Inter 400, coordinate in mono

This story replaces the existing `DraftingTable` story, which was a placeholder for
the same direction.

## What this spec does not cover

- The project list and home screen. That view gets its own brainstorming session.
- Three-dimensional preview visual treatment. Covered by the existing 3D preview specs.
- Custom Period component icons. Deferred to the Period component asset track.
- Editor preferences and settings UI. Deferred.

## References

- Editor experience makeover: `docs/specs/2026-06-10-editor-experience-makeover.md`
- Design system token contract: `docs/specs/2026-06-09-design-system-token-and-theming-contract.md`
- ADR-0044 (delivery tracks and the UX foundation track)
- ADR-0048 (paint, palette, and site metadata)
- UX Pilot mockup: `Vernacular 2D Planner Mockup.png` (shared June 2026, used as
  directional reference, not a specification)
