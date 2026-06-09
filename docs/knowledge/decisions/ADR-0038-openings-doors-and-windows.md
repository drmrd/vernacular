---
slug: decisions/ADR-0038-openings-doors-and-windows
title: 'ADR-0038: Openings as typed wall-hosted entities with operation-family plan symbols'
type: decision
tags:
  [
    architecture,
    core,
    editor,
    plan,
    openings,
    doors,
    windows,
    element-types,
    registry,
    commands,
    undo-redo,
    scene-graph,
    rendering,
    canvas,
    selection,
    hit-test,
    migration,
  ]
related:
  [
    decisions/ADR-0005-command-pattern-framework-captured-inverse,
    decisions/ADR-0006-registry-pattern,
    decisions/ADR-0018-scene-graph-derivation,
    decisions/ADR-0021-2d-plan-rendering-interaction,
    decisions/ADR-0032-broad-then-narrow-hit-test-and-multi-select,
    decisions/ADR-0035-wall-editing-endpoint-move-and-thickness,
    decisions/ADR-0037-image-underlay-and-calibration,
    decisions/ADR-0029-schema-registry-migration-framework,
  ]
sourceFiles:
  [
    docs/specs/2026-06-01-vernacular-design.md,
    docs/specs/2026-06-07-openings-doors-and-windows.md,
    core/model/types.ts,
    core/registries/element-types.ts,
  ]
status: current
updated: 2026-06-07
---

# ADR-0038: Openings as typed wall-hosted entities with operation-family plan symbols

## Status

Accepted; implemented (slice 7 of the Phase 1 two-dimensional plan editor) on
branch `feat/openings-doors-and-windows`, pending merge. The model, factory,
expanded element-type registry, the five undoable commands, the pure geometry
and scene projection, the v2-to-v3 migration, the seven plan-symbol routines,
opening selection and marquee, and the place-opening tool, inspector, and drag
are all implemented; the full check chain and `rgb:audit` are green. This ADR
should gain its merge reference when the branch lands. The slice design is
`docs/specs/2026-06-07-openings-doors-and-windows.md`; the
parent design specification (`docs/specs/2026-06-01-vernacular-design.md`,
sections 3.1, 3.2, and the section 10 Phase 1 deliverables) remains
authoritative. This ADR records the interpretation and the one deliberate
divergence from the parent spec's phasing.

## Context

The plan editor models walls and rooms but no openings. The parent spec places
`openings[]` under each floor (section 3.1), types the building shell at the
element level rather than by subclass (a door, transom, pocket door are all
`Opening` records whose `type` points to the `ElementTypeRegistry`, section 3.2),
and directs that wall-hosted elements be modeled as a general host relationship
(host wall, position along the wall, perpendicular offset) rather than a
door/window special case (section 2, the "turrets and bay windows" note). It also
requires that opening geometry and rendering read shape from the element type and
never hardcode width-by-height rectangles (section 79).

