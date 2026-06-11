# Editor Experience Makeover

Date: 2026-06-10
Status: Approved design, pending implementation plan

## Summary

The parallel delivery tracks of the post-Phase-1 work (ADR-0044) each shipped
their pieces as isolated, well-tested units, but the composition layer that wires
those pieces into a usable, coherent editor was deferred and never completed. The
result is an application whose individual parts are green in isolation yet whose
assembled experience is broken: finished surfaces are mounted nowhere, the
interaction layer that a real editor needs (undo, redo, delete, cancel,
keybindings, a command palette) is absent, several integration bugs are visible
on first use, and the visual language is unfinished.

This makeover has two goals that are really two missing layers:

1. A wired, coherent, attractive editor shell that exposes the capabilities the
   tracks already built and adds the interaction layer that makes them operable.
2. An automated testing layer that exercises the assembled application end to end,
   plus a process gate so that "a feature is reachable and functional from the
   composed editor" becomes a tracked, enforced requirement rather than an
   assumption.

The underlying domain (`core/`), the scene-graph derivation, the command dispatch
boundary, the registries, and the design-system token system all stay. Almost
every fix below is wiring, exposure, or polish of capability that already exists,
not a rebuild.

## Motivation: the observed gaps and their root cause

Testing the merged `main` surfaced the following, all traceable to the same root
cause (built-but-unwired tracks plus no journey-level coverage):

- No keybindings or visible controls for undo and redo.
- No way to cancel a wall after the first click.
- No way to enter a three-dimensional view (the preview is a hardwired side
  panel, not a mode).
- Paint and color controls that appear inert (the pickers are built and exported
  but mounted into empty panel slots that were left as seams).
- Creating or switching a floor does not change the canvas.
- Lengths shown in millimeters even at room and building scale.
- No keybindings or controls for deleting elements.
- No way to re-edit a wall endpoint after it is placed.
- Walls that can attach to window and door openings.
- No snapping or sliding along an existing wall while drawing.
- No way to make a room with an interior void (a courtyard or an inaccessible
  mechanical core).
- An overall visual and interaction quality that is rough.

The reason none of these were caught: the end-to-end suite is small and is almost
entirely smoke, visual-regression, and storage coverage. No test drives the
assembled editor through a real user journey (draw a wall, undo it, delete a
selection, switch floors and watch the canvas change, edit a color, toggle the
three-dimensional view). Unit tests pass because each component is correct alone;
nothing proves the parts are connected.

## Goals

- Wire every already-built surface (the color and finish pickers, the site
  metadata editor, the three-dimensional preview, the floor switcher) into the
  shell and connect each to the dispatch boundary.
- Add the interaction layer: a command registry, a command palette, a keybinding
  system, undo and redo, delete, and a universal cancel.
- Make wall drawing and editing complete: a chained polyline draw with cancel and
  per-vertex backout, smart angle snapping by default, snapping along existing
  walls, endpoint re-editing after placement, and a guard that prevents walls from
  attaching to openings.
- Add an opt-in precision snapping panel with an independent toggle per snap kind,
  for power users.
- Fix the integration bugs: per-active-floor rendering, adaptive unit display.
- Add support for rooms with interior voids (donut and courtyard rooms) in the
  core room derivation.
- Apply a single coherent visual language (the drafting-table direction) through
  the design-system tokens, with light and dark variants.
- Build a journey-test layer over the assembled application and a coverage matrix,
  and institute an enforced integration-acceptance gate.

## Non-goals

- Furniture and object placement. This is its own delivery track in ADR-0044
  (pack format and tooling, asset registry, library browser, custom import, and
  the placement tool) and part of the public alpha. It is not folded into this
  makeover. The shell information architecture must, however, reserve a place for
  it (a tool-rail entry and a library panel slot) so it drops in cleanly later.
- The three-dimensional renderings that converge on the preview track beyond the
  basic wired preview (parametric stair geometry, painted preview, cutaway). Those
  remain track and convergence work.
- New export formats. The output track owns those.

## The shell architecture

A split-pane workspace with a command palette and full keybindings layered on top.
This is consistent with the split-pane shell named in ADR-0044, and it gives
renovators a discoverable, professional layout while giving power users speed.

Regions:

- A top command bar: the wordmark, the primary menus, undo and redo controls, the
  active unit display, and the project controls (open, new, export, save status).
- A left tool rail: the drawing and editing tools as icon buttons, the
  place-opening type chooser when that tool is active, and a reserved seat for the
  furniture tool that arrives with the assets track.
- A central viewport that splits into the two-dimensional plan and the
  three-dimensional preview (see the split behavior below).
- A right inspector that swaps its content by selection and tool: the selection
  inspector, the paint pickers, the site metadata editor, and the floor and
  underlay panels.
