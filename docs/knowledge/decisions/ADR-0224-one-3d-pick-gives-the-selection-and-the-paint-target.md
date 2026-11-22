---
slug: decisions/ADR-0224-one-3d-pick-gives-the-selection-and-the-paint-target
title: 'ADR-0224: One 3D pick gives the selection and the paint target'
type: decision
tags: [3d-preview, picking, selection, paint, surface-selection, furniture, glass, junctions]
related:
  [
    decisions/ADR-0056-surface-paint-selection-and-treatments,
    decisions/ADR-0066-three-dimensional-selection-and-accessibility,
    decisions/ADR-0082-three-dimensional-wall-junction-fill,
    decisions/ADR-0086-near-wall-transparency,
    decisions/ADR-0087-opening-fade-with-host-wall,
    decisions/ADR-0094-furniture-massing-in-3d,
    decisions/ADR-0164-perceived-color-readout,
  ]
sourceFiles:
  [
    docs/specs/2026-06-13-three-dimensional-selection-and-accessibility.md,
    bridge/react/scene-selection.tsx,
    engine/scene/pick-scene.ts,
    engine/scene/faded-for-picking.ts,
    engine/scene/floor-subgroups.ts,
    engine/scene/opening-fill-builder.ts,
    engine/scene/room-builder.ts,
    engine/scene/ground-plane.ts,
    engine/materials/role-appearance.ts,
    editor/paint/use-entity-surface-bridge.ts,
    editor/paint/entity-surface.ts,
    editor/plan/room-finish-section.tsx,
  ]
status: current
updated: 2026-11-21
---

# ADR-0224: One 3D pick gives the selection and the paint target

## Status

Current and built. The project owner decided the four rules below on 2026-11-20, on issue #742,
and the build landed on 2026-11-21. This record settles the click on furniture, door parts, glass, and junction fills that
the 2026-11-15 amendment of ADR-0056 left undecided, and ADR-0056 now carries a dated note that
points here. Section 3 of `docs/specs/2026-06-13-three-dimensional-selection-and-accessibility.md`
carries a dated amendment that cites this record.

## Context

The paint target is the surface that paint commands apply to. A click in the 3D view makes two
picks along one ray (`bridge/react/scene-selection.tsx`). `pickEntityId` in
`engine/scene/pick-entity.ts` gives the selection, and `pickSurface` in
`engine/scene/pick-surface.ts` gives the paint target. Both skip a faded object, through
`isFadedForPicking` in `engine/scene/faded-for-picking.ts`. The color readout of ADR-0164 samples
the pixel under the pointer and names the paint target.

Because the two picks follow different rules, they can name different things:

- A wall face selects the wall, and the paint target is that face.
- A wall cap, a wall end, or the reveal of an opening selects the wall and leaves the paint target
  as it was.
- A floor selects the room, and the paint target is the floor.
- Furniture, a door leaf, a frame, or glass selects that object, and the paint target is the
  surface behind it.
- A junction fill selects the floor level, because the pick reads the entity id of the level group
  above it (`engine/scene/floor-subgroups.ts`). The paint target is the surface behind it.
- A ceiling seen from below, or the lawn, gives the surface behind it as the paint target.

Two older records already point one way. ADR-0082 says a junction fill carries no entity id, so a
click on it gives no selection. ADR-0094 says furniture is never a paint target. Opacity cannot
tell the cases apart: glass and the furniture placeholder both draw at an opacity of 0.3
(`engine/materials/role-appearance.ts`).

## Decision

### Every object that is not faded stops the click

A click stops at the first object along the ray that is not faded: a wall, a junction fill, an
opening and its parts, furniture, a ceiling, or the lawn. That one hit gives both the selection and
the paint target, so the two can no longer differ, and no click reaches a surface behind an object
that is not faded. A faded object still never stops a click (ADR-0056). An object that the cut of ADR-0222 hides, above the cut height or on a floor above the floor view, never stops a click, as a faded object does not.

This extends to every object the rule that the 2026-11-15 amendment of ADR-0056 set for walls, "a
wall decides at its first hit". A wall keeps that rule for its faces, caps, ends, and reveals.