The parent spec's Phase 1 opening list is terse: single and double swing doors,
double-hung, picture, casement (section 10). The fuller residential and
period-vernacular vocabulary (pocket, sliding, French, dutch, bifold, barn;
transoms, sidelights; bay/bow; arched/half-round; casement variants) is listed
under Phase 4, the old-house shell (section 10, "full opening type vocabulary in
ElementTypeRegistry"). For a planner whose differentiator is period-vernacular
architecture, shipping only five opening types in the editor's first opening
slice understates the product; the user directed expanding slice 7 to the common
residential vocabulary.

## Decision

### Openings are typed, wall-hosted `Opening` records

`core/model/types.ts` adds an additive `Opening` (`id`, `type` into the
`ElementTypeRegistry`, `hostWallId`, `position` in millimeters from the host
wall's start to the opening's center along the wall, `width`, `height`,
`sillHeight`, and an `OpeningOrientation` of `{ hinge: 'start' | 'end'; facing:
'positive' | 'negative' }`), and `Floor` gains `openings: Opening[]` sibling to
`walls` and `underlays`. The host relationship is the general one the parent spec
asks for (a wall id plus a position along the wall plus a perpendicular facing),
not a door/window special case, so furniture and wall features reuse it in later
phases. The `'start' | 'end'` union (`WallEnd`, today in the wall commands) is
lifted to the model layer so `core/model` does not depend on `core/commands`.

### Operation family, not marketing name, drives the plan symbol

The load-bearing decision that makes a broad vocabulary affordable in one slice:
a 2D plan symbol is determined by how an opening **operates** (swing, slide,
fold, pivot, cased, fixed window, crank window), and its **shape** is a separate
registry parameter. Named types collapse onto a small set of shared symbol
routines: double-hung, single-hung, sliding, and picture windows are
plan-identical and share `window-fixed`; casement, awning, and hopper share
`window-crank`; French and double doors share the double-leaf `door-swing`; pocket
and bypass and barn share `door-slide`. Adding a named type is therefore a
registry addition (an `ElementType` with `category: 'opening'`, a `plan2D.symbol`
naming its family routine, and an `opening` record carrying the operation family
and default dimensions), not new rendering code. `ELEMENT_TYPE_REGISTRY_VERSION`
bumps to 2, a backward-compatible addition (old projects reference no new ids).

### Five undoable commands following the additive-per-floor-entity pattern

`core/commands/handlers/opening-commands.ts` adds `placeOpening`, `moveOpening`,
`resizeOpening`, `flipOpening` (toggling one orientation axis), and
`removeOpening`, registered through `registerOpeningCommands`. Each `apply`
reassigns `state.floors` immutably and maps only the target floor and opening, so
the root inverse-capture proxy records the slice replacement and the dispatcher
captures the inverse (ADR-0005); no handler hand-authors an inverse. The
single-opening updates share `mapTargetFloor` and `mapTargetOpening` helpers, the
same shared-traversal refactor the wall (ADR-0035) and underlay (ADR-0037)
commands applied.

### Pure derivation, Canvas rendering through the existing seam, hit-test entry

Opening geometry derives in pure `core` (resolve the host wall, compute center,
along, normal, jamb points, clamp `position` into the wall, skip a missing host),
projecting an `OpeningSceneNode` into `graph.openings` alongside walls, rooms, and
underlays (ADR-0018). The Canvas paints each family's symbol through the narrow
`PlanDrawingContext` seam (ADR-0021), after walls and before room labels,
breaking the host wall with a gap and reading shape from the element type.
Openings register bounds with the slice-5 hit-test index and resolve before walls
and rooms under the cursor, closing the slice-5 deferral that openings join the
index when their slice lands (ADR-0032). Selection stays bridge-owned and outside
undo (ADR-0020). Placement (a `place-opening` tool) and editing (an inline
inspector and a drag-along-wall reposition) mirror the slice-6 wall-editing
interactions (ADR-0035) and are coverage-excluded glue validated by the
wall-drawing end-to-end spec.

### An additive schema bump because openings are plain data

Unlike the underlay raster (whose bytes are session-only pending the asset
pipeline, ADR-0037), an opening is plain model data and persists in
`project.json`, so the `load -> save -> load` round-trip must preserve it. A
schema bump from version 2 to version 3 with an `addFloorOpenings` migration
backfills `openings: []` on every floor, so a version-2 project loads forward
(ADR-0029). `CURRENT_SCHEMA_VERSION` becomes 3.

## The divergence from the parent spec's phasing

This slice delivers, in Phase 1, opening types the parent spec lists under Phase
4 (pocket, sliding, French, dutch, bifold, barn; single-hung; awning, hopper;
transom and sidelight as their own openings; cased opening). The divergence is
deliberate and bounded:

- It is affordable because the typed-element design and the operation-family
  symbol decision make these registry additions, not new code, exactly as the
  parent spec's section 3.2 promises ("adding a new opening type is a registry
  addition, not a schema change").
- It does not pull forward the genuinely harder Phase 4 work: projecting windows
  that change the floor footprint (bay, bow, oriel, garden), shape variants that
  need curved geometry (arched, half-round, round, Palladian, fanlight), 3D
  builders, and trim/casing all remain deferred (see the slice spec, sections 2
  and 4).
- It does not edit the authoritative parent specification. The parent spec's
  Phase 4 vocabulary list is a superset that still stands; this slice delivers a
  rectangular, wall-hosted subset of it earlier. This ADR is the record the
  rules require for a phasing decision that diverges from the parent spec.

## Consequences

- The editor gains a usable residential door-and-window vocabulary in its first
  opening slice, fitting the product's period-vernacular differentiator, without
  growing the rendering surface beyond a handful of operation-family routines.
- The wall-hosted attachment model is established and exercised by real entities,
  so furniture and wall-feature hosting in later phases extend a proven model
  rather than inventing one.
- Phase 4's opening work narrows to the deferred hard parts (projecting windows,
  shape variants, 3D, trim) plus refining period-specific symbol art, rather than
  building the opening pipeline from scratch.
- A new schema version (3) and registry version (element types 2) enter the
  migration surface; the additive migration keeps old projects loading.

## References

- Slice design: `docs/specs/2026-06-07-openings-doors-and-windows.md` (the full
  catalog, model, commands, rendering, selection, interaction, migration, and the
  now/deferred boundary).
- Design specification `docs/specs/2026-06-01-vernacular-design.md`: sections 3.1
  and 3.2 (entity tree and typed-at-element-level modeling), section 2
  (wall-hosted elements as a general host relationship), section 79 (shape from
  the element type), and the section 10 Phase 1 and Phase 4 opening deliverables.
- ADR-0005 (framework-captured command inverse), ADR-0006 (the registry pattern
  the opening types extend), ADR-0018 (scene-graph derivation), ADR-0021 (the
  Canvas plan-drawing seam), ADR-0029 (the schema-migration framework), ADR-0032
  (the hit-test the openings join), ADR-0035 (the wall-editing interactions the
  opening editing mirrors), ADR-0037 (the additive-per-floor-entity and
  shared-traversal command pattern openings follow).
  </content>
