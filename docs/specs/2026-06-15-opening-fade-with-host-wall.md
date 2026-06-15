# Opening bodies fade with their host wall

Date: 2026-06-15

## Problem

Near-wall transparency (issue #122) fades a near exterior wall to about ninety
percent transparent when the camera looks at the building from outside, so the
rooms read through the facade. The door and window bodies in that wall do not
fade with it. A door leaf or a window sash and its glass stay solid, so they hang
in the gap where the wall used to be, which reads as a floating object rather than
an opening receding with its wall. The near-wall spec left this as a follow-up.

This slice fades each opening body together with the wall that hosts it, and
brings it back to its own look when the wall returns to solid.

## Approach

An opening already knows its host wall: the opening node carries the host wall id.
The near-wall pass already decides, per frame, whether a wall is faded. So the
opening should ride the same decision as its wall rather than computing its own.
Tying the two together keeps them in step: the opening sits inside the wall, and a
separate per-opening test would flip a hair before or after the wall near the
camera angle where the decision changes.

Three changes, each small.

First, group each exterior wall's openings with it, in pure core. The exterior-wall
function already returns each exterior wall and its outward normal. It now also
takes the floor's openings and returns, with each exterior wall, the ids of the
openings whose host wall is that wall. An opening on an interior partition, or one
with no host wall, is not grouped with any exterior wall.

Second, fold the openings into the wall's fade target, in the engine pass. The
preparation pass already clones each exterior wall mesh's materials into private
instances so the wall's opacity moves on its own. It now also clones the materials
of each hosted opening's body and adds them to the same target as the wall. One
target then drives the wall and its openings from one decision, so they fade and
return together.

Third, restore each material to its own look, not to a fixed solid. The fade sets
a material transparent at low opacity with depth writing off; the return has to put
the material back the way it started. A wall surface starts solid, but a window's
glass starts translucent by design. Restoring every faded material to fully solid
would turn the glass opaque whenever its wall is solid, which is wrong. So each
target remembers the starting transparency, opacity, and depth-write of every
material it fades, and the per-frame update returns each material to its own
remembered start. For a solid wall surface this is the same solid it had before, so
nothing about the wall-only case changes.

The grouping is a pure function, unit tested. The material folding and the
restore-to-start are engine behavior, tested on a built scene. The wiring that feeds
the floor's openings into the grouping is the build seam, unit tested. The per-frame
fade stays the rendering glue the near-wall slice already wired; it needs no change,
because it drives whatever targets the preparation pass returns.

## Scope

In scope:

- The exterior-wall function also takes the floor's openings and returns, with each
  exterior wall, the ids of the openings it hosts.
- The preparation pass folds each hosted opening's body materials into its wall's
  fade target, cloned into private instances so they move with the wall and not with
  other walls' openings.
- The per-frame update restores each faded material to the transparency, opacity, and
  depth-write it started with, so a translucent material such as window glass comes
  back translucent.
- The build seam passes the floor's openings into the exterior-wall grouping.

## Deferred, by design

- **No committed pixel baseline of the effect,** carried over from the near-wall slice.
  Applying the fade in the deterministic render harness would change its per-platform
  wall-shell baselines, which have to be regenerated on each target. The live preview
  carries the effect now; a committed baseline waits for a pass that can regenerate the
  baselines across platforms.
- **The opening rides its wall's decision, not its own.** There is no per-opening fade
  test, so an opening fades exactly when its host wall does. An opening with no host wall
  is not faded.
- **The casing and trim around an opening,** which the opening body does not include, so
  there is nothing extra to fade here. Casing and trim are a separate, later body.
- **A smooth fade,** carried over from the near-wall slice: the opening switches solid or
  transparent with its wall, with no gradual ramp.

## Verification

- A unit test on the grouping: a rectangular room with a door in one wall returns that
  door's id with the wall that hosts it, and an opening on an interior partition is not
  grouped with any exterior wall.
- An engine test: after the preparation pass, fading the wall the camera faces from
  outside also fades its hosted opening's body, and the opposite wall and its opening
  stay solid.
- An engine test on the restore: a window's glass, translucent to begin with, returns to
  translucent after its wall fades and then comes back to solid, rather than turning
  opaque.
- A unit test on the build seam: building the framed scene of a room with an opening on an
  exterior wall folds that opening into the wall's fade target, so the per-frame fade
  reaches the opening.
