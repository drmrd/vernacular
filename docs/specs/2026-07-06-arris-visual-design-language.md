# Visual design language: Arris

Date: 2026-07-06
Status: Proposed target language. Not yet implemented. Draughtsman's Restraint
(`docs/specs/2026-06-13-visual-design-language.md`, ADR-0069) remains the shipped visual
language until an incremental migration lands. See ADR-0154.

## Summary

Arris is the target visual and interaction language for Vernacular's editor: the look, type,
color, density, and control behavior the product aims for. It was chosen from a blind,
function-first redesign of the product's whole surface, in which each area was designed from a
purpose brief alone, critiqued, and reconciled into one coherent language. This spec is that
language, written to stand on its own.

Arris does not yet describe the shipped application. The running editor implements
Draughtsman's Restraint (ADR-0069): a warm vellum palette, a brass accent, and EB Garamond with
Inter. Arris replaces that palette, type, and accent doctrine outright, so adopting it is a
migration, not a token tweak. This spec is deliberately concrete about the destination. The path
from the current design system to this one, and the feasibility of each signature behavior
against the real engine, is follow-on work recorded under Open questions and in ADR-0154. Until
that migration lands, read this document as the direction, not the current state.

## 1. Name and personality

**Arris.** In joinery and masonry, the arris is the crisp edge where two true surfaces meet.
Arris is a workshop instrument rendered in a browser: weighted, graduated, machined plain, and
honest about every number it shows you. The name was chosen from four candidate languages
evaluated blind; a few traits from the runners-up were folded in where they strengthened it.

## 2. Aesthetic thesis

The houses Vernacular serves were built by people who owned good tools: boxwood folding rules
with brass hinges, japanned hand planes, steel squares with etched graduations, layout fluid
brushed on metal so a scribed line would show. Those tools share a design ethic this product
inherits. Nothing on them is decorative, everything on them is legible at arm's length, and every
adjustment lands in a detent you can feel.

The deliberate risk: instrument physicality rendered completely flat. Chrome sits at a mid tone
in light mode (the bench is darker than the sheet of paper on it), every continuous control
carries real graduation ticks, and every adjustment settles into a detent. No photo textures, no
bevels, no gradients pretending to be metal. Physicality is carried entirely by geometry,
graduation, and response.

## 3. Principles

1. The sheet is the hero and the bench serves it: chrome is a work surface, never a stage.
2. Every value shows its graduation: a number arrives with its increment visible and its nudge
   reachable.
3. Weight over gloss: controls acknowledge force when pressed and stay silent when idle.
4. Correct words, stamped plainly: period vocabulary is set in ordinary type where anyone can
   read it.
5. Nothing moves unless the user moved it.
6. State reads without color: active and selected states signal through inversion first, hue
   second.

## 4. Typography

**Display: Besley** (SIL OFL). A working Clarendon revival: the letter of the era, stamped into
plane bodies and hardware catalogs. Only at 20px and above, weights 500 and 600: the application
name, empty-state headings, export title blocks. The maker's stamp, not the body text.

**Interface: Atkinson Hyperlegible Next** (SIL OFL). Engineered for legibility with genuine
character: distinctive slashed zeros and unambiguous letterforms that hand a dense, hours-long
tool free legibility headroom, especially for low-vision users. Weights 400, 500, 600. Excellent
at 11 to 13px.

**Data: B612 Mono** (SIL OFL). Designed for cockpit instrument panels: unambiguous 1/l/I and
0/O, generous counters, legible under fatigue. Every dimension, coordinate, angle, and area on
screen is set in B612 Mono so columns of figures align and a changing value never shifts its
neighbors. Weights 400 and 700.

