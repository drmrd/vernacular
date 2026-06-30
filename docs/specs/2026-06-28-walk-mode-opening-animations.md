# Walk-mode opening animations by type

Date: 2026-06-28

## Problem

In walk mode, opening a door or window with the E key plays one motion for every opening: a
quarter-turn hinge swing. That reads right for a hinged door and wrong for everything else. A
double-hung window should raise its sash, a pocket door should slide into the wall, a casement
should crank out on its side hinge, an awning on its head, a hopper on its sill. The opening already carries its architectural type (`Opening.type`, an ElementType id),
and each type already records an operation family (`OpeningFamily`). What is missing is a mapping
from that family to a motion, and a renderer that plays the motion the family implies.

## Approach

Resolve a motion from the opening's type, in pure core, and play it in the engine.

A pure resolver, `openingMotion(type, opening)`, lives in `core/scene`. It reads the type's family
and a small amount of new per-type data and returns an `OpeningMotion`. The union has three kinds
today, hinge, slide, and none, with fold and pivot resolving to a hinge for now:

- **hinge:** rotate a leaf or sash about an edge. The edge is a jamb (vertical axis) for a swing
  door or a casement, the head for an awning, the sill for a hopper. A swing door takes its hinge
  jamb from the opening's `orientation`; a crank window takes its hinge edge from the type.
- **slide:** translate a leaf or sash. The axis is along the wall for a sliding door or a sliding
  window, and vertical for a hung window.
- **none:** a cased opening with no leaf, and a fixed window (picture, transom, sidelight, and the
  curved-head windows).
- **fold and pivot:** an accordion fold for a bifold door and a central-axis turn for a pivot door.
  Both resolve to a hinge until their own motions land, so the doors still read as opening.

Each kind carries world-space geometry, not abstract parameters: a hinge names its pivot, axis, and
signed open angle; a slide names its travel vector. The resolver bakes that geometry from the
opening's plan position and orientation, in core, using core's own `Vector3` interface so Three.js
never crosses the boundary. The engine plays the resolved motion through `applyOpeningMotion(group,
motion, openness)`, transforming the opening fill group with openness 0 shut and 1 open, the same
scalar the E-key interaction already drives. At openness 0 every motion is the identity, so a shut
opening renders exactly as it was built.

### Family refinement

The family field is the single source of truth. It already classifies an opening as a door or a
window (`core/registries/opening-kind.ts` derives door-or-window from the family), and it now also
resolves the motion. To keep both derivations correct, the window families split so each family
names one motion:

- `window-fixed` keeps only the truly fixed windows: picture, transom, sidelight, and the
  curved-head windows (arched, round-top, lancet). Motion **none**.
- `window-hung` is new: double-hung and single-hung. Motion **slide**, vertical axis.
- `window-slide` is new: the sliding window. Motion **slide**, along-wall axis.
- `window-crank` keeps casement, awning, and hopper, and gains a `hingeEdge` parameter: jamb for
  casement, head for awning, sill for hopper. Motion **hinge**, edge from the parameter.

The door families are unchanged: swing, slide, fold, pivot, and cased already name their motions.

The door-or-window split needs no edit. `openingKindOfType` classifies any family outside its door
set (swing, slide, fold, pivot, cased) as a window, so `window-hung` and `window-slide` read as
windows the moment they exist. The one rule the split depends on is that a window motion never
reuses a door family: a window family that landed in the door set would misclassify as a door, so
the new window motions take window-prefixed families of their own rather than borrowing the door
`slide`. The element-type registry version bumps from 5 to 6 for the family reassignments and the
new `hingeEdge` parameter.

### Staged delivery

The first implementation plays hinge, both slide axes, and the crank hinge edges, moving a single
representative part per opening: one leaf of a double door, the lower sash of a hung window. Fold
and pivot fall back to the hinge motion, so a bifold or pivot door still reads as opening rather
than staying shut or throwing. The motion API takes a part identifier from the start, and the
resolver reports how many parts a motion has, so a later pass can split the fill into named
sub-parts and move them all without changing the resolver's shape or the applier's signature.

A later pass adds the fold and pivot motions and multi-part motion: both leaves of a double or
french door, both sashes of a hung window, every panel of a bifold. It is tracked in its own issue.

### Interaction

The close-an-open-leaf reach fix (the companion walk-mode interaction issue) uses the same
resolver. To test whether the user is looking at an open leaf, it asks the motion where that leaf
sits at the current openness, rather than testing only the shut aperture plane. One resolver feeds
both the animation and the reach test, so they cannot disagree about where an open leaf is.

## Scope

In scope for the first implementation:

- A pure `openingMotion` resolver in `core/scene` returning a hinge, a slide, or none, each with
  world-space geometry, and folding pivot and fold openings into a hinge.
- The window family split (`window-hung`, `window-slide`) and the `window-crank` `hingeEdge`
  parameter, with the registry version bump to 6.
- `applyOpeningMotion` in the engine, replacing the swing-only path, moving a single representative
  part, with fold and pivot falling back to hinge.

## Deferred by design, tracked separately

- Fold and pivot motions, falling back to hinge until built.
- Multi-part motion: both leaves, both sashes, every bifold panel.
- Per-part openness. One scalar still drives the whole opening; independent leaf or sash control is
  out of scope.

## Verification

- Unit tests on `openingMotion`, one per family: a swing door resolves to a jamb hinge on its
  oriented side, a double-hung to a vertical slide, a sliding window to an along-wall slide, a
  casement to a jamb hinge, an awning to a head hinge, a hopper to a sill hinge, a pocket door to
  an along-wall slide, a picture window and a cased opening to none, and a bifold and a pivot door
  to the hinge fallback.
- A unit test that `openingKindOfType` still returns window for the hung and sliding windows and
  door for the sliding and pocket doors after the split.
- Engine tests on `applyOpeningMotion`: at openness 0 the fill renders as built; at openness 1 a
  hinge rotates about the resolved edge, a vertical slide raises the sash, an along-wall slide
  translates the leaf, each by the expected transform.
- A registry test that the version is 6 and that every opening type resolves to a defined motion.
