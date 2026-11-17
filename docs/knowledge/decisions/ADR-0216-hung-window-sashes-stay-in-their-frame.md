---
slug: decisions/ADR-0216-hung-window-sashes-stay-in-their-frame
title: 'ADR-0216: Hung-window sashes ride two tracks, and the lower sash rises inside its frame'
type: decision
tags: [core, engine, openings, windows, sash, walk-mode, animation, 3d-preview, reach]
related:
  [
    decisions/ADR-0128-opening-animation-motion-model,
    decisions/ADR-0081-three-dimensional-opening-fill,
    decisions/ADR-0198-open-doors-follow-the-scene-session,
    decisions/ADR-0152-linux-scene-baseline-lane,
  ]
sourceFiles:
  [
    core/scene/opening-fill.ts,
    core/scene/opening-motion.ts,
    core/scene/opening-reach.ts,
    engine/scene/opening-fill-builder.ts,
    engine/scene/opening-motion.ts,
  ]
status: current
updated: 2026-11-17
---

# ADR-0216: Hung-window sashes ride two tracks, and the lower sash rises inside its frame

## Status

Current. Lands with the fix for issue #792. This record extends
[[ADR-0128-opening-animation-motion-model]], whose part identifier it puts to use, and the hung-window
amendment of [[ADR-0081-three-dimensional-opening-fill]], whose fill it changes. It supersedes
nothing. Both records carry a dated note that points here.

## Context

A double-hung window opened in the 3D view (the E key in walk mode) slid up by the full height of
the opening and stood above the wall. The motion of the `window-hung` family was a vertical slide
with a travel of `opening.height`, and the engine applied that travel to the whole fill group. Every
part moved together: both sashes, the meeting rail, and both panes of glass. The default hung window
is 1200 mm high with a 900 mm sill, so its head is at 2100 mm. Fully open, the whole fill spanned
2100 mm to 3300 mm, which is 862 mm above the default ceiling height of 2438 mm. The single-hung
window, whose upper sash the registry marks fixed, did the same.

The reach test that lets the walker close an open opening moved the opening's rectangle by the same
travel. A fully open hung window therefore sat out of reach above the head. By the code, a walker
with the eye at 1700 mm could not close it by looking at it; this was not run.

The fill could not move one sash on its own. Its parts named no sash, and every box sat on the wall
centerline. Had only the lower sash risen, it would have shared its plane with the upper sash.

In a real hung window each sash runs in its own track in the frame. The lower sash rises past the
upper one, nothing leaves the frame, and the open area is at most about half the height. The spec
for walk-mode opening animations already named the lower sash as the one representative part of a
hung window (`docs/specs/2026-06-28-walk-mode-opening-animations.md`).

## Decision

### The fill names each part's sash and sets the two sashes on two tracks

`OpeningFillPart` gains two optional fields. `sash` is a `HungSash`, `'lower'` or `'upper'`.
`acrossOffset` is the distance in millimeters from the wall centerline to the center of the box,
along the opening's normal. Every part of a hung-window fill carries both. No other fill carries
either, so doors and undivided sashes keep their parts as they were.

The meeting rail belongs to the lower sash. The lower sash, with its head rail, bottom rail, two
stiles, glass, and the meeting rail, sits on the side that the opening's `facing` names: its offset is
`+depth / 2` for `'positive'` and `-depth / 2` for `'negative'`. The upper sash sits on the opposite
track, at the opposite offset. The single-hung window follows the same rule with its fixed upper sash
of a head rail, a bottom rail, and one pane.

`facing` stands in for the room side. The fill receives only the opening node and the registry, and
the node does not say which side of its wall is outside.

### The depth of the sashes follows the wall

The two sashes share the depth of the wall, so each takes at most half of it:

```
depth = min(SASH_FRAME_THICKNESS_MM, max(HUNG_SASH_MIN_DEPTH_MM, hostThickness / 2))
```

`SASH_FRAME_THICKNESS_MM` is 50 and `HUNG_SASH_MIN_DEPTH_MM` is 20. `hostThickness` is the
thickness the scene graph already derives for the host wall. Every bar of both sashes takes this
depth. Each pane of glass keeps `GLASS_THICKNESS_MM` (6) and sits on its own sash's track. Each track
is half a sash depth from the centerline.

