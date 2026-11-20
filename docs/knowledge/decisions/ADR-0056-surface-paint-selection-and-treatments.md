---
slug: decisions/ADR-0056-surface-paint-selection-and-treatments
title: 'ADR-0056: Surface selection, 2D paint rendering, and the surface-treatment union'
type: decision
tags:
  [
    architecture,
    editor,
    bridge,
    core,
    paint,
    surface-ref,
    surface-selection,
    cross-view-sync,
    surface-treatment,
    wallpaper,
    schema-migration,
    three-dimensional-seam,
    integration-acceptance,
  ]
related:
  [
    decisions/ADR-0048-paint-color-palette-and-site-metadata,
    decisions/ADR-0044-mvp-delivery-tracks-and-parallel-resequencing,
    decisions/ADR-0045-three-dimensional-render-harness-and-conventions,
    decisions/ADR-0006-registry-pattern,
    decisions/ADR-0029-schema-registry-migration-framework,
    decisions/ADR-0049-integration-acceptance-gate,
    decisions/ADR-0086-near-wall-transparency,
    decisions/ADR-0224-one-3d-pick-gives-the-selection-and-the-paint-target,
  ]
sourceFiles:
  [
    docs/specs/2026-06-11-surface-paint-selection-and-treatments.md,
    docs/specs/2026-06-10-editor-experience-makeover.md,
    core/model/paint.ts,
    core/paint/resolve-surface-paint.ts,
    core/commands/handlers/paint-commands.ts,
    core/migrations/schema/add-surface-treatment.ts,
    bridge/selection/surface-selection-store.ts,
    editor/paint/paint-panel.tsx,
    editor/paint/color-picker.tsx,
    editor/paint/finish-picker.tsx,
    editor/paint/entity-surface.ts,
    editor/paint/use-entity-surface-bridge.ts,
    editor/plan/wall-finish-section.tsx,
    engine/scene/wall-surface-table.ts,
    engine/scene/pick-surface.ts,
    engine/scene/pick-entity.ts,
    engine/scene/faded-for-picking.ts,
    engine/scene/near-wall-transparency.ts,
    e2e/tests/journeys/edit-color.spec.ts,
  ]
status: current
updated: 2026-11-20
---

# ADR-0056: Surface selection, 2D paint rendering, and the surface-treatment union

## Status

Accepted. Slice 9 of the editor-experience makeover wires the paint pickers built in ADR-0048
into the assembled editor. Doing so required a producer of the "selected surface" the pickers
consume, a visible result on the plan, and a generalized paint model. This ADR records those
realized shapes and the two ADR-0048 deferrals it changes.

## Context

ADR-0048 shipped the paint foundation: the `SurfaceRef` addressing scheme and `surfaceKey`, the
`assignSurfacePaint` / `clearSurfacePaint` commands, `resolveSurfacePaint`, and the `ColorPicker`
/ `FinishPicker` components, with two empty shell seams reserved for them. Nothing in the
assembled editor produced a "currently chosen surface", so the pickers were mounted nowhere and
the `edit-color` journey stayed `pending`, the canonical built-but-unwired gap the makeover
(ADR-0049) exists to close.

Two constraints from ADR-0048 and ADR-0045 still hold: the scene graph has no surface nodes (a
wall has two faces; a floor and a ceiling are no entity at all), and the 3D scene is still empty
node-groups with no wall-face meshes and no painted preview. So surface selection cannot reuse the
entity-selection store, and the 3D-side pick and highlight cannot be built end to end yet.

## Decision

### Surface selection is its own view-agnostic store

A `SurfaceSelectionStore` in `bridge/` holds a single `activeSurface: SurfaceRef | null` with
`select` / `clear` / `isActive` (compared by `surfaceKey`) / `subscribe`, mirroring the existing
`SelectionStore` and exposed through `useSurfaceSelection`. It is deliberately separate from
entity selection. This one store is the cross-view sync mechanism: every view that can draw a
surface reads it and highlights the active surface, so selection stays in lock-step for free.

### The 2D Paint panel is the entry point that exists today

