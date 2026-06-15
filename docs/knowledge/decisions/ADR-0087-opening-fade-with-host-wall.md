---
slug: decisions/ADR-0087-opening-fade-with-host-wall
title: 'ADR-0087: Opening bodies fade with their host wall'
type: decision
tags: [architecture, three-dimensional, transparency, openings, walls, preview]
related:
  [
    decisions/ADR-0086-near-wall-transparency,
    decisions/ADR-0081-three-dimensional-opening-fill,
    decisions/ADR-0061-three-dimensional-wall-shell,
  ]
sourceFiles:
  [
    docs/specs/2026-06-15-opening-fade-with-host-wall.md,
    docs/plans/2026-06-15-opening-fade-with-host-wall.md,
    core/scene/exterior-walls.ts,
    engine/scene/near-wall-transparency.ts,
    bridge/react/framed-scene.ts,
  ]
status: current
updated: 2026-06-15
---

# ADR-0087: Opening bodies fade with their host wall

## Status

Accepted. The follow-up the near-wall-transparency decision
([[ADR-0086-near-wall-transparency]]) left open: fade the door and window bodies in a
faded wall along with it. It builds on the opening bodies
([[ADR-0081-three-dimensional-opening-fill]]) and the wall shell
([[ADR-0061-three-dimensional-wall-shell]]).

## Context

Near-wall transparency fades a near exterior wall when the camera looks at the
building from outside, so the rooms read through the facade. The opening bodies in
that wall do not fade with it. A door leaf, or a window's sash and glass, stays
solid in a wall that has gone transparent, so it hangs in the gap as a floating
object instead of an opening receding with its wall.

An opening already carries its host wall id, and the near-wall pass already decides
per frame whether a wall is faded. The question is how an opening's body picks up
its wall's fade, and how a body returns to its own look afterward when one of those
bodies, window glass, is translucent to begin with.

## Decision

Fade each opening on its host wall's decision, by folding the opening's body into the
wall's fade target, and restore every faded material to the look it started with.

Group the openings with their wall in pure core. The exterior-wall function already
returns each exterior wall and its outward normal; it now also takes the floor's
openings and returns, with each exterior wall, the ids of the openings hosted on it.
An opening on an interior partition, or one with no host wall, joins no exterior wall.

Fold the openings into the wall's target in the engine pass. The preparation pass
already clones each exterior wall mesh's materials into private instances so the wall
fades on its own; it now also clones each hosted opening body's materials and adds
them to the same target. One target then drives the wall and its openings from one
camera-side decision, so they fade and return in step.

Restore each material to its starting look, not to a fixed solid. The fade sets a
material transparent at low opacity with depth writing off, and the return must put it
back the way it was. A wall surface starts solid, but window glass starts translucent,
so a blanket restore to solid would turn the glass opaque whenever its wall is solid.
Each target therefore remembers the starting transparency, opacity, and depth-write of
every material it fades, and the per-frame update returns each to its own remembered
start. A solid wall surface returns to the same solid, so the wall-only behavior does
not change.

The grouping is pure and unit tested. The folding and the restore-to-start are engine
behavior tested on a built scene. The build seam that feeds the openings into the
grouping is unit tested. The per-frame fade is the rendering glue the near-wall slice
already wired, and it needs no change, because it drives whatever targets the
preparation pass returns.

## Alternatives considered

- **A separate per-opening fade decision.** Decide each opening's fade from its own
  position and the camera, rather than from its wall. Rejected because the opening sits
  inside the wall and a separate test would toggle a hair before or after the wall near
  the camera angle where the decision changes, so the opening and its wall could
  disagree for a frame. Riding the wall's one decision keeps them together.
- **Restore every faded material to fully solid.** Simpler than remembering a starting
  look, and correct for opaque walls. Rejected because window glass is translucent by
  design, so restoring it to solid would make the glass opaque whenever its wall was
  solid. Remembering each material's start handles the glass and leaves the wall case
  unchanged.
- **Give every opening private materials at build time.** Clone all opening bodies up
  front so any could fade. Rejected as wasteful for the same reason as the wall pass:
  only the openings on exterior walls ever fade, so only they need private materials.

## Consequences

- A door or window body fades with its host wall and returns with it, so an opening
  recedes with its wall instead of floating in the gap. This closes the opening-body
  follow-up the near-wall decision deferred.
- The grouping is pure, unit-tested core, so the rule for which openings fade is verified
  without the renderer.
- Restoring each material to its starting look lets a translucent body, such as window
  glass, return translucent, and leaves the opaque wall case as it was.
- Only the openings on exterior walls carry private materials; interior openings keep the
  shared, cached materials, so the cost stays bounded to what can fade.
- The committed pixel baseline of the effect stays deferred, carried over from the
  near-wall decision, because that baseline is per-platform and cannot be regenerated
  across targets in this pass. The live preview carries the effect, and the unit and
  engine tests cover the logic.
