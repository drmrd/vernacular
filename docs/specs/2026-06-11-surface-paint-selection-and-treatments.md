# Surface paint: selection, cross-view highlight, and treatments

Slice 9 of the editor-experience makeover (`docs/specs/2026-06-10-editor-experience-makeover.md`).
The makeover spec frames this slice as "paint, finish, and site-metadata wiring." Bringing
the built-but-unwired pickers to life turns out to need one missing concept that the spec did
not name: a producer of the "selected surface" the pickers consume. This document designs that
producer, the visible result of a paint assignment, and the extension seams for richer surface
treatments. The realized shapes and the supersedes are recorded in ADR-0056.

## Context

The paint-and-metadata track (ADR-0048) shipped a complete, tested foundation: a pure `core/`
color module, a palette registry, a stable `SurfaceRef` addressing scheme
(`wall-face` | `floor` | `ceiling`) with a `surfaceKey(ref)` chokepoint, the `assignSurfacePaint`
and `clearSurfacePaint` commands, `resolveSurfacePaint`, and the `ColorPicker` / `FinishPicker`
React components. The shell reserves two empty panel seams for them, `PAINT_PICKER_SLOT` and
`PAINT_INSPECTOR_SLOT`.

What is missing is the thing in between: nothing in the assembled editor produces a "currently
chosen surface" for the pickers to bind to, so the pickers are mounted nowhere and the
`edit-color` journey is `pending`. This is the exact built-but-unwired failure the makeover
exists to close.

Two hard constraints shape the design:

1. **The scene graph has no surface nodes.** A wall face, a floor surface, and a ceiling are not
   selectable scene-graph nodes; they are addressed only by `SurfaceRef`. So surface selection
   cannot reuse the entity-selection store, which is keyed by scene-node id. A wall additionally
   has two faces, so selecting the wall node does not name a face.
2. **The 3D scene is still empty node-groups.** `engine/scene/build-scene.ts` builds one group
   per node with no geometry; there are no wall-face meshes to click or to highlight, and the
   painted 3D preview is deferred behind the render seam (ADR-0045, ADR-0048). So "select a wall
   in 3D and paint its room-facing face" cannot be built end to end in this slice. It is designed
   as a drop-in seam instead.

## Goals

- Make a surface selectable in the assembled 2D editor and bind the existing pickers to it, so
  assigning a color and a finish dispatches `assignSurfacePaint` and round-trips through the store.
- Show the result on the plan: a painted wall face and a painted floor are visible where the user
  draws, not only in a panel readout.
- Keep selection and highlight in lock-step across views through a single source of truth, so the
  3D highlight is a drop-in when wall-face meshes land.
- Generalize stored paint so a surface fill is not only a solid color, and leave clean seams for
  subdividing a face and for new treatment kinds.
- Flip the `edit-color` journey to `required`.

## Non-goals (deferred, with seams)

- The 3D wall-face pick and the 3D painted/highlighted preview (behind the render seam).
- A face-subdivision editor and its band geometry (the address-level seam ships; the UI does not).
- The `tiled-image` and `pattern` treatment editors and their rendering (the typed variants ship;
  the editors do not).
- The site-metadata editor wiring (`SiteEditor`); it shares the slice's panel seams but is an
  independent surface and is tracked separately to keep this slice focused on paint.

## Surface selection: one view-agnostic store

A new bridge store, `SurfaceSelectionStore`, holds a single `activeSurface: SurfaceRef | null`
with `select(ref)`, `clear()`, `isActive(ref)` (compared by `surfaceKey`), and `subscribe`. It
mirrors the shape and the `useSyncExternalStore` wiring of the existing `SelectionStore`, exposed
through `useSurfaceSelection`. It is deliberately separate from entity selection: a surface is not
a scene-graph entity, the two have different lifetimes, and conflating them would make a wall's
two faces and a floor (which is no entity at all) inexpressible.

This single store is the cross-view sync mechanism. Every view that can draw a surface reads the
store and highlights the active surface; selection therefore stays in lock-step for free. The 2D
plan implements the highlight in this slice; the 3D preview's highlight is a documented seam.

## The 2D Paint panel (built)