**Fractions doctrine (absolute):** imperial fractions render as full-size characters with hyphen
and solidus (3' 6-1/2"), never as shrunken fraction glyphs or stacked numerals, because the user
verifies these numbers against a tape measure at arm's length.

**Scale:** 11 (stamped labels, caps), 12 (secondary), 13 (interface base), 15 (panel emphasis),
20 and 22 (display), 28 (export titles). Line height 1.35 in panels, 1.5 in prose surfaces. No
weight below 400 anywhere. There is no 18px display size: it sits below the Besley floor, so
display type starts at 20px.

## 5. Color

| Name          | Hex       | Role                                                                                                                                        |
| ------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Rag Vellum    | `#F7F6F2` | Light-mode canvas: the drawing sheet                                                                                                        |
| Beech         | `#DFD9CE` | Light-mode chrome: the bench under the sheet                                                                                                |
| Japanned Iron | `#23272B` | Light-mode ink and dark-mode chrome                                                                                                         |
| Blued Steel   | `#16202C` | Dark-mode canvas: layout-coated plate                                                                                                       |
| Layout Blue   | `#2E55C4` | Accent: selection, focus, snap indicators; lifts to `#7E98E6` in dark                                                                       |
| Red Lead      | `#A6402F` | Destructive actions and data-loss warnings only; lifts to `#CE7B63` in dark (calibrated like the accent, so errors never go quiet at night) |

**Canvas versus chrome doctrine: the sheet and the bench.** The canvas is paper; the chrome is
the bench it rests on. In light mode the chrome is visibly darker than the canvas. The plan sheet
reads as the brightest, most important surface on screen because it literally is.

**Light appearance:** Beech chrome, Rag Vellum canvas, Japanned Iron ink and plan linework.
Panels are cut from one material; separation comes from kerf lines (1px at 20 percent ink), not
tonal patchwork.

**Dark appearance:** Japanned Iron chrome, Blued Steel canvas, bone-white derived text
(`#E9E7E1`), light plan linework. The canvas carries a faint blue cast so the sheet reads
distinct from the bench. One ratified exception: with an underlay loaded, the sheet defaults to
the lit board, the existing Rag Vellum token rendered under the dark bench, because tracing a
raster in the dark is a hero job and the linework wants a bright ground. The user can turn the
board off; no new color is minted for it.

**Deference to user content:** every chrome color is low chroma. By default the only saturated
things on screen are the user's plan, paint colors, and materials. Layout Blue appears
exclusively as lines and glyphs and never fills a surface. Its full lawful role set: selection
outlines and handles, focus indicators, snap marks and reach lines, the active rack's scribe
line, drop-target frames, determinate progress ticks, drag insertion lines, and measure spans.
Nothing else borrows it; in particular, matched characters in any search surface mark with weight
600, never with an accent color or highlight. Red Lead appears on perhaps one control per screen,
ever.

**Contrast floors (hard):** body text 7:1 or better in both appearances, stamped labels 4.5:1,
focus indicators and accent lines 3:1 minimum against their ground. Plan linework has floors of
its own: primary linework 4.5:1 against whatever ground actually renders, receded snappable
linework 3:1; only the purely visual reference ghost sits below them.

**The ink ramp.** The language publishes one ink ramp, by role, with per-appearance values, so
intermediate ink values are named once rather than improvised per surface. Bone ink reaches each
floor at a lower opacity than iron does over Beech, so the two columns differ while the ratio
target is identical. Values are targets verified against the element's true ground; the role is
the contract.

| Role                                                                 | Floor                                                    | Light: iron over Beech or Vellum | Dark: bone over Iron or Blued Steel |
| -------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------- | ----------------------------------- |
| Body text, load-bearing values, custody prose                        | 7:1                                                      | 100 percent (~10.7:1)            | 100 percent (~12:1)                 |
| Emphasis metadata: identity trails, derived echoes                   | 7:1                                                      | 85 percent (~7.2:1)              | 73 percent (~7.2:1)                 |
| Stamped labels, section headers                                      | 4.5:1                                                    | 80 percent (~6.3:1)              | 65 percent (~6.0:1)                 |
| Secondary text: hints, placeholders, captions                        | 4.5:1                                                    | 70 percent (~4.75:1)             | 55 percent (~4.7:1)                 |
| Instrument marks, redundant unit affixes, snappable receded linework | 3:1                                                      | 60 percent (~3.6:1)              | 42 percent (~3.4:1)                 |
| Engraved redundant marks (slot shortcut letters, drawer number keys) | exempt, name recoverable within one hover or keystroke   | 45 percent                       | 35 percent                          |
| Dormant: dimmed-but-operable controls                                | exempt, reason recoverable within one hover or keystroke | 40 percent                       | 32 percent                          |
| Reference ghost: orientation pencil, never snappable, never text     | exempt, never carries information the user must read     | 20 percent                       | 15 percent                          |

Two rules travel with the ramp. A load-bearing word or figure never sits below the 4.5:1 tier,
whatever its role, so state words like `varies` render at full ink. And the 60 percent tier is
for marks whose meaning survives their absence (an affix beside a full-ink value, a tick, an
engraving with a full-ink twin elsewhere); it is not a text tone, because at 3.6:1 in light mode
it falls below the text floors. Snappable receded linework (a pinned reference floor the user
traces and catches on) sits at the 3:1 instrument tier; the purely visual floor-beneath ghost is
the 20 percent pencil and is exempt because it is never a snap target and never text.

**The cased mark.** An accent or instrument mark drawn over ground the language does not control
(the user's plan, an underlay, a 3D surface) carries a thin luminance-adaptive keyline, a casing
in the opposing tone, sized to hold the mark at 3:1 whatever it crosses. It appears wherever a
mark crosses uncontrolled ground (the cursor badge, snap glyphs, the walk reticle, projected 3D
marks) and is one token, not a per-surface invention.

## 6. Density, spacing, and layout texture

Base unit 4px. Standard control height 28px; compact inspector rows 24px; list rows 24px. Panel
padding 12px, gutters 8px. Docked panels default to 280px wide. One sanctioned exception: a
screen's single hero instrument may take a 44px band on the 4px grid (the solar scrubber is the
only current holder); standard rows do not move.

Density stance: this is a bench, and benches are full. Inspectors show every property of the
selected object without an accordion maze; long panels scroll, they do not paginate. Legibility
is protected by alignment, not emptiness: labels left, values right in B612 Mono, every numeric
column sharing a right edge.

Panels breathe through structure rather than whitespace. Sections separate with a single 1px kerf
line at 20 percent ink and a stamped header; related controls cluster on the 4px grid with 12px
between clusters. The canvas runs edge to edge; nothing floats over it.

## 7. Shape and material

Corner radius: 2px on every interactive control, a machined chamfer rather than a molded fillet.
Docked panels and the status bar are square. Nothing is ever a pill.

Borders: 1px at 25 percent ink for resting controls, 1.5px for active ones. Input fields read as
shallow recesses: their top border is one step darker than their sides, and that is the entire
extent of dimensionality Arris permits at rest.

Elevation: two tiers. The bench (everything docked) is dead flat, separated by kerf lines only.
Raised objects (an open menu, a dialog, an element being dragged) are things the user has
physically picked up, and only they cast a shadow: `0 2px 8px` at 25 percent black plus a 1px
border. Nothing else floats.

Texture: one is allowed. Chrome surfaces may carry a monochrome grain at 1.5 percent opacity. It
never touches the canvas, controls, or any text container.

## 8. Interaction grammar and motion

Every control acknowledges input within 100ms. Pressing a button translates its label down 1px.
Hover states brighten a border, never bloom a glow.

**Active-state doctrine:** a control in an active or selected state renders as a full impression:
it fills with ink and its glyph or label reverses to the ground color. State signals through
inversion, not hue, so it survives color-vision deficiency and both appearances without
recalibration. The active slot of the screen's primary mode rack additionally carries a 2px
Layout Blue scribe line down its left edge. At most one persistent scribe exists per screen,
owned by that primary rack; a screen that retires the tool rack (the export composition screen)
may transfer the scribe to its own mode rail, and no second rack on the same screen adds another.
Canvas selection stays Layout Blue lines and handles.

Where inversion is physically impossible, the canonical exceptions apply and no others: a cell
holding a color swatch inverts the cell, never the swatch; a lit 3D surface replaces inversion
with the cased luminance halo (a bone core with an iron keyline, the double-stroke form of the
cased mark); a row carrying a custody warning never inverts, so the warning keeps its chrome
ground.

Continuous controls move through detents. Dragging a slider, scrubbing a dimension label, or
rotating the angle control snaps to its graduation with a 50ms tick flash on the mark it seated
into. Arrow keys nudge by one detent; Shift multiplies by ten. The increment is always visible.

Durations: 90ms standard, 140ms maximum. One easing curve: `cubic-bezier(0.2, 0, 0, 1)`, a seat,
not a bounce. Focus in chrome is a 2px Layout Blue ring offset 1px, never removed; where the
focused surface runs edge to edge (the canvas region itself), the ring may draw inset just within
the kerf instead. On canvas entities, keyboard focus renders as Layout Blue L-shaped corner
brackets, one mark across the product, so focus stays distinguishable from the 2px on-edge
selection outline it would otherwise collapse into; the DOM proxy behind the canvas carries the
standard ring.

**Ratified idioms.** These behaviors are grammar: a control that needs the behavior uses the
idiom rather than a local variant.

- Invalid entry keeps the text and marks it with a Red Lead underline. Nothing shakes, nothing
  clears.
- Shift is the coarse step: ten times the increment, or the next major graduation; on a labeled
  scale, the next named stop.
- F2 renames. Shift-click toggles membership in a selection. `.` repeats the last command. `/` is
  search. G is go-to.
- Esc cancels the innermost thing and never destroys committed work; a further Esc reaches neutral
  Select; Shift+Esc is the hard abandon.
- Dialogs focus the safe action.
- The pointer drag threshold is 4px, stated once, everywhere.

Never animated: numeric values, plan geometry (outside the user's own drag), save status, panel
content on data refresh, and anything on the canvas the user did not touch. Canvas-readiness
indication tied to real GPU work (the realistic-settle fill) is exempt from the duration cap; its
reduced-motion form is static or stepped. With reduced motion set, all transitions become instant
and detent feedback becomes a static highlight.

## 9. Iconography

Stroke icons, 1.5px weight, on a 20px grid, butt caps and square joins so terminals read as
machined ends. Inside a 20px rule, where the full grid cannot sit, the footprint may drop to 14px
with the stroke weight and machined terminals held. A second tone at 15 percent ink may fill void
areas (window glass, door swings).

Metaphor policy: when the referent is a period artifact, draw the artifact correctly. The
double-hung window icon is a six-over-one sash; the four-panel door icon has stiles and rails in
plausible proportion. Abstract operations (undo, layers, settings) get plain geometry. No icon
stands alone for a period term: the label appears beside it or in an immediate tooltip, because
the vocabulary is the feature.

## 10. Component exemplars

**Primary button.** 28px tall, 2px radius, 12px horizontal padding. Light mode: Japanned Iron
fill, Rag Vellum label in the interface face at 600, 12px; dark mode inverts to a bone fill with
iron label. The accent never fills a button: a primary action is a black-handled tool, not a blue
banner.

**Dimension input.** The flagship control. 28px tall, recessed field, value right-aligned in B612
Mono 400 at 13px, unit affix at the 60 percent instrument tier. Along the inside bottom edge runs
a row of graduation ticks whose pitch reflects the current nudge increment: coarse for 1", fine
for 1/16". Arrows step by one tick with a flash on the seated mark; Shift steps by ten. The field
accepts 3' 6-1/2", 42.5, and 108cm alike and echoes the parsed canonical value beneath on commit,
set at the 85 percent emphasis tier, because the 60 percent echo falls below the floors and the
echo is load-bearing. A divergent multi-selection shows `varies` at full ink, one word across the
product. Invalid entry gets a Red Lead underline and keeps the text for correction. Nothing
shakes. A compact 24px variant exists for inspector rows: same grammar, echo only on unit
mismatch, scrub hit-area spanning the row's full height.

**Toggle.** A square, 2px-radius, full-impression two-state control: active fills with ink and
the glyph or label reverses to ground, per the active-state doctrine. Never a pill, never a
sliding thumb.

**Panel header.** 28px tall. Stamped label: interface face 600, 11px, uppercase, tracked +0.08em,
at 80 percent ink. A 1px kerf line closes the header's bottom edge. Contextual micro-actions sit
flush right and surface on hover or focus-within.

**Tool selector.** A vertical rack docked at the canvas's left edge: 32px square slots holding
20px icons, 4px gaps. The active slot renders as a full impression (ink fill, ground-colored
glyph) with the 2px Layout Blue scribe line down its left edge. Each slot shows its shortcut
letter engraved in the lower-right corner in B612 Mono at 9px, at the engraved-mark tier, always
visible.

**Live status readout.** A 24px bar under the canvas set entirely in B612 Mono at 11.5px. It is
one surface with one owner: the status-readout subsystem holds the slot registry (fixed slots,
guest slots, per-context slot sets, the narrow-width drop order) and grants each slot its
announcement policy; every other surface contributes fact strings to a granted slot rather than
claiming pixels. Fixed-width slots: cursor position, live length and angle while drawing, active
snap target named from the snapping system's closed lexicon (for example "snap: casing edge"),
current increment, and custody as plain text quoting the save-and-storage subsystem's canonical
form.

**Named surfaces.** The command surface is the command deck, one name across the product. The
24px bar is the status rail. The split-view divider is the divider rail ("sash" stays window
vocabulary). The user-facing word for a building level is floor, never storey.

## 11. The signature element

**The graduated rule.** Every continuous control in Arris carries etched graduation ticks and
settles into detents: the dimension field, sliders, the angle dial, the zoom control, the
wall-thickness stepper. The tick pitch always tells the truth about the current increment, and
every adjustment lands on a mark with a brief seat flash. Measurement is this product's daily
verb; the language makes the increment itself visible, tangible, and consistent everywhere. You
can see the graduations from across the room, the way you can spot a steel rule on a crowded
bench.

## 12. Custody doctrine

Custody of the user's work is stated permanently, in plain words, in a fixed place:
"saved · this device · 3:42 PM". The time is the clock time of the event, never a relative age,
because a frozen "4 s ago" is a lie the moment it stops counting. Never a vanishing toast, never
an icon alone. The save-and-storage subsystem owns the canonical state set and its exact strings;
every other surface that mentions custody quotes that set or marks its slot as owner-supplied, and
exactly one custody surface announces.

When storage cannot be verified, the same slot says so and stays until it can. The warning
treatment, measured against the contrast floors: the words render at full ink and carry a 2px Red
Lead rule beneath and a Red Lead dot, the accent's lawful line-and-glyph form, which clears the
3:1 accent floor in both appearances. Red Lead running text below the label floor is retired; the
alarm is the rule and the dot, the legibility is the ink. Every surface that touches saving,
storage, import, or export obeys this.

## 13. Answerable silence

No glyph, abbreviation, or hidden affordance exists without naming itself within one hover or one
keystroke. Any surface that introduces an icon, a shorthand, or a gesture must specify where its
name surfaces. The status readout and tooltips are the usual answers.

## 14. Refusals

1. No photographic or faux-material rendering: no wood grain, leather, brushed-metal gradients, or
   bevels.
2. Layout Blue never fills a surface; it exists as lines and glyphs only.
3. Numbers and plan geometry never animate on their own.
4. Nothing floats over the canvas uninvited: no toasts, no hovering pill toolbars, no celebratory
   overlays. A user-summoned raised object that leaves on Escape (a menu, a dialog, the command
   deck) is a picked-up thing under section 7, not a float; the platform cursor with its cased
   badge is the pointer itself, not a floating element.
5. No friendly renaming of period vocabulary. A transom is a transom, definition one hover away.
6. No gamification: no badges, streaks, or confetti.
7. Nothing is ever a pill, and no weight below 400 is ever used.

## 15. Applying this language

State concretely how a screen uses the tokens above: which type roles, which surfaces are bench
and which are sheet, where graduation appears if the screen has continuous values, how active
states invert, what the screen's one Red Lead use is (if any), and what never animates. A flow
rather than a panel is still bound by the doctrine across its screens, empty states, and
confirmations. Do not invent new colors, radii, faces, or elevation tiers; extend by combination,
and record real gaps as open questions.

## Open questions and migration

This language is a target, not the shipped design system. The items below are unsettled or
unvalidated and gate a full adoption.

- **Migration from Draughtsman's Restraint.** The running editor implements ADR-0069: a warm
  vellum palette, a brass accent, EB Garamond with Inter, and Phosphor icons. Arris replaces the
  palette, accent doctrine, typefaces, and iconography. Migrating the token files
  (`editor/design-system/tokens.css`, `tokens.ts`), the palette-contrast tests, and the design-system
  Storybook stories is scoped, sequenced follow-on work. ADR-0154 records the decision to adopt
  Arris as the target and migrate incrementally.
- **Feasibility against the real engine.** The signature behaviors were designed on paper: felt
  detents and seat flashes, live-length readouts on large plans, the luminance-adaptive cased
  keyline holding 3:1 over any finish in any light, and keyboard reach (scoped focus, roving
  proxy) under assistive technology. Each needs a prototype and a measurement pass before it is a
  build commitment.
- **Self-hosted faces.** Besley, Atkinson Hyperlegible Next, and B612 Mono are all SIL OFL and
  would be self-hosted, replacing the current Google Fonts loading path. The subsetting, loading,
  and license-notice work is part of the migration.
- **Preference and settings surfaces.** Input-mapping and display-calibration surfaces follow the
  bench doctrine for now; their detailed treatment is deferred to the component-library follow-on
  work.
- **Color fidelity.** Paint-judgment and lit-surface trust depend on the live render; no rendered
  specimen has been validated against a physical reference, and the dark poché and lit-board glare
  cases in particular need one.

## References

- ADR-0154 (adopt Arris as the target visual design language; migrate incrementally)
- Shipped visual language it targets: `docs/specs/2026-06-13-visual-design-language.md`, ADR-0069
- Editor visual-design-quality pass (within Draughtsman's Restraint):
  `docs/specs/2026-06-14-editor-visual-design-quality.md`
- Design system token contract: `docs/specs/2026-06-09-design-system-token-and-theming-contract.md`
- DOM overlay and accessibility: `docs/specs/2026-06-09-dom-overlay-and-accessibility.md`
- Units and color science: `docs/specs/2026-06-01-vernacular-design.md`, sections 7.3 and 7.4