A `PaintPanel` (mounted in `PAINT_PICKER_SLOT`, with the bound pickers in `PAINT_INSPECTOR_SLOT`)
lists the active floor's paintable surfaces: each wall as its two room-facing faces (labelled by
the faced room when derivable, with stable neutral fallbacks), plus the floor and the ceiling.
Selecting a row sets `activeSurface`; the pickers bind to it and dispatch `assignSurfacePaint`.
Selecting a wall on the canvas scopes the panel to that wall's faces, giving a "select then paint"
flow in the view where the wall is clickable.

### The result is rendered on the 2D plan (supersedes an ADR-0048 deferral)

The plan renderer draws assigned paint: a color band along a wall's room-facing side and a
low-opacity floor fill, read from `resolveSurfacePaint`. The active surface also gets a selection
highlight distinct from its paint. This **supersedes ADR-0048's deferral of "a two-dimensional
swatch overlay of paint on the plan canvas"**; the rendering is pure-2D and does not depend on the
render seam. A painted ceiling has no distinct 2D representation and shows only in the panel and,
later, the 3D preview.

### The 3D pick and highlight are a documented drop-in seam

When the 3D render track adds surface meshes, a floor slab carries `userData.surface = SurfaceRef`
(mirroring `userData.entityId`) and a wall carries a table of surface refs by material group (see
the 2026-11-15 amendment); a click sets the same `activeSurface`, and the mesh reads it for
the highlight and reads `resolveSurfacePaint` for its material. No 3D code is written or stubbed
here beyond the contract. This keeps the painted 3D preview deferred behind the render seam
(ADR-0045) while making it drop-in.

### Stored paint is a `SurfaceTreatment` discriminated union

`PaintAssignment { color, finishId }` generalizes to a `SurfaceTreatment` union whose only built
variant is `{ kind: 'solid'; color; finishId }`. The `{ kind: 'tiled-image'; assetRef; repeatMm;
rotationDeg }` and `{ kind: 'pattern'; patternId; scale; colors }` variants are typed so the
store, schema, and `resolveSurfacePaint` admit them without reshaping; the `tiled-image` assetRef
is content-addressed (invariant 4). The store stays keyed by `surfaceKey`. `assignSurfacePaint`
keeps its `(ref, color, finishId)` sugar over a general `assignSurfaceTreatment(ref, treatment)`,
so the pickers are unchanged. A `SurfaceTreatmentRegistry` (ADR-0006 pattern) for per-kind editor,
projection, and material is a documented seam, not built. **This makes ADR-0048's
"solid-color-only" paint assignment a special case rather than the whole model.**

### One schema migration

`add-surface-treatment` advances `CURRENT_SCHEMA_VERSION` from 8 to 9, rewriting each
`Project.paint[key]` from `{ color, finishId }` to `{ kind: 'solid', color, finishId }`. It is a
structural pass in the ADR-0029 framework and appended to the existing migration chain; older
documents upgrade unchanged.

### Subdividing a wall face is an address-level seam

The `wall-face` `SurfaceRef` variant gains an optional `region`; `surfaceKey` serializes it into
the key, so a whole-face assignment is `region` absent and a subdivided face is several keys, with
the store, resolver, and commands unchanged. The subdivision UI and band geometry are deferred.

## Spec reconciliation

This realizes slice 9 of the makeover spec (`docs/specs/2026-06-10-editor-experience-makeover.md`)
with a scope wider than its "pure wiring" framing: a surface-selection store, 2D paint rendering,
and the treatment union. It is additive to the design specification (sections 6.8 and 7.4) and
edits no specification prose. The two changes to ADR-0048 are recorded above: the 2D paint overlay
is now built (was deferred), and solid-color paint becomes one variant of a treatment union.

## Consequences

- The pickers are reachable and wired in the assembled editor, and the `edit-color` journey and an
  integration-audit assertion make that a tracked, enforced fact.
- Selection and highlight share one store, so the 3D highlight is wiring, not redesign, when meshes
  land; no 3D code is faked in the interim.
- Paint is forward-compatible with wallpaper, tiled images, and pattern fills, and with per-region
  subdivision, without reshaping the store or the commands.
