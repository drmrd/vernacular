---
slug: decisions/ADR-0223-trim-wall-features-and-ceiling-features-in-the-public-beta
title: 'ADR-0223: Trim is room-owned or hand-placed, and the beta builds wall bands and ceiling treatments'
type: decision
tags: [trim, wall-features, ceiling-features, rooms, finishes, 3d-preview, public-beta, scope]
related:
  [
    decisions/ADR-0036-room-metadata-overrides-and-labels,
    decisions/ADR-0056-surface-paint-selection-and-treatments,
    decisions/ADR-0062-three-dimensional-floor-slabs-and-ceilings,
    decisions/ADR-0130-finishes-system-architecture,
  ]
sourceFiles:
  [
    docs/specs/2026-06-01-vernacular-design.md,
    docs/specs/2026-06-29-finishes-system.md,
    core/model/types.ts,
    core/model/paint.ts,
    core/registries/trim-profiles.ts,
    core/scene/trim-profile.ts,
    engine/scene/room-builder.ts,
  ]
status: current
updated: 2026-11-20
---

# ADR-0223: Trim is room-owned or hand-placed, and the beta builds wall bands and ceiling treatments

## Status

Current. The project owner decided the model for trim, wall features, and ceiling features on
2026-11-20, on issues #364 and #380. No build work has started. This record amends the design
specification where it calls trim path-based (sections 3.1 and 3.2, and the Phase 4 deliverables)
and where it lists ceiling features. Each changed line cites this record.

## Context

Section 3.2 of the design specification says "Trim is path-based": a crown molding is a path along
walls or ceilings with a reference to a `TrimProfile`. Section 3.1 lists `trim[]` as such paths.

Here is what the code holds on `main` at the time of this record:

- `core/registries/trim-profiles.ts` holds nine trim profiles, and `core/scene/trim-profile.ts`
  gives the cross-section of each. No builder, drawing code, or tool uses them.
- The model stores no trim and no features. `Floor` in `core/model/types.ts` holds walls, openings,
  dimensions, furniture, and underlays. Only an opening attaches to a wall, through `hostWallId`.
- The 3D view builds one ceiling for each room (`engine/scene/room-builder.ts`). Paint addresses
  one ceiling for each floor (`core/model/paint.ts`).