A `PaintPanel` mounts into `PAINT_PICKER_SLOT`, and the bound pickers mount into
`PAINT_INSPECTOR_SLOT`. The panel is a **surface list scoped to the active floor**, grouped:

- **Walls (this floor):** each wall on the active floor, listed as its two room-facing faces.
  A face is labelled by the room it faces when that is derivable from the scene graph
  ("Parlor side"), falling back to a stable neutral label otherwise ("interior" / "exterior",
  or "Side A" / "Side B"). Each row carries a swatch of its current paint, or a struck-through
  "unpainted" swatch.
- **Floor and ceiling:** one row each for the active floor's floor surface and ceiling.

Selecting a row calls `surfaceSelection.select(ref)`. The pickers below the list bind to
`activeSurface`: choosing a color chip dispatches `assignSurfacePaint(activeSurface, ...)`, and
the finish radios dispatch the same with a finish id. The selected row's swatch and a monospace
readout reflect `resolveSurfacePaint`, so "it applies" round-trips through the store and is the
panel's own assertion surface.

When a wall is selected on the canvas (entity selection), the panel scopes to that wall's two
faces and selects one by default. This is the bridge from entity selection to surface selection
that gives a "select a wall, then paint it" flow where the wall is actually clickable, satisfying
the spirit of the 3D-pick direction in the view that supports it today.

## The visible result on the plan (built)

The plan renderer draws the assigned paint so the result is visible where the user works,
superseding ADR-0048's deferral of a 2D paint overlay (recorded in ADR-0056):

- **Wall face:** a thin color band along the room-facing side of the wall, offset to the painted
  side, drawn from `resolveSurfacePaint(project, ref)`.
- **Floor:** a low-opacity fill of the floor region for the active floor.
- **Ceiling:** has no distinct 2D representation, so a painted ceiling shows only in the panel
  swatch and readout (and in the 3D preview when that seam lands).

The active surface additionally gets a selection highlight (an accent stroke for a wall face, a
hatch or outline for a floor) distinct from its paint, so an unpainted selected surface is still
clearly indicated.

## Cross-view highlight and the 3D seam (designed)

Because both views read `activeSurface`, the 3D highlight is wiring, not redesign, once meshes
exist. The seam, recorded in ADR-0056: when the 3D render track adds wall-face meshes, each face
mesh carries `userData.surface = SurfaceRef` (mirroring today's `userData.entityId` on the node
group); a click maps it back to a `SurfaceRef` and calls `surfaceSelection.select(ref)`, and the
mesh reads `activeSurface` for an emissive highlight and reads `resolveSurfacePaint` for its
material. No 3D code is written or stubbed in this slice beyond the documented contract.

## Surface treatments are a discriminated union (built: solid only)

Stored paint generalizes from `PaintAssignment { color, finishId }` to a `SurfaceTreatment`
discriminated union so a fill is not only a solid color:

```
type SurfaceTreatment =
  | { kind: 'solid'; color: Color; finishId: string }            // built
  | { kind: 'tiled-image'; assetRef: AssetRef; repeatMm; rotationDeg }  // typed, not built
  | { kind: 'pattern'; patternId: string; scale: number; colors: Color[] } // typed, not built
```

Only `solid` is constructed and edited in this slice; the other variants are typed so the store,
the schema, and `resolveSurfacePaint` admit them without reshaping. The `tiled-image` `assetRef`
is content-addressed per invariant 4. The store stays keyed by `surfaceKey`. `assignSurfacePaint`
keeps its ergonomic `(ref, color, finishId)` signature as sugar that builds a `solid` treatment,
so the pickers are unchanged; a general `assignSurfaceTreatment(ref, treatment)` is the underlying
command. A future `SurfaceTreatmentRegistry` (the ADR-0006 registry pattern) would register each
kind's editor, its `resolveSurfacePaint` projection, and its 3D material; that registry is a
documented seam, not built here.

### One schema migration

`add-surface-treatment` advances `CURRENT_SCHEMA_VERSION` from 8 to 9 and rewrites each
`Project.paint[key]` from `{ color, finishId }` to `{ kind: 'solid', color, finishId }`. It is a
structural pass that follows the ADR-0029 framework and the existing migration chain; older
documents load and upgrade unchanged.