- A bottom status bar: the active tool, the live cursor coordinates in adaptive
  units, the engaged snap, and the in-progress draw readout (length and angle).

The existing accessibility landmarks and the DOM overlay (ADR-0043) are preserved.
Each region is a single labeled landmark, as the current shell already enforces.

## Command and interaction model

A single command registry is the spine. Each command carries an id, a label, an
optional keybinding, and an enablement predicate. The tool-rail buttons, the
command palette, and the keybinding layer all read from this one registry, so no
action can exist as a keybinding without also being discoverable in the palette,
and the reverse. This is the structural fix for the missing undo, redo, and delete
affordances.

- Command palette: opened with the platform command-search chord, it offers fuzzy
  search over every registered command. Renovators discover capability; power
  users invoke without reaching for the mouse.
- Keybindings (default set, rebindable later through editor preferences): select,
  wall, opening, and dimension tools; cancel and deselect; delete; undo and redo;
  pan; fit; and the view-mode keys. Copy, cut, paste, nudge, and rotate already
  exist from the clipboard and transforms work and are surfaced here.
- Undo and redo become visible controls in the command bar, keybindings, and
  palette entries. They flow through the existing dispatch history.
- Tool state machine: every tool has explicit idle, active, and committing states.
  Cancel always returns the editor to a safe state. The status bar always reports
  the active tool and what it is about to do.

## Wall drawing and editing

- Chained polyline drawing: click to start, move with a live snapped ghost, click
  to commit each segment and continue, backspace to remove the last vertex, enter
  or double-click to finish, and cancel to abandon the run (or to back out of the
  first click). Closing the path onto its start point closes the loop, which is
  what forms a room. This resolves the inability to back out of a wall after the
  first click.
- Smart angle snapping is the default: a drawn wall snaps to zero, forty-five, and
  ninety degrees relative to the world and to nearby walls, with a held modifier to
  draw a free angle, and a live angle and length readout. This suits period work,
  where most walls are square but bays and angled additions are common.
- Snapping along existing walls: the snap resolver gains an on-edge snap (the
  nearest point along a wall) and wall-line intersection snaps, finishing the kinds
  deferred from the original snapping slice.
- Endpoint re-editing after placement: selecting a wall exposes draggable endpoint
  handles and numeric entry in the inspector, both routed through the existing
  move-wall-endpoint command. This is wiring and exposure of an existing capability.
- Opening-host guard: wall endpoints snap and attach only to wall geometry
  (endpoints, edges, and intersections), never to openings. Openings remain
  wall-hosted only. This resolves walls attaching to windows.

## Precision snapping panel

An opt-in, off-by-default power-user surface that exposes each snap kind as an
independent running toggle (endpoint, midpoint, on-edge or nearest point,
intersection, perpendicular, parallel, extension, center, grid, and angle), plus a
master on and off and a configurable snap radius. Each toggle is a command in the
same registry, so it has a keybinding and a palette entry, and the status bar
reports the currently engaged snap. The settings persist as editor preferences.
The curated smart snapping remains the default; this panel is the manual-precision
override on top of it. This lands the snap-settings editor preference named as a
deferred follow-up in the roadmap. (Described here in vendor-neutral terms, per the
repository naming policy.)

## Two-dimensional and three-dimensional split

A vertical split with the two-dimensional plan primary (about sixty to forty), a
draggable splitter, and a collapsible three-dimensional pane. View-mode keys
select two-dimensional full, split, and three-dimensional full, so entering the
three-dimensional view is maximizing the pane. The pane wires the existing scene
canvas to the live active-floor scene rather than the always-on stub it renders
today. Selection synchronizes both ways, the cross-surface selection sync named in
ADR-0044. On first open the editor shows the two-dimensional plan full with a
visible control to reveal the three-dimensional pane, so the capability is
discoverable without being intrusive.

## Floors

The visible bug is that the plan view derives from the whole project rather than
the active floor, so switching or adding a floor does not change the canvas. The
fix is to derive the rendered scene strictly from the active floor and to re-derive
on switch and on add. The tool rail gains a complete floor list: select, add,
rename, duplicate, reorder, and delete, built on the multi-floor commands already
landed by the structure track. Stairs and floor-spanning topology remain structure
track work; this makeover delivers correct per-floor rendering and a clean switcher.

## Units

An adaptive length formatter on top of the existing unit formatters. In metric it
selects millimeters, centimeters, or meters by magnitude with category-appropriate
precision; in imperial it shows feet and inches. It is applied everywhere lengths
surface: rulers, dimensions, the status bar, and the inspectors. This resolves the
millimeter display at room and building scale.

## Donut and courtyard rooms

