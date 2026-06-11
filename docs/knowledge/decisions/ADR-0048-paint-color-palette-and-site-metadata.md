---
slug: decisions/ADR-0048-paint-color-palette-and-site-metadata
title: 'ADR-0048: Centralized OKLab color, the palette registry, a stable surface paint-assignment model, and site metadata'
type: decision
tags:
  [
    architecture,
    core,
    color,
    oklab,
    palette,
    registries,
    paint,
    surface-ref,
    site-metadata,
    commands,
    undo-redo,
    schema-migration,
    editor,
    three-dimensional-seam,
  ]
related:
  [
    decisions/ADR-0006-registry-pattern,
    decisions/ADR-0044-mvp-delivery-tracks-and-parallel-resequencing,
    decisions/ADR-0045-three-dimensional-render-harness-and-conventions,
    decisions/ADR-0036-room-metadata-overrides-and-labels,
    decisions/ADR-0029-schema-registry-migration-framework,
  ]
sourceFiles:
  [
    docs/specs/2026-06-01-vernacular-design.md,
    docs/plans/2026-06-10-paint-and-metadata.md,
    core/color/oklab.ts,
    core/color/hex.ts,
    core/color/color.ts,
    core/color/operations.ts,
    core/registries/palettes.ts,
    core/model/paint.ts,
    core/model/site.ts,
    core/model/types.ts,
    core/model/factories.ts,
    core/paint/resolve-surface-paint.ts,
    core/commands/handlers/palette-commands.ts,
    core/commands/handlers/paint-commands.ts,
    core/commands/handlers/site-commands.ts,
    core/migrations/schema/add-palettes-paint-and-site.ts,
    editor/paint/finish-picker.tsx,
    editor/paint/color-picker.tsx,
    editor/paint/color-name-search.ts,
    editor/metadata/site-editor.tsx,
  ]
status: current
updated: 2026-06-10
---

# ADR-0048: Color, palettes, surface paint, and site metadata

## Status

Accepted. The paint-and-metadata delivery track (`feat/paint-and-metadata`,
the last of the post-2D-editor tracks in ADR-0044) implements a pure-`core/`
color module, the palette registry and project-local palettes, a
surface-by-surface paint-assignment model, and a site-metadata model, plus the
editor pickers and site editor. This work implements the design specification as
written (sections 3.1, 6.8, and 7.4); it does not diverge from it.

## Context

The design specification requires OKLab as the canonical internal color
representation with sRGB hex for display and serialization (section 7.4), a
`PaintMaterial` that consumes a base color plus a `FinishRegistry` finish
(section 6.8), and project-local `palettes[]` plus an optional project `site`
(section 3.1). ADR-0006 listed a `PaletteRegistry` among the planned registries
without seeding it. ADR-0045 records that the three-dimensional renderer and its
paint material are harness stubs today, so the painted preview is a convergence
node gated on the three-dimensional preview track maturing (ADR-0044).

The hard constraint shaping the design: the scene graph models floors, walls,
rooms, openings, and dimensions, but it does NOT model wall faces, floor
surfaces, or ceilings as first-class nodes. A paint assignment therefore cannot
be keyed by a scene-graph node id.

## Decision

### Color science is centralized in `core/color/`, with a three-form Color value

The OKLab types and conversions, the sRGB hex parser and formatter, and the
perceptual operations (mix, perceptual distance, nearest-color lookup) live in
`core/color/`. OKLab is implemented from the published conversion matrices
through linear sRGB (no new dependency; the cooldown and exact-pin rules make a
color library costly). A stored color is one `Color` value carrying the three
spec-required forms: `oklab` (canonical, used for all math), `srgbHex` (display
and serialization), and an optional `originalSpec` free-text source identifier.
The triple cannot desynchronize because the only constructors are
`colorFromHex` and `colorFromOkLab`, each of which derives the other forms.
`NamedColor` (a required accessible name plus a `Color`) is defined once beside
`Color`, so `core/registries` and `core/model` both depend on `core/color` with
no cycle.

### Two homes for palettes: the bundled registry and project-local palettes

Per the specification, bundled palettes live in a read-only `PaletteRegistry`
(`core/registries/palettes.ts`, following ADR-0006 and the `createRegistry`
shape) and user-created palettes live on `Project.palettes[]`. The registry
seeds one bundled, openly licensed, descriptively named historic-interior
palette (no third-party or brand color names). A palette carries an optional
`periods?: PeriodId[]` hint so a later cycle can bias palette ordering by
chronological period (ADR-0046); it is purely advisory here. Project-local
palettes are created, renamed, described, and edited (add and remove colors,
remove palette) through undoable commands.