A wall of 100 mm or more keeps the full 50 mm sash on tracks 25 mm either side of the centerline, as
before. A wall between 40 mm and 100 mm gives each sash half its thickness, so both sashes sit flush
with the wall faces. A wall under 40 mm keeps the 20 mm depth, and the pair stands proud of each face
by `(40 - hostThickness) / 2`. The 20 mm floor keeps each pane inside its own bars and the two panes
at least 14 mm apart. The lower sash spans `[0, depth]` across the wall and the upper sash
`[-depth, 0]`, so the two never overlap in depth at any thickness. The panes sit at `±depth / 2` and
every bar face at 0 or `±depth`, so no glass face shares a plane with another face. The two sashes
touch only at the centerline, where both faces lie between opaque bars.

`HUNG_SASH_TRACK_OFFSET_MM` (25) stays exported and names the offset in a wall of 100 mm or more. No
production code reads it now; the tests do.

### The lower sash rises by its own height, and never below zero

On open, a hung window raises its lower sash, meeting rail included, until the top of the meeting
rail meets the head:

```
rise = max(0, height / 2 - SASH_FRAME_WIDTH_MM / 2)
```

`SASH_FRAME_WIDTH_MM` is 60, the height of the meeting rail, which straddles the midpoint of the
opening. A 1200 mm window rises 570 mm, a 900 mm window 420 mm. The rise is a vertical slide with no
along-wall or across-wall part. The open area is the lower part of the opening, `height / 2 - 30`
high, a little under half the height.

The rise stops at zero. A window no taller than `SASH_FRAME_WIDTH_MM` has no room to open, and a
negative rise would move the sash down out of the frame at the sill. Such a window does not move.

The upper sash does not move, on either hung type. The walk-mode motion has one openness scalar per
opening, and per-part openness is out of the spec's scope. With one scalar, one sash moves, and the
spec chose the lower one.

### The part identifier names the sash that moves

`partId` on a motion is now typed `OpeningPartId`, which is `'primary'` or a `HungSash`. `'primary'`
keeps its old meaning: the whole fill moves, as for a door leaf, a pair of leaves, or an undivided
sash. A sash name means that only the parts stamped with that sash move. The hung motion is
`{ kind: 'slide', axis: 'vertical', travel: { x: 0, y: rise, z: 0 }, partId: 'lower', partCount: 1 }`
for both hung types. `partCount` is 1 because it counts the parts that move together.

This is the seam ADR-0128 left for multi-part motion. No new motion kind was added. A new kind would
have reached the switch in the engine applier, the switch in the reach test, and the registry test
that checks every opening type resolves to one of three kinds. A slide that names its part already
says everything the applier needs.

### The reach of a hung window stays on its frame

`openingUnderReach` keeps a hung window's shut rectangle at every openness. The rule is general: a
part that slides inside its frame leaves the opening where it is. `slidesInsideFrame` in
`core/scene/opening-reach.ts` tests it as a vertical slide. A slide along the wall carries its leaf
out of the opening, so the reach still follows that leaf.

The frame is the target because the frame is what the walker sees as the window. With the moved
rectangle, the open lower part of the window would be out of reach and the wall above the head
would be in reach.

### The engine builds each sash on its track and moves only that sash

`buildOpeningFill` centers each box across the wall on its part's `acrossOffset`, or on the
centerline when the part has none. It does not limit the offset; that limit belongs to the fill in
`core/`. Each mesh of a part with a `sash` carries it in `userData` under `OPENING_FILL_SASH_KEY`
(`'openingFillSash'`). `openingFillSashOf(object)` reads it back and returns `undefined` for any mesh
without a sash and for any stamp that is not `'lower'` or `'upper'`.

The fill spec said a double-hung pair needed no change to the builder
(`docs/specs/2026-06-14-three-dimensional-opening-fill.md`, the item on divided lites and muntins).
The two tracks made that change necessary. The spec's text about the undivided `window-sash` kind
stays true.

`applyOpeningMotion` handles a slide that names a sash in its own way. It rests the group at zero
translation and identity rotation, which is its built transform. It then moves each direct child mesh
of the named sash by `travel * openness` and sets every other child to zero translation. This relies
on how the builder lays a fill out: each part mesh is a direct child of the group, with its vertices
built in place and a mesh position of zero. A hinge, or a slide for `'primary'`, still moves the
whole group. At openness 0 every part sits exactly as built. Edge lines are children of their mesh,
so they move with it.