Extend the planar-face room derivation (ADR-0026) so that an enclosed region that
contains a separate closed loop attaches that loop as an interior hole. The room
polygon model carries an outer ring plus zero or more hole rings; fill, area
(outer area minus hole areas), the thickness-aware clear-area inset, and
hit-testing all become hole-aware. This is the courtyard-or-island case that was
deferred as best-effort in the first room-derivation slice, done properly. It is
pure `core/` work with no user-interface surface beyond correct rendering.

## Paint and metadata wiring

Mount the already-built color picker and finish picker into the paint panel slots
that the shell currently renders as empty seams, and mount the site metadata
editor into a project metadata panel, each connected to the dispatch boundary. This
is the direct fix for inert color controls and is pure wiring of tested components.

## Visual design

Apply the drafting-table direction through the design-system tokens: a warm vellum
canvas, ink-blue chrome, brass and clay accents, and a quiet serif for headings
with a clear sans-serif for controls and a monospace for coordinate readouts. The
direction is expressed entirely as token values (color, type, spacing, elevation)
so it flows through the existing theming system, with light and dark variants. The
goal is a tool that signals respect for old houses on first open while staying
professional for long working sessions.

## Testing strategy and the integration-acceptance gate

The root cause of the gaps is that features landed unit-green in isolation and were
never exercised in the assembled application. The fix is a testing layer that
proves features are reachable and functional from the composed editor, plus a gate
that makes that proof mandatory.

- Journey tests, driven through the real wired application, for each core flow:
  draw a wall and see it, undo and redo, delete a selection, cancel a wall with the
  cancel key, switch floors and see the canvas change, edit a color and see it
  apply, toggle the two- and three-dimensional views, re-edit a wall endpoint, snap
  along a wall, and confirm a wall cannot host on an opening. These are the tests
  that would have caught the entire observed list.
- Shell integration tests that assert each surface is actually mounted and wired to
  dispatch. These are fast and would have flagged a picker mounted nowhere
  immediately.
- A living coverage matrix mapping each user-facing capability to the journey test
  that proves it is reachable. This makes "is it actually wired" a tracked
  question.
- A required integration-acceptance gate, analogous to the existing red-green-blue
  audit: a feature is not done until a journey test proves it is reachable and
  functional from the assembled editor, enforced in continuous integration. This is
  the durable fix that prevents recurrence.

## Decomposition into slices

The implementation plan will detail the slicing; the intended shape, ordered so
that each slice lands behind a journey test and the shell stays usable throughout:

1. The journey-test harness and the integration-acceptance gate, with a first
   journey test over the current draw-a-wall flow, so the gate exists before the
   work it governs.
2. The design-system retheme to the drafting-table tokens (light and dark).
3. The shell information architecture and the command registry, palette, and
   keybinding system, including undo, redo, and delete.
4. The split-pane two- and three-dimensional viewport with selection sync and the
   view-mode keys.
5. Per-active-floor rendering and the floor switcher.
6. Adaptive unit display.
7. Wall drawing completion (chained polyline, cancel, smart angle snap) and the
   along-wall snapping, the opening-host guard, and endpoint re-editing.
8. The precision snapping panel and editor preferences.
9. Paint, finish, and site-metadata wiring.
10. Donut and courtyard rooms in the core room derivation.

## Risks and open questions

- Scope. The makeover spans many surfaces. The slicing keeps each increment small
  and behind a journey test, and the shell remains usable after every slice.
- The integration-acceptance gate adds friction to every future feature. That is
  the intent, and it is the cost of preventing the built-but-unwired failure mode.
- The drafting-table palette must clear contrast and accessibility thresholds in
  both light and dark variants; the existing accessibility tests and the token
  system are the guardrails.
- Donut-room derivation interacts with the thickness-aware clear-area inset and
  with hit-testing; the hole-aware geometry must stay correct for the common cases
  and degrade gracefully for pathological topologies, consistent with the existing
  best-effort posture for unusual geometry.

## References

- Design specification `docs/specs/2026-06-01-vernacular-design.md`.
- ADR-0044 (track-based MVP delivery and re-sequencing): the split-pane shell, the
  user-experience track, the assets and furniture track, and the selection sync.
- ADR-0026 (room derivation by planar-face enumeration): the basis the donut-room
  work extends.
- ADR-0043 (DOM overlay and accessibility) and ADR-0021 (two-dimensional plan
  rendering and interaction): the overlay and rendering seams the shell preserves.
- ADR-0033 (the drawing snap model) and the snapping slice deferrals: the on-edge
  and intersection snaps and the per-kind toggle preferences.
- ADR-0035 (wall editing endpoint move and thickness): the endpoint command the
  re-editing surface exposes.
- ADR-0048 (paint, palette, and site metadata decisions): the model behind the
  pickers being wired.
- ROADMAP.md: the delivery tracks, the furniture track placement, and the deferred
  snap-settings editor preference.