## Subdividing a wall face is an address-level seam (designed)

To admit painting parts of a face separately, the `wall-face` variant of `SurfaceRef` gains an
optional `region`: `{ kind: 'wall-face'; wallId; side; region? }`. For period interiors the
natural subdivision is a horizontal band (wainscot, field, frieze), so `region` identifies such a
zone. `surfaceKey` serializes `region` into the key (`wall-face:wall_03:parlor:field`), so the
paint store, `resolveSurfacePaint`, and the commands are unchanged: a whole-face assignment is
`region` absent, and a subdivided face is several keys. This is the minimal, address-level seam,
matching ADR-0048's own seam style. The subdivision UI and the band geometry are deferred.

## Testing and the integration-acceptance gate

- **Journey (flip to required):** `edit-color` ("edits a surface color and it applies"). Driven
  through the wired app: open the editor, draw a wall, open the Paint panel, select a wall face,
  pick a color, and assert the assignment applied (the selected row's swatch / readout reflects
  the color, and the plan draws the wall-face band). Assertions go through accessible roles and
  names following the established journey-harness `support.ts` selectors.
- **Integration audit:** the DI audit asserts the Paint panel and the bound pickers are mounted
  in the assembled shell and reach `dispatch`, so a future regression to "mounted nowhere" fails
  the gate.
- **Unit (RGB):** the `SurfaceSelectionStore`, the `SurfaceTreatment` union and migration, the
  `surfaceKey` region serialization, the face-to-room labelling, the panel binding, and the plan
  paint rendering each land behind a failing-first test.

## Decomposition into red-green-blue cycles

1. `SurfaceTreatment` union in `core/model/paint.ts` (solid variant), `assignSurfaceTreatment`,
   and the `assignSurfacePaint` solid-sugar shim; `resolveSurfacePaint` returns the treatment.
2. The `add-surface-treatment` migration (v8 to v9) and its fixtures.
3. `surfaceKey` region serialization and the optional `region` on the wall-face `SurfaceRef`.
4. The `SurfaceSelectionStore` and `useSurfaceSelection` in `bridge/`.
5. Face-to-room labelling and the active-floor surface enumeration in `core/`/`editor/`.
6. The `PaintPanel` surface list and the picker binding, mounted into the two shell slots.
7. The entity-selection to surface-selection bridge (selecting a wall scopes the panel).
8. The 2D plan paint rendering (wall-face band, floor fill) and the selection highlight.
9. The `edit-color` journey and the integration-audit assertion; flip the coverage matrix.

Each cycle is test then implementation then a refactor marker, per the project's red-green-blue
discipline.

## Risks and open questions

- **Face labelling depends on room derivation.** A face's room is only known when the adjacent
  room is derived; the fallback labels keep the list stable and unambiguous when it is not.
- **List length on large floors.** Two rows per wall plus floor and ceiling can be long; the
  canvas-selection bridge keeps the common path (paint the wall I just clicked) short, and the
  list stays scoped to the active floor.
- **Superseding the ADR-0048 2D-overlay deferral** widens the slice beyond pure wiring; the
  rendering is pure-2D with no dependency on the render seam, and ADR-0056 records the change.
- **The migration touches just-shipped data.** Paint maps are rarely populated yet, so the v8 to
  v9 rewrite is low-risk; it is still covered by fixtures for an older painted document.

## References

- Makeover spec `docs/specs/2026-06-10-editor-experience-makeover.md` (slice 9).
- Design specification `docs/specs/2026-06-01-vernacular-design.md`, sections 6.8 and 7.4.
- ADR-0048 (color, palettes, surface paint, and site metadata): the foundation this wires and the
  deferrals this supersedes or keeps.
- ADR-0045 (3D render harness) and ADR-0044 (delivery tracks and selection sync): the render seam
  the 3D pick and highlight wait behind.
- ADR-0006 (registry pattern): the basis for the future `SurfaceTreatmentRegistry`.
- ADR-0029 (schema-migration framework): the basis for the v8 to v9 migration.
- ADR-0049 (integration-acceptance gate): the journey and audit this slice flips and extends.