- The finishes design expects a wainscot to take the lower band of a wall face, through the
  `region` of a `wall-face` surface (`docs/specs/2026-06-29-finishes-system.md`, "Interior wall
  finishes"; ADR-0130). No code uses that seam yet.
- A room already carries its period, style, and ceiling height as stored overrides (ADR-0036). A
  room loses that stored data today when one of its walls is split.

## Decision

### Trim is both room-owned and hand-placed in the beta

A room owns its usual runs. It sets one profile for each trim type, such as baseboard, crown
molding, picture rail, and chair rail. The runs follow the room's wall faces through wall edits, and
one wall face can differ from the rest of the room. Room-owned runs are new to the model.

The user can also place a run by hand along wall faces for a special case, such as a partial run
or trim outside a closed room. A hand-placed run keeps the path model of section 3.2: a path with a
reference to a `TrimProfile`.

So the beta has two ways to make trim and two tools. Room-owned trim needs room data that survives
a wall split, so it waits for the fix that keeps a room's stored data across the split.

### A wall feature is a band in the beta, and a rectangle joins it later

In the beta, a wall feature is a band between two heights. It follows the wall faces of a room, and
the user types its two heights. Wainscot is the first. Beadboard and full-height paneling use the
same band.

After the beta, the user can also place a wall feature as a rectangle on one wall face, with a
start, an end, and two heights, for a panel on part of a wall. The rectangle comes beside the band.
It does not replace it.

The band and the rectangle are two ways to make one kind of wall feature object in the data
model. The beta model has to take that shape now, so that a later rectangle produces the same kind
of object as the band.

The band matches the finishes design: the feature takes the lower region of the wall face, and the
region above it carries its own finish (ADR-0130).

### A ceiling has a room treatment and placed pieces, both in the beta

A room can carry one ceiling treatment that lays out beams or coffers by rule: a direction, a
count, a size, and an offset. The layout follows wall edits. The user can also add single pieces,
such as an odd beam. Section 2.4 of the design specification makes framing members a derived,
parametric layer, and beams and coffers repeat in the same way.

### The beta 3D view has all four builders

The beta draws baseboard, door and window casing, wainscot, and ceiling beams in 3D. Each is the
first item of one builder:

- Crown molding, picture rail, and chair rail reuse the baseboard builder.
- Beadboard and full-height paneling reuse the wainscot builder.
- A coffered ceiling reuses the beam builder.

### If the beta must shrink, all ceiling work waits together

In that case the room treatment, the placed pieces, and the beams all move after the beta. No part
of the ceiling work stays in the beta without the others.

## A finish on beams

Paint addresses one ceiling for each floor. That raises the question whether a finish on beams
needs a ceiling address for each room. The finishes specification answers most of this. Under "Open
question 1", a feature's own faces are surfaces that carry finishes, and a feature never replaces
a finish. So a beam takes its finish on its own faces, not through the ceiling address, and a
beamed room does not need a ceiling address of its own for its beams.

What the finishes specification does not give is the address of a feature's own face.
`SurfaceRef` in `core/model/paint.ts` has a wall face, a floor, and a ceiling, and no variant for a
surface of a feature. That address is still open (see below). Adding it changes the stored paint
model, so it needs a change to the finishes specification and a record of its own.

## The design specification after this record

- Section 3.1, `trim[]`: hand-placed runs are paths along wall faces with a profile reference, and
  room-owned runs come from the room.
- Section 3.1, `ceilingFeatures[]`: placed pieces such as medallions, single beams, and tin ceiling
  zones, beside a room's ceiling treatment laid out by rule.
- Section 3.2, "Trim is path-based" becomes "Trim is room-owned or path-based", with both kinds
  described.
- Phase 4, "Trim system": room-owned runs that follow wall edits, and hand-placed runs.
- Phase 4, "Ceiling features": a room ceiling treatment for beams and coffers, and placed pieces.

Section 3.1's `wallFeatures[]` line and the Phase 4 "Wall features" line still name built-ins,
columns, arches, half-walls, and alcoves. This record does not say whether the wall feature object
of the band lives in that list.

## Open points

These were not decided and stay open for the design round on #364:

- The repair rules for a hand-placed run when its wall is deleted or split.
- Which kind of trim wins when a room-owned run and a hand-placed run meet on one wall face.
- The rule for a placed ceiling piece that collides with the room treatment's layout.
- Where the wall feature object lives in the model, and whether it shares `wallFeatures[]` with
  arches and built-ins.
- Whether a ceiling medallion is in the beta. The placed pieces can include one, but none of the
  four builders draws it.
- Where casing is stored. Section 2.4 of the design specification calls casing path-based trim. The
  options the owner chose from assumed that casing belongs to its opening, and the casing builder
  gives each opening casing on both wall faces, but the storage was not decided.
- The address of a feature's own face for finishes, described above.

## Consequences

- For trim and for the ceiling, the beta takes the largest of the options it was offered: two ways
  to make trim with two tools, and a ceiling with both a rule layout and placed pieces. The wall
  feature model also has to be shaped for a second way to make it.
- Room-owned trim is blocked by the fix that keeps a room's stored data across a wall split.
- A crown molding under a sloped ceiling, a full-height band under a sloped ceiling, and a beam
  layout on a slope wait for the design rounds on roofs and sloped ceilings.
- The rectangle wall feature needs its own issue in the 1.0 milestone.

## Alternatives considered

For trim, the options were a room property alone and runs placed by hand alone. A room property
alone cannot draw a partial run or trim outside a closed room. Runs by hand alone need dozens of runs
for a house, and any of them can break when a wall is deleted or split.

For wall features, the options were a rectangle on one face, and a free outline drawn on a face. A
rectangle alone needs one feature for each wall face of a wainscoted room. A free outline needs an
elevation view, which Vernacular does not have, and an unrolled face for a curved wall.

For the ceiling, the options were one treatment for each room alone, and pieces placed one by one
alone. A treatment alone cannot mix two beam sizes or hold a beam at an angle. Placed pieces alone
make a coffered ceiling out of many pieces, and no piece follows a wall edit.

## References

- Design specification `docs/specs/2026-06-01-vernacular-design.md`, sections 2.4, 3.1, and 3.2,
  and section "Phase 4: Old-house shell".
- Finishes specification `docs/specs/2026-06-29-finishes-system.md`, "Interior wall finishes" and
  its "Open question 1".
- Issues #364 and #380.
- ADR-0130 (the finishes system and the wall face band), ADR-0056 (the `region` seam on a wall
  face), ADR-0036 (stored room overrides), and ADR-0062 (one ceiling for each room in 3D).
