---
slug: decisions/ADR-0128-opening-animation-motion-model
title: 'ADR-0128: Opening animation motion model'
type: decision
tags:
  [
    core,
    engine,
    openings,
    doors,
    windows,
    element-types,
    registry,
    walk-mode,
    animation,
    3d-preview,
  ]
related:
  [
    decisions/ADR-0038-openings-doors-and-windows,
    decisions/ADR-0006-registry-pattern,
    decisions/ADR-0121-opening-type-conversion-resets-type-defining-dimensions,
  ]
sourceFiles:
  [
    core/registries/element-types.ts,
    core/registries/crank-window-element-types.ts,
    core/registries/opening-kind.ts,
    core/scene/opening-motion.ts,
    engine/scene/opening-motion.ts,
  ]
status: current
updated: 2026-06-28
---

# ADR-0128: Opening animation motion model

## Status

Accepted. The owner approved the design, and this record lands with the implementation.

## Context

Opening a door or window in walk mode used to play one motion for every opening, a quarter-turn
hinge swing. That suits a hinged door and misreads every other type:
a double-hung window should raise a sash, a pocket door should slide into the wall, a casement
should crank on its side hinge, an awning on its head, a hopper on its sill.

Each opening type already records an operation family (`OpeningFamily`) in `builtinElementTypes`,
and the family already carries a second meaning: `openingKindOfType` derives door-or-window from it
(ADR-0121). The families as recorded do not cleanly name a motion, though. The `window-fixed`
family lumps the operable double-hung and sliding windows together with the genuinely fixed picture
window, so a family alone cannot say whether or how a window moves.

## Decision

Resolve a motion from the opening's type with a pure function, and refine the families so the
family stays a single source of truth for both the door-or-window split and the motion.

### A pure motion resolver

`openingMotion(type, opening)` in `core/scene/opening-motion.ts` returns an `OpeningMotion`, a
discriminated union of three kinds: a hinge, a slide, or none. A swing door reads its hinge jamb
from the opening's `orientation`; a crank window reads its hinge edge from the type. Fold and pivot
openings resolve to a hinge for now, so the union grows two more kinds when their own motions land.
The engine plays the resolved motion through `applyOpeningMotion`, which keeps openness 0 as the
identity so a shut opening renders as built.

Each kind carries fully resolved world-space geometry rather than abstract parameters: a hinge names
its pivot point, rotation axis, and signed open angle; a slide names its travel vector. The resolver
bakes that geometry from the opening's plan position and orientation. This is the load-bearing
choice in the model. The engine applies a motion to an opening's fill group, which has no scene node
of its own to consult, and the close-an-open-leaf reach test asks a motion where its leaf sits at a
given openness. A descriptor that already holds world geometry answers both the applier and the
reach query from one source, so the animation and the reach test cannot drift apart. It also keeps
opening geometry in core: the engine stays a kind-agnostic player, and the descriptor uses core's
own plain `Vector3` interface, so Three.js never reaches across the boundary.

The trade-off is that a descriptor is specific to one opening at its current plan geometry. The
resolver is pure and cheap, so a motion is resolved on demand and never stored; editing an opening
yields a fresh descriptor on the next resolve. Keeping the resolver in core also lets every family
map be unit tested without a scene.

### Refine the families rather than add a parallel descriptor

The window families split so each names one motion: `window-fixed` keeps the fixed windows only;
`window-hung` (new) is the vertical-slide hung windows; `window-slide` (new) is the along-wall
sliding window; `window-crank` keeps casement, awning, and hopper and gains a `hingeEdge` parameter
(jamb, head, sill). The door families are already motion-coherent and are left as they are.

A parallel motion descriptor decoupled from the family was considered and rejected. The family
already means something (door or window), and a second field that also encodes motion would leave
two sources of truth to keep in step. Refining the family keeps one. The cost is a registry version
bump, 5 to 6, for the reassignments and the new parameter.

The door-or-window split needs no code change. `openingKindOfType` treats any family outside its
door set as a window, so the new window families classify correctly the moment they exist. The
split depends on one rule: a window motion never borrows a door family. A window family placed in
the door set would misclassify as a door, so the new window motions take window-prefixed families
of their own rather than reusing the door `slide`.

### Cover the common motions first

The first implementation plays hinge, both slide axes, and the crank hinge edges, moving a single
representative part per opening, with fold and pivot falling back to a hinge so those doors still
read as opening. The motion API carries a part identifier and the resolver reports a part count from
the start, so a later pass can add the fold and pivot motions and multi-part motion (both leaves,
both sashes, every bifold panel) without reshaping the resolver or the applier. That follow-up is
tracked outside this record.

## Consequences

- Each opening type animates the way the real thing moves, derived from data the type already
  carries plus one new parameter, with no per-type code branch at the call site.
- The family stays the one place that says both what an opening is and how it moves, so a new type
  needs only a correct family and, for a crank window, a hinge edge.
- The reach-to-close test and the animation share the resolver, so they cannot disagree about where
  an open leaf is.
- The version bump means a stored project on version 5 is read forward to 6; the reassigned
  families and the new parameter are additive to the on-disk type ids, which do not change.
- Fold, pivot, and multi-part motion stay a visible hinge approximation for now. The fallback is
  deliberate and tested, not a silent gap, and a later pass replaces it.

## References

- ADR-0038 (openings as typed wall-hosted entities, the source of the operation-family model).
- ADR-0006 (the registry pattern that holds the element types and their defaults).
- ADR-0121 (opening-type conversion, which also derives door-or-window from the family).
- Spec: `docs/specs/2026-06-28-walk-mode-opening-animations.md`.