- `core/model/paint.ts`, the schema chain, and the `core/` and `bridge/` barrels are touched
  additively. The treatment union is a breaking in-memory shape for any direct
  `PaintAssignment` consumer; the migration and the `assignSurfacePaint` sugar contain the blast
  radius to the model edge.

## References

- Slice spec: `docs/specs/2026-06-11-surface-paint-selection-and-treatments.md`.
- ADR-0048 (the paint foundation this wires; the 2D-overlay and solid-only deferrals it changes).
- ADR-0045 and ADR-0044 (the render seam the 3D pick and highlight wait behind; selection sync).
- ADR-0006 (the registry pattern for the future treatment registry).
- ADR-0029 (the schema-migration framework the v8 to v9 migration uses).
- ADR-0049 (the integration-acceptance gate this slice flips and extends).

## Amendment 2026-11-15: a wall face can be picked in the 3D view

Issue #730 made a click on a wall face in the 3D view set the paint target. The sentence in
"The 3D pick and highlight are a documented drop-in seam" that gave every wall-face mesh a
`userData.surface` stamp is corrected in place: it is false for walls, and a floor slab is the only
mesh that still carries the stamp.

- **A wall mesh carries a surface table.** One wall mesh holds several faces, so one stamp for the
  mesh cannot name a face. Each wall mesh carries a table in `userData` (the key constant is
  `SURFACE_BY_MATERIAL_INDEX_KEY`) that gives a surface reference, or none, for each material group.
  `buildSectionMesh` builds the mesh, its materials, and the table from one list of wall sections,
  on both wall build paths (the plain wall and the wall with openings). The reference that a pick
  returns is therefore the reference whose paint the renderer shows. The surface picker reads the
  table with the material group of the triangle that the ray hit.
- **A wall decides at its first hit.** A long face gives that face and its side. A top cap, an end
  cap, or the reveal of an opening gives no surface, and nothing behind the wall is returned. An
  object with no table keeps the older behavior: a floor stamp decides, and an object with no
  surface is skipped.
- **A faded wall does not take a click.** The near-wall transparency (ADR-0086) fades each
  exterior wall that the camera sees from outside, often two of them in a diagonal view, with the
  openings in it, its junction fills, and furniture attached to it (ADR-0087, ADR-0103, ADR-0140,
  ADR-0145). The project owner decided on 2026-11-15 that a faded
  object does not take a click, for the selection (`pickEntityId`) and for the paint target
  (`pickSurface`) alike. The fade module marks each material that it fades in the one function that
  also writes the opacity (`applyFadeState`), and both pickers skip a hit on a faded object through
  one predicate (`isFadedForPicking`). A fill that is held opaque is not faded and behaves as before.
- **The editor keeps a picked face.** The hook that gives a newly selected entity its default
  surface keeps the active surface when it already is a surface of that entity
  (`isSurfaceOfEntity`). The wall finish section takes its side from the active surface and sets it
  when the user changes the side. Before, the hook reset each wall selection to the left face, and
  the section kept its own side. One effect is new: the chosen side of a wall now lasts. When the
  user selects another thing and then the same wall again, the section opens on the side that was
  active for that wall, because the hook never clears a face of the wall it selects. A click on a
  top cap names no face, so the wall then gets its default face unless one of its faces is active.

Not decided here:

- What a click on furniture, on a door leaf, on glass, or on a junction fill does to the paint
  target, and a line hit on the edge overlay of a faded wall. Issue #742 tracks these.
- Whether the fade itself should depend on the camera's distance from the wall. The owner proposed
  it, and issue #744 tracks it.

## Amendment 2026-11-20: the click on furniture, door parts, glass, and junction fills

ADR-0224 decides the click on furniture, on a door leaf or frame, on glass, and on a junction fill,
the first case in the list above. Every object that is not faded now stops the click, and one hit
gives both the selection and the paint target. Furniture and glass clear the paint
target, and so does a door leaf or frame, which has no paintable face. A junction fill gives
no paint target and no selection. The rule "a wall decides at its first hit" now holds for every object. A faded object still does not take a click.

Two points in the list above stay open: a line hit on the edge overlay of a faded wall (#742), and
the fade that depends on the camera's distance (#744).
