---
slug: decisions/ADR-0034-future-direction-extensibility-seams
title: 'ADR-0034: Future-direction extensibility seams (historic forms and building systems)'
type: decision
tags:
  [
    architecture,
    future-directions,
    extensibility,
    walls,
    openings,
    curved-geometry,
    penetrations,
    framing,
    building-systems,
    mep,
    hvac,
    sensors,
    historic-architecture,
    scene-graph,
    selection,
  ]
related:
  [
    decisions/ADR-0018-scene-graph-derivation,
    decisions/ADR-0026-room-derivation-planar-face-enumeration,
    decisions/ADR-0029-schema-registry-migration-framework,
    decisions/ADR-0006-registry-pattern,
    decisions/ADR-0021-2d-plan-rendering-interaction,
    decisions/ADR-0032-broad-then-narrow-hit-test-and-multi-select,
    decisions/ADR-0201-wall-path-accessor-and-the-arc-wall-made-by-bending,
  ]
sourceFiles: [docs/specs/2026-06-01-vernacular-design.md, core/geometry/wall-path.ts]
status: current
updated: 2026-11-23
---

# ADR-0034: Future-direction extensibility seams (historic forms and building systems)

## Status

Accepted, forward-looking. No feature code lands with this decision; it records
which future capabilities are deferred and which cheap seams must stay open so
those capabilities remain additive later. It justifies a design-specification
addendum (new section 2.4) per the project rule that any change to the
specification carries a corresponding ADR. The protective seams are implemented
in the slices and phases that own them (see Consequences), not here.

## Context

Planning the 2D plan editor surfaced a cluster of capabilities valuable to the
historic and old-house audience but out of MVP scope: turrets and bay windows
(footprint bump-outs), curved and non-rectangular openings, curved walls,
variable and sloped wall heights, building-systems (electrical, plumbing,
mechanical including HVAC, and structural) layers, penetrations of the envelope
and of structural members for those systems, structural framing (studs and
joists), and IoT sensor coverage. The question was whether to fold any into the
near-term slices now.

The deciding test is not whether each is valuable (all are) but whether adding it
later forces a pervasive retrofit. Vernacular already absorbs additive growth:
the schema-and-registry migration framework
([[ADR-0029-schema-registry-migration-framework]]) versions data-model growth,
scene-graph derivation ([[ADR-0018-scene-graph-derivation]]) lets new entity
kinds appear as additive projections both renderers and export pick up, and the
registry pattern ([[ADR-0006-registry-pattern]]) makes new element and system
types declarative data. What makes a late addition painful is a hardcoded
assumption spread across many consumers before the feature arrives.

## Already accommodated (not gaps)

Recorded so future work does not mistake these for missing architecture:

- **Non-rectangular and curved openings** (arched, half-round, ovular, bay and
  bow windows, casement variants). The building shell is typed at the element
  level (design spec section 3.2): an opening is an `Opening` record whose `type`
  points to the `ElementTypeRegistry`, with shape and parameters in the registry,
  so a half-round or ovular window is a registry addition, not a schema change
  (the full vocabulary is a Phase-4 milestone item). The only discipline this
  imposes is on slice 7: opening geometry derivation and rendering must read
  shape from the element type, never hardcode width-by-height rectangles.
- **Arches, columns, alcoves** are `wallFeatures[]`; **casing, aprons, stools**
  are path-based trim with a `TrimProfileRegistry` cross-section; **wall
  construction profiles** (plaster, lath-and-plaster, brick, stone) are a Phase-4
  item (this is why construction type was deferred out of slice 6).

## Decision

Defer all of the below as features. Bake only the cheap seams that keep them
additive, and keep the load-bearing assumptions from hardening:

1. **General wall attachment (turrets and bay windows).** When openings land
   (slice 7), model wall-hosted elements as a general host relationship (host
   wall, position along the wall, perpendicular offset), so a bay or turret that
   bumps the floor footprint reuses the same attachment; the footprint feeds room
   derivation ([[ADR-0026-room-derivation-planar-face-enumeration]]).
2. **Curved and non-straight walls (the one with real retrofit cost).** A wall is
   currently a straight segment, and the wall-graph topology, room derivation,
   hit-testing, and snapping all assume that. The seam is to treat a wall
   centerline as a path (segment today, arc or polyline later) and route new
   wall-geometry consumers through an accessor, accepting that the topology layer
   will need genuine extension when curved walls land. Recorded so the assumption
   is consciously managed, not silently deepened; this is not a free additive
   seam like the others.
3. **Variable and sloped wall heights.** When 3D derivation lands, model height
   as a per-wall property defaulting to the floor ceiling height, read through an
   accessor returning a height profile (not a scalar), so flat tops work
   immediately and sloped tops stay additive.
4. **Penetrations and geometry modifiers.** Walls, floors, and later structural
   members need holes where ducts, pipes, and conduit pass through them and the
   envelope, and notches and bores where runs pass through studs and joists.
   Structure the 3D mesh builders to apply additive geometry modifiers
   (penetrations now; niches and chases later) rather than hardcoding clean
   extruded solids, and let the affected elements carry their modifiers
   additively. Member-level notches and bores carry code-limit metadata (allowed
   depth and zones) for a future structural critic.