### A surface is addressed by a stable `SurfaceRef`, not a scene-graph node

Because the scene graph has no surface nodes, a paintable surface is addressed
by a small discriminated reference into the model:
`{ kind: 'wall-face'; wallId; side: 'left' | 'right' }`,
`{ kind: 'floor'; floorId }`, or `{ kind: 'ceiling'; floorId }`. A pure
`surfaceKey(ref)` produces the stable string the paint store is keyed by, so an
assignment survives scene-graph re-derivation and undo restores by reference.
This is the minimal addressing scheme that does not depend on the unbuilt
three-dimensional surface nodes. The contract: when the three-dimensional track
adds surface nodes, they carry this same `SurfaceRef`, so the painted preview
reads this exact store. A `PaintAssignment` pairs a `Color` with a
`FinishRegistry` finish id (defaulting to `matte`).

### Top-level optional slices, reassigned whole by undoable commands

`Project` gains three additive optional top-level fields: `palettes?`, a
`paint?` map keyed by `surfaceKey(ref)`, and `site?`. Each command reassigns its
whole slice so the inverse-capture proxy records the root-level change and undo
restores the prior reference, including back to absent (the pattern proven by
`roomOverrides` in ADR-0036). An emptied optional collection collapses back to
absent, matching the "absent means none" contract of each field. A pure
`resolveSurfacePaint(project, ref)` reads the effective assignment.

The site model (`Project.site`) is an optional `{ latLong?, northBearing?,
obstructions? }`, where an obstruction is a top-down massing footprint with a
height. It is a non-rendering placeholder authored only in the metadata surface
(the Phase-8 solar lighting provider that would consume it is out of scope).

### One schema migration

The three new fields are additive optional top-level fields, so
`add-palettes-paint-and-site` is a structural pass-through that advances
`CURRENT_SCHEMA_VERSION` (to 8 on the integration branch, after the structure
track's stair and underlay-source migrations); older documents load unchanged.

### Presentational editor components

The finish picker, the OKLab-aware color picker (palette browser, recent-colors
strip, fuzzy color-name search, every chip carrying its accessible color name),
and the site editor are React-only components in `editor/`. Each takes a
`dispatch` prop typed to the generic `Command` and emits the relevant `core/`
command; none owns the dispatcher or reaches into storage.

## Spec reconciliation

This work is ADDITIVE to the design specification. It implements sections 3.1,
6.8, and 7.4 as written rather than diverging from them, so no specification
prose is edited and no divergence is recorded. This ADR records the realized
shapes and, in particular, the `SurfaceRef` addressing scheme and the deferral
below, which the prose does not spell out.

## Deferred behind the three-dimensional render seam

- The live painted three-dimensional preview and the `PaintMaterial` shader's
  consumption of this model (ADR-0045): this track ships the model, the registry,
  the two-dimensional-side assignment, and the pickers; rendering painted
  surfaces in three dimensions waits and converges on the preview track.
- The `SolarLightingProvider` that would consume `site.latLong` and
  `site.obstructions`.
- A two-dimensional swatch overlay of paint on the plan canvas, a
  color-blindness simulation toggle, wide-gamut output, and installable palette
  packs.

## Consequences

- Color math is centralized and pure; all callers obtain a consistent `Color`
  triple and never construct an inconsistent one.
- Paint assignments are stable across re-derivation and undo, and are forward
  compatible with the future three-dimensional surface nodes through the shared
  `SurfaceRef`.
- The model, registry, and pickers are independent and testable in isolation;
  bridge wiring and the painted preview are downstream concerns.
- `core/model/types.ts`, `core/model/factories.ts`, the schema chain, and the
  `core/` and `editor/` barrels are merge-coordination points shared with the
  sibling tracks (see ADR-0044). All edits here are additive optional fields and
  append-only exports.

## References

- Design specification, sections 3.1 (project-local palettes and site), 6.8
  (materials and paint), and 7.4 (color science).
- Implementation plan: `docs/plans/2026-06-10-paint-and-metadata.md`.
- ADR-0006 (the registry pattern the palette registry extends).
- ADR-0044 (the delivery tracks and the painted-preview convergence node).
- ADR-0045 (the three-dimensional render harness this defers behind).
- ADR-0036 (the top-level optional-slice and undo pattern this mirrors).
- ADR-0029 (the schema-migration framework the version bump uses).
