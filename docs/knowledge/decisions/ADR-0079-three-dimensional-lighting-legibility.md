---
slug: decisions/ADR-0079-three-dimensional-lighting-legibility
title: 'ADR-0079: Rebalance the preview lighting for face legibility'
type: decision
tags: [architecture, three-dimensional, rendering, legibility, lighting, preview, engine]
related:
  [
    decisions/ADR-0065-three-dimensional-lighting-and-color-temperature,
    decisions/ADR-0078-three-dimensional-preview-surface-edges,
    decisions/ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier,
  ]
sourceFiles:
  [
    docs/specs/2026-06-14-three-dimensional-lighting-legibility.md,
    docs/plans/2026-06-14-three-dimensional-lighting-legibility.md,
    engine/lighting/basic-lighting-provider.ts,
  ]
status: current
updated: 2026-06-14
---

# ADR-0079: Rebalance the preview lighting for face legibility

## Status

Accepted. The second half of the legibility work the owner asked for on 2026-06-14:
a wall is hard to tell apart from an adjacent wall in the preview. The surface edges
([[ADR-0078-three-dimensional-preview-surface-edges]]) drew the lines where surfaces
meet and explicitly left the faces to the lighting. This rebalances the lighting rig
([[ADR-0065-three-dimensional-lighting-and-color-temperature]]) so the faces separate
by value.

## Context

Two perpendicular walls in the preview read as nearly the same value, so inside the
edge outline the shell looks flat. Two parts of the rig cause it.

First, the sun direction is `(1, 2, 1)`. Its horizontal components are equal, so its
azimuth bisects the two perpendicular exterior walls the three-quarter camera shows.
Both walls face the sun at the same angle and receive the same direct light, so no
sun intensity can separate them: they are lit equally by construction.

Second, the hemisphere fill and the directional sun both run at full intensity. A
strong even fill lifts the shadowed faces back up toward the lit ones, cancelling the
value difference a directional key would otherwise create.

Edges do not address this, by design: the two faces meet only at the corner the edge
already draws, and the flat part is the span on either side of that corner. Separating
those spans is a lighting job. ADR-0078 recorded a lighting and contrast tune as a
deferred follow-on for exactly this reason; this is that follow-on.

The decisions are how to separate faces by value while keeping the rig simple, the
exposure roughly where it is, and the color-temperature and shadow paths untouched.

## Decision

### Point the sun on an asymmetric, raised azimuth

The sun direction changes so its two horizontal components differ, which breaks the
symmetry that lit the two visible walls equally. With an asymmetric azimuth one wall
turns more toward the sun than its neighbor, so the two spans separate in value on
their own. The direction stays raised, with its vertical component the largest, so it
reads as a high daytime key: the floor and the tops of the walls stay well lit and the
shadow stays believable. The chosen direction is `(1, 2, 0.35)`, biased along one
horizontal axis and kept high; the exact bias was settled by eye against the baseline
shells.

### Make the rig key dominant

The hemisphere fill drops below the directional sun, so the sun sets the value of the
faces it reaches and the fill only keeps the unlit faces off black. The sun's
intensity rises enough to hold the lit faces at roughly their old brightness, so the
shell is no darker overall, only more clearly shaded. The fill stays a hemisphere, sky
above and dark ground below, so the floor still reads as grounded rather than lit from
nowhere. The chosen values are a sun at `1.6` and a fill at `0.5`, again settled by
eye.

These are constants on the existing rig, not a new light or a new seam. The rig is
still one directional sun and one hemisphere fill; only their direction and their
relative strength change.

### Leave the tint and shadow paths alone

The color temperature still tints both lights in linear light, so a warm or cool
setting reads as before over a shell that now has more shape. The shadow fitter reads
the same direction constant and so follows the new azimuth with no change. Nothing
outside the rig constants moves.

## Consequences

- Two walls facing different directions read as different values, so the shell reads
  as a solid form. Together with the edges, a corner is a crisp line and the spans on
  either side of it are different tones.
- The change is three constants on one engine class. It touches no model, file format,
  scene graph, geometry, paint, camera, edge, or two-dimensional code, and the live
  preview, the harness, and the color-temperature path all pick it up unchanged.
- The painted shell keeps its colors; the separation shows as a brightness difference
  within one hue, which is what the value-only legibility needs.
- Tone mapping, a richer multi-light rig, and a user-adjustable or solar-aware sun stay
  deferred follow-ons behind the same lighting seam.

## Alternatives considered

- **Add tone mapping and an exposure control.** Deferred, not chosen. The faces are
  flat because they are lit equally, not because they clip to white, so rolling off
  highlights does not separate them; the rebalance does. Tone mapping also changes how
  every color renders and interacts with the paint, so it is better decided with the
  paint work than folded into a legibility tune.
- **Raise the sun without touching the azimuth or the fill.** Rejected: the symmetric
  azimuth lights the two visible walls equally, so a brighter sun makes both brighter
  by the same amount and they stay merged.
- **Add a second fill or move to a three-point studio rig.** Rejected as too much for
  the problem: one sun and one hemisphere fill separate the faces once their direction
  and ratio are right, and more lights would flatten the result again.
- **Give the floor a distinct material to set it off.** Rejected here as it was for the
  edges: it fights the paint model and separates only floor from wall, not wall from
  wall.

## References

- Slice specification `docs/specs/2026-06-14-three-dimensional-lighting-legibility.md`.
- Implementation plan `docs/plans/2026-06-14-three-dimensional-lighting-legibility.md`.
- [[ADR-0065-three-dimensional-lighting-and-color-temperature]]: the lighting rig and
  the tint-in-light path this slice rebalances.
- [[ADR-0078-three-dimensional-preview-surface-edges]]: the surface edges this slice
  complements; the edges deferred this lighting tune.
- [[ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier]]: the wall shell
  and the neutral material the lighting falls on.