No schema change and no registry version change come with this. The fill parts and the motion are
derived scene data and are never stored.

## Alternatives considered

Both sashes move on a double-hung window, each by a quarter of the height. That would tell the two
hung types apart in the 3D view. Rejected: the window then opens at the top and at the bottom with
gaps at both, which reads less clearly as an open window, and the spec names the lower sash as the
representative part. Lowering the upper sash instead was rejected for the same reason.

A smaller offset alone in a thin wall, with the bars kept at 50 mm. Rejected: the two sashes would
pass through each other in every wall under 100 mm. At offsets of 11 mm and 14 mm, in walls of 72 mm
and 78 mm, a bar face of one sash and a glass face of the other would share a plane, which flickers
once the lower sash rises. A depth with no floor was also rejected: at a 6 mm sash the two panes meet
at the centerline in one plane, and below that the glass is deeper than its own bars.

Carrying the room side of each opening through the scene graph now. Pure `core/` can derive it:
`exteriorWalls` in `core/scene/exterior-walls.ts` returns the outward normal of a wall when exactly
one face lies in a room. Carrying it to the fill needs a new field on the opening node and a cache
that changes when rooms change. Today the deriver caches an opening node by the opening and its host
wall, and the live view reuses an opening's group while its node is unchanged, while rooms change
when other walls change. Rejected for this fix as too wide. `facing` decides the side until that
work lands.

A step across the wall during the motion only, with one plane when shut. That would have kept the
closed look of every hung window as it was. Rejected: the sash would move on a slant, which no real sash does.

The moved rectangle as the reach target, as ADR-0128 does for every slide. Rejected for the reasons
given above.

## Consequences

- A user who opens a hung window in the 3D view sees the lower sash rise inside the frame until its
  meeting rail meets the head. The upper sash stays put. Nothing appears above the head of the
  frame, and the open area is just under half the height.
- A closed hung window looks different too. Its two sashes sit on stepped planes: seen from the side
  `facing` names, the upper sash is set back behind the lower one by one sash depth. This holds for
  every hung window, opened or not.
- The walker can close an open hung window by looking anywhere in its frame, and not by looking at
  the wall above it. So the open key now closes a hung window from the pose that opened it. Doors
  are unchanged. Issue #817 asks what that key must do for a fully open opening.
- A later control for the upper sash of a double-hung window is a slide with `partId: 'upper'` and a
  negative travel. It needs no change to the applier.
- The closed look of a hung window changes to two stepped sashes. The step is too small to move a
  committed scene capture on macOS: after the change, the scene captures ran against the committed
  images with no update, and all 55 passed. Those captures let 5 percent of the pixels differ at a
  per-pixel threshold of 0.35 (`SHELL_THRESHOLD` and `SHELL_MAX_DIFF_PIXEL_RATIO` in
  `e2e/tests/scene-visual-regression.spec.ts` and `e2e/tests/scene-solar.spec.ts`,
  `LIVE_VIEW_THRESHOLD` and `LIVE_VIEW_MAX_DIFF_PIXEL_RATIO` in
  `e2e/tests/scene-live-view-visual-regression.spec.ts`). The Linux captures (ADR-0152) are checked
  by the CI job of the pull request.

## Evidence

The rules are proven by unit tests.

- `core/scene/opening-fill.test.ts`, block "openingFill hung-window sash tracks": a double-hung
  window names the sash of every part and sets the sashes on two tracks; a single-hung window splits
  into a lower sash of six parts and an upper sash of three; the tracks swap when the window faces
  the negative side; a door, a picture window, and a sliding window carry no sash and no track.
- `core/scene/opening-fill-thin-wall.test.ts`, block "openingFill hung-window sashes in a thin
  wall": the full depth and the 25 mm offsets in walls of 120 mm and 100 mm, 45 mm sashes in a
  90 mm wall, the 20 mm depth in a 40 mm wall and in a 1 mm wall (the thinnest the model accepts),
  the negative side, the single-hung window, and a door and a picture window left at their own
  thickness. For walls of 1, 39, 40, 41, 72, 78, 90, 99, 100, 101, 114, 120, and 300 mm it checks that
  the sashes do not overlap in depth and that no glass face lies on the plane of another face. For
  walls of 40 mm or more it checks that every part stays inside the wall faces.