A ceiling now gives its own surface as the paint target. The lawn carries no entity and no surface,
so a click on it gives neither.

### Furniture clears the paint target

A click on furniture selects the furniture and clears the paint target. The user paints a floor or
a wall by clicking a visible part of it. When furniture gets a finish of its own later, its mesh
can give that surface through the same hit, and no new rule is needed.

### Glass stops the click

Glass in a wall that is not faded stops the click. The click selects the window or door and gives
no paint target. Glass follows its wall: a click passes through it only when the wall is faded
(ADR-0087), and then it passes through the whole wall.

### A junction fill gives no target and no selection

A junction fill stops the click and gives neither a paint target nor a selection, as ADR-0082
intended. The click clears the selection, as a click on empty space does. The pick must stop
reading the level id from the group above the fill.

The visible sides of a junction fill stay unpainted. No work to paint them is planned.

### What the build changes

- One pick in `engine/scene/` replaces `pickEntityId` and `pickSurface`, and returns the selection
  and the paint target from the same hit. It is `pickScene` and `pickSceneAt` in
  `engine/scene/pick-scene.ts`.
- The editor clears the paint target when the selected object has no paintable face. The clear
  belongs in `editor/paint/use-entity-surface-bridge.ts`, which must learn that a room owns its
  floor and its ceiling. A door or a window has no paintable face, so a click on a door leaf, a
  frame, or glass clears the paint target too.
- Some pinned engine tests change. No scene baseline moves, because a click draws nothing.
- A line never takes the click. The edge overlay and the selection outline are drawing aids, so
  the pick skips every line hit and goes on to the mesh behind it. A click a millimetre from a wall
  edge still gets that wall's face, and a click on the edge line of a faded wall gets the surface
  behind the wall. Engine pick tests with the edge overlay on pin both cases. This settles #1070.

## Not decided here

- At what opacity a wall counts as faded once the fade becomes gradual. Issue #744 tracks the fade
  that depends on the camera's distance.

## Consequences

- The selection and the paint target always name the same object, so the interface never has to
  show a difference between them.
- The color readout never samples through glass or furniture for a paint target.
- A user cannot paint a surface by clicking through a window or past furniture. The user clicks
  that surface directly, or fades the wall in front of it.
- A click on a junction fill selects nothing. Before, it selected the floor level.

## Alternatives considered

For what stops the click, the options were walls, junction fills, door leaves, and frames, with
furniture and glass letting the click pass, and opaque materials only. The first lets the selection and the paint
target name different objects on furniture, and the color readout would need a second rule. The
second follows the drawing, not the object: the furniture placeholder is drawn as transparent as
glass, so a click would pass through the placeholder and stop at the loaded model.

For furniture, the options were to keep the last paint target, to keep today's surface behind,
and to make furniture a paint target now. Keeping the last target lets a color go to a surface that
is not selected. The surface behind is what today does, with the selection and the target apart. A
furniture surface needs a new kind of surface in the model and the file format, and a change to
ADR-0094, which is a feature of its own.

For glass, the options were to let the click through for both the selection and the paint target,
and to let it through for the paint target only, as today. Through for both means a window is
selected only at its frame, a thin mark from far away. Both options sample a color that is 30
percent glass.

For a junction fill, the options were to give each visible side the paint of the wall face it
continues, and to select the wall that runs through the junction. The first needs a rule for which
wall owns each side, new paint drawing, and moved scene baselines, while a planned kernel change
moves the junction fill geometry. The second gives no wall at a junction of three separate walls,
so a click would select something at some junctions and nothing at others.

## References

- Issue #742, and issue #744 (the fade by distance).
- `docs/specs/2026-06-13-three-dimensional-selection-and-accessibility.md`, section 3.
- ADR-0056 (the paint target and the 2026-11-15 rules for a wall and a faded object), ADR-0066
  (the 3D selection), ADR-0082 (the junction fill), ADR-0087 (an opening fades with its wall),
  ADR-0094 (furniture is not a paint target), and ADR-0164 (the color readout).