5. **Building systems (MEP), including HVAC.** Defer the whole domain, but keep a
   layer-and-discipline notion (architectural, electrical, plumbing, mechanical,
   structural, sensors) in the scene, selection, and visibility model so nothing
   hardcodes that the scene is architecture only
   ([[ADR-0032-broad-then-narrow-hit-test-and-multi-select]] is the future home
   of per-layer filtering). HVAC ducts are large-volume runs that additionally
   need chases, soffits, and dropped-ceiling zones (kin to wall and ceiling
   features) and the large penetrations of seam 4.
6. **Structural framing (studs and joists).** Model framing as a derived,
   parametric layer (generated from the wall or floor plus a framing spec of
   member size, spacing, and direction), the way rooms derive from the wall
   graph, rather than hand-placed geometry. The spec must be era- and
   registry-aware: true-dimension lumber, balloon versus platform framing, and
   the irregular historic spacing of real old houses. Its penetrations reuse seam 4.
7. **Sensor coverage (IoT).** A sensor is an element type with a 3D pose and
   parametric metadata (field of view, range); coverage is a visibility and
   occlusion computation built on the phase-8 lighting occlusion primitives, not
   bespoke machinery.

Hidden construction details (for example sash-weight pockets in historic
double-hung windows) are deferred as additive per-element metadata, at near-zero
retrofit risk, until a detailed section or renovation view needs them.

## Consequences

- Near-term slices stay honest to the seams: slice 7 (openings) keeps wall
  attachment general and derives opening shape from the element type; the
  3D-preview milestone reads wall height through a profile-capable accessor and
  applies geometry modifiers rather than hardcoding clean extrusions; the
  selection and visibility model is understood as the eventual home of a
  layer/discipline filter; the old-house architectural vocabulary milestone owns
  construction profiles and the historic-form opening vocabulary.
- Curved walls are flagged explicitly as the one item with genuine topology-layer
  retrofit cost rather than a free additive seam, so the team decides
  consciously rather than discovering it late.
- The design specification gains section 2.4 recording all of the above, beside
  2.2 (extension points designed in) and 2.3 (deliberately deferred).
- Nothing is built now, so there is no YAGNI cost; the only near-term artifact is
  the documentation that keeps the seams from being foreclosed by an unexamined
  assumption.
- Revisit at each owning milestone: openings (slice 7), 3D preview, the
  old-house architectural vocabulary milestone, and any future building-systems
  or structural phase.

## Note 2026-11-23: seam 2 exists

A wall's centerline now has a path value, `WallPath`, in
`core/geometry/wall-path.ts`. It has one kind today, a straight line
(`LinePath`), and `wallPath(wall)` builds one from a wall's two ends. The path
and copies of its two ends are frozen, so a later edit of the wall does not move
a path built before it. The module's functions give a path's ends, length, and
bounds, the point, tangent, and normal at a distance along it, the projection of
a point onto it, a sub-path, an offset to one side, a moved, turned, or reversed
copy, and a list of points that follows it. On a path of zero length, the
functions that need a direction (`pointAlong`, `tangentAlong`, `normalAlong`,
`projectOntoPath`, `subPath`, and `offsetPath`) give `NaN`. Nothing calls them
yet, and the first pull request with a caller adds the guard.

An architecture test, `tests/architecture/wall-ends-through-the-path.test.ts`,
keeps the rest of the code on that route. It reads the TypeScript program and
goes by type, not by name: a production file is flagged when it reads `start` or
`end` on a `Wall` or a `WallSceneNode`, by property access or by destructuring,
or when it passes a wall, or a list of walls, to a parameter whose type has its
own `start` or `end`. The test decides by where the property is declared, so a
read through a `Pick`, `Omit`, or `Partial` of a wall type, an interface that
extends one, or a type parameter bounded by one counts as well. The three kernel
folders (`core/geometry/`, `core/topology/`, and `core/migrations/`) are exempt,
and so is a call into them. A parameter typed as a wall does not count at the
call, because the read is flagged where it happens. Tests, stories, fixtures,
and generated code are not scanned.

The test does not see every way to reach an end. A wall copied with an object
spread, an end written through a computed key (as in
`core/commands/handlers/wall-commands.ts`), a wall assigned to a variable of a
structural type, a destructuring assignment, and an interface that extends a
wall type and declares `start` or `end` again all pass it. Those places need a
search by hand before the exception list counts as empty.

The files that still read wall ends are listed in
`tests/architecture/wall-end-read-exceptions.ts`. The list held 31 files when
the path landed. The test fails on a read in a file that is not listed, and also
on a listed file that has stopped reading wall ends, so the list matches the
code and shrinks as files move to the path. The first reader is
`buildFloorWallGraph` in `engine/scene/wall-scene-helpers.ts`, which builds a
floor's wall graph from `pathStart` and `pathEnd`. The list must be empty before
an arc wall reaches a user.
[[ADR-0201-wall-path-accessor-and-the-arc-wall-made-by-bending]] records the
decision to read walls through a path and the arc wall that follows from it.