- `core/scene/opening-motion.test.ts`, block "openingMotion windows": the double-hung rise by the
  height of the lower sash, the single-hung window resolving to the same motion, a rise of 420, 570,
  and 970 mm for windows 900, 1200, and 2000 mm high, no along-wall or across-wall part on a wall at
  an angle, and a rise of zero for windows 40 and 60 mm high (1 mm at 62 mm).
- `core/scene/opening-reach.test.ts`, block "a double-hung window": an open window is reached
  through the open lower part of its frame, not through the wall above its head, and the same look
  reaches it when it is shut.
- `engine/scene/opening-fill-builder.test.ts`: each double-hung mesh is stamped with its sash, the
  lower sash sits on the facing side and the upper sash on the other, the tracks swap with `facing`,
  and a door and a picture window carry no stamp and stay on the centerline.
- `engine/scene/opening-motion.test.ts`, block "applyOpeningMotionForNode on a %s", run for both hung
  types: fully open, the group's world box stays between the sill and the head, with its plan
  extents unchanged and the group itself unmoved; the lower sash opens no more than half the height;
  every part other than the lower sash stays where it was built; half open gives half the rise; and
  shutting again puts every mesh back exactly at its built box.
- `bridge/react/walk-interaction.test.ts`, the case "raises a window sash instead of swinging it when
  ticked open", now checks that a child of the group rose and the group did not turn.

A live check runs on a real WebGPU view, in one browser, on a development Mac and in the macOS
live-view job of CI. It is the case "keeps the sashes of an open hung window inside its frame, and
reaches it again with the open key" in `e2e/tests/journeys/close-doors-and-windows.spec.ts`, with
its steps in `e2e/tests/journeys/close-openings-window.ts`. It selects the shut window through the
list of 3D entities and takes the box of pixels its outline changes as the box of the frame. It
then opens the window with the E key and checks three things. The box of pixels the open window
changes lies inside the outline box, within a margin of 6 px (`OPENING_REGION_MARGIN`); the runs
measured it 1 to 3 px inside on each side. The region of the open window, read on each frame for
400 ms and once more after, does not change, so the sashes do not flicker. A second press of the
open key from the pose that opened the window closes it again.

## Limits

- `facing` stands in for the room side. It is a stored choice that defaults to `'positive'`, the
  wall's left-hand normal from its start to its end, and only the "Flip swing" button of the
  inspector changes it. On an exterior wall whose left side is outside, a window at the default
  shows its lower sash on the outer track. In a real window the lower sash is on the room side.
  Issue #827 is to put it there once the kernel gives the outside of a wall, with `facing`
  deciding only on a wall that has no outside. How often the default side is wrong depends on the
  direction walls are drawn, which was not traced. In the one room that the live check draws, a
  close view from inside the room showed the lower sash on the outer track. The label "Flip swing" does not say that it
  moves the sash.
- Only the lower sash moves, on the double-hung window as well. A real double-hung window can also
  lower its upper sash. The 3D view does not tell the two hung types apart by their motion.
- In a wall thinner than 40 mm the sashes stand proud of the wall faces, by up to 19.5 mm on each
  face in a 1 mm wall.
- Nobody saw coplanar sashes flicker. That they would was inferred from the geometry. The live check
  saw no flicker of the open window, in one view of one window in one browser.
- The margin of the live check, 6 px, is wider than the measured overhang. A run saw the check fail
  when the whole window rose by its full height: the overhang past the top of the outline was
  40 px. The check does not fail when the whole window rises by half its height, because the wall
  hides the parts that go above the head. The unit tests of the engine guard that only the lower
  sash moves.
- No committed image shows the stepped sashes at a size where a reader can see them.
- The engine moves a sash on the assumption that every part mesh is a direct child of the group at
  position zero. A nested child, or one built at another position, would break it. No test guards
  that layout from another builder.

## References

- Issue #792.
- [[ADR-0128-opening-animation-motion-model]]: the motion model and the part identifier this record
  uses.
- [[ADR-0081-three-dimensional-opening-fill]]: the fill parts and the hung-window fill kind.
- [[ADR-0198-open-doors-follow-the-scene-session]]: the tick, the restore, and the close control,
  which read the motion and did not change.
- [[ADR-0152-linux-scene-baseline-lane]]: the second family of scene baselines.
- Specs: `docs/specs/2026-06-28-walk-mode-opening-animations.md` and
  `docs/specs/2026-06-14-three-dimensional-opening-fill.md`.
