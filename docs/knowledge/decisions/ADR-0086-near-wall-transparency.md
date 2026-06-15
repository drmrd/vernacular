---
slug: decisions/ADR-0086-near-wall-transparency
title: 'ADR-0086: Near-wall transparency in the three-dimensional preview'
type: decision
tags: [architecture, three-dimensional, transparency, walls, camera, preview]
related:
  [
    decisions/ADR-0061-three-dimensional-wall-shell,
    decisions/ADR-0067-three-dimensional-painted-preview,
    decisions/ADR-0078-three-dimensional-preview-surface-edges,
    decisions/ADR-0084-discoverable-camera-controls,
  ]
sourceFiles:
  [
    docs/specs/2026-06-15-near-wall-transparency.md,
    docs/plans/2026-06-15-near-wall-transparency.md,
    core/topology/exterior-walls.ts,
    engine/scene/near-wall-transparency.ts,
    bridge/react/webgpu-scene-view.tsx,
    e2e/tests/scene-near-wall-transparency.spec.ts,
  ]
status: current
updated: 2026-06-15
---

# ADR-0086: Near-wall transparency in the three-dimensional preview

## Status

Accepted. Issue #122, owner feedback that an opaque exterior wall blocks the interior
when the camera looks at the building from outside. It builds on the wall shell
([[ADR-0061-three-dimensional-wall-shell]]) and the painted preview's material seam
([[ADR-0067-painted-three-dimensional-preview]]).

## Context

The preview draws every wall solid. When the camera sits outside the building and
looks in, the near exterior wall fills the frame and hides the rooms. The owner wants
those near walls to fade to about ninety percent transparent so the interior is
visible from outside, and to return to solid as the camera moves to where they no
longer block the view.

Two questions sit underneath. Which walls should fade, and how does a per-wall,
camera-driven opacity reach the renderer when the neutral material provider caches one
material per surface role and shares it across every wall.

## Decision

Fade an exterior wall when the camera is on its outside, and drive the opacity per
frame from the live camera. Three small pieces.

The exterior decision is pure core. A wall has two faces offset from its centerline by
half its thickness along the wall normal. A face is outside when a point just past it
lies in no room and inside when that point lies in a room, tested against the room
clear polygons with the existing point-in-polygon helper. A wall with one outside face
and one inside face is exterior, and its outward normal is the outside face's
direction; a wall with a room on both sides is an interior partition and never fades.

The material handling is an engine pass. Because the provider shares one material per
role, an exterior wall cannot get its own opacity without its own material, so a
build-time pass clones each exterior wall mesh's materials into private instances and
records the wall's outward normal and a point on it, in world space, on the mesh.
Interior walls keep the shared materials.

The fade is a per-frame update from the camera. For each prepared wall it asks whether
the camera lies on the outward-normal side of the wall point; if so the wall stands
between the camera and the interior, so its private materials go transparent with depth
writing off, and otherwise they are solid. The test is horizontal, so the camera height
does not matter. The exterior decision and the camera-side decision are pure and unit
tested; the material pass is tested on a built scene; the per-frame wiring is rendering
glue covered end to end, and the deterministic harness applies the same update for its
fixed camera so the visible result has a committed baseline.

## Alternatives considered

- **Occlusion trigger.** Fade the walls that actually occlude the room the camera looks
  at, by ray-casting from the camera. It is more precise than the front-facing side
  test, but it needs per-room ray-casting every frame and a definition of which room is
  the subject. The side test is one dot product per exterior wall and matches the common
  case (the near facade) well, so it is the first cut; the occlusion trigger can replace
  it later if the side test proves too blunt.
- **Per-wall materials at build time for every wall.** Give every wall its own materials
  so any of them can animate. Rejected as wasteful: only exterior walls ever fade, so
  only they need private materials, and cloning them in a focused pass keeps the common
  interior walls on the shared, cached materials.
- **A smooth opacity ramp by angle or distance.** A gradual fade reads more softly than a
  binary solid-or-transparent switch, but it adds tuning with no clear target, so the
  binary fade at one fixed transparency ships first.

## Consequences

- The near exterior walls fade when the camera is outside them and return to solid from
  the other side, so the interior is visible from outside. This closes issue #122 for
  the front-facing case.
- The exterior decision and the camera-side decision are pure, unit-tested core, so the
  rule for which walls fade is verified without the renderer.
- Only exterior walls carry private materials; interior walls keep the shared materials,
  so the cost is bounded to the walls that can fade.
- The committed scene-shell harness baselines change to show the interior through the
  faded near walls, and are refreshed in this change.
- The front-facing trigger, the binary fade, opening-body fading, and a user toggle are
  deferred, recorded in the spec.
