---
slug: decisions/ADR-0218-exterior-walls-follow-the-rooms-along-the-wall
title: 'ADR-0218: Exterior walls follow the rooms along the wall, one run at a time'
type: decision
tags:
  [
    core,
    engine,
    scene-graph,
    walls,
    rooms,
    openings,
    transparency,
    junctions,
    furniture,
    daylight,
    3d-preview,
  ]
related:
  [
    decisions/ADR-0086-near-wall-transparency,
    decisions/ADR-0087-opening-fade-with-host-wall,
    decisions/ADR-0103-junction-fill-fade-coordination,
    decisions/ADR-0140-conditional-junction-fill-fade,
    decisions/ADR-0145-furniture-fades-with-attached-exterior-wall,
    decisions/ADR-0193-sample-daylight-for-a-project-with-no-site-location,
    decisions/ADR-0216-hung-window-sashes-stay-in-their-frame,
    decisions/ADR-0199-derived-tolerances-exact-junctions-and-lengths-that-read-back,
  ]
sourceFiles:
  [
    core/scene/wall-room-sides.ts,
    core/scene/opening-room-side.ts,
    core/scene/exterior-walls.ts,
    core/scene/junction-fade.ts,
    core/scene/wall-attached-furniture.ts,
    core/scene/scene-graph.ts,
    core/scene/scene-graph-deriver.ts,
    core/index.ts,
    engine/scene/wall-span.ts,
    engine/scene/wall-builder.ts,
    engine/scene/near-wall-transparency.ts,
    engine/scene/near-wall-run-owner.ts,
    core/scene/wall-runs-test-fixtures.ts,
    core/scene/wall-room-sides.test.ts,
    core/scene/exterior-walls-runs.test.ts,
    core/scene/front-direction-partial-walls.test.ts,
    core/scene/opening-room-side-rooms-along-the-wall.test.ts,
    core/scene/opening-room-side.test.ts,
    core/scene/opening-room-side-faces.test.ts,
    core/scene/junction-fade-runs.test.ts,
    core/scene/wall-attached-furniture-runs.test.ts,
    engine/scene/wall-span.test.ts,
    engine/scene/near-wall-transparency-runs.test.ts,
    engine/scene/near-wall-transparency-run-owner.test.ts,
    engine/scene/near-wall-transparency-test-support.ts,
    core/geometry/tolerance.ts,
  ]
status: current
updated: 2026-11-23
---

# ADR-0218: Exterior walls follow the rooms along the wall, one run at a time

## Status

Current. Accepted on 2026-11-17 with the work on issue #832, in six test-first cycles. Their fix
commits are "fix: read the rooms along a wall from the room boundaries", "fix: read the room side
of an opening from the rooms along its wall", "fix: list the exterior runs of each wall from the
rooms along it", "fix: follow the exterior runs in the junction fade and the furniture pairing",
"fix: fade each exterior run of a wall on its own", and "fix: give each wall mesh one owner run in
the fade".

This record amends six others. [[ADR-0086-near-wall-transparency]] now fades an exterior run
instead of a whole wall. In [[ADR-0087-opening-fade-with-host-wall]], an opening fades with the run
that holds its center. [[ADR-0103-junction-fill-fade-coordination]] and
[[ADR-0140-conditional-junction-fill-fade]] pair a junction with runs, one incident edge at a
time. [[ADR-0145-furniture-fades-with-attached-exterior-wall]] pairs a piece of furniture with one
run. In [[ADR-0193-sample-daylight-for-a-project-with-no-site-location]], an exterior door is now
a door on an exterior run. Each of these carries a dated note that points here. The room side rule
of [[ADR-0216-hung-window-sashes-stay-in-their-frame]] is replaced by the rule below, and that
record now points here too.

The changes a user can see are listed under "What a user sees". They are part of this decision,
and the owner reviews them before the merge.

## Context

Two functions asked which side of a wall has a room, and both answered by testing points.

`exteriorWalls` in `core/scene/exterior-walls.ts` took one point past each face at the middle of
the wall, at half the thickness plus 1 mm, and tested both against the clear polygons of the rooms.
It did not look at holes or at the floor of a room. The wall was exterior when exactly one point
was in a room, and its outward normal pointed to the other face. Every opening on an exterior wall
was listed with it.

`openingRoomSide` in `core/scene/opening-room-side.ts` took the same kind of pair at the center of
an opening, at half the larger of the raw and the effective thickness plus 50 mm. It counted only
the rooms of the opening's floor, and a point inside a hole of a room did not count as in it.

Four parts of the program read `exteriorWalls`: the near-wall fade, the junction fade, the
furniture pairing (`withAttachedFurniture`), and the front of the building (`frontDirection`). The
front reaches the lighting through `daylightSiteFor`: with no stored location and no stored north
bearing, north is implied from the front.

### What the old rules did

Before any code changed, the functions on `main` were run on small plans in scratch tests, and
their answers were printed. A finding marked "a run showed" comes from those runs. A finding marked
"read" comes from reading the code. The plans are the floors that
`core/scene/wall-runs-test-fixtures.ts` now builds, all with 114 mm walls on one floor:

- `longNorthWallFloor`, the long north wall floor: a 4000 x 3000 room whose north wall runs on to
  x = 10000. It has a 1000 mm door in the long wall beside the room, an 800 mm door in the south
  wall, and a window in the long wall at x = 7000, past the room.
- `centeredPartitionFloor`, the centered partition floor: an 8000 x 4000 block split into two rooms
  by a partition at x = 4000 that tees into the middle of the south and north walls.
  `offCenterPartitionFloor` puts the partition at x = 3000.
- `centeredEllFloor`, the centered ell floor: a 10000 x 4000 main room with an ell from x = 3000 to
  x = 7000 below the middle of its long south wall.
- `flushEllFloor`, the flush ell floor: the same main room with an ell from x = 0 to x = 4000, flush
  with the west end of the long south wall, and a door in that wall between the main room and the
  ell.
- `courtyardFloor`, the courtyard floor: an outer ring of walls 10000 square around a free-standing
  ring 4000 square. The derived rooms are the outer room, with the courtyard as a hole, and the
  courtyard itself.
- `linkedShaftFloor`, the linked shaft floor: the courtyard floor with one partition that joins the
  outer south wall to the courtyard. The outer room then has no hole. Its polygon runs out along the
  partition and back.

On the long north wall floor, `exteriorWalls` listed the south, east, and west walls and not the
long wall (a run showed). So the long wall and its door never faded. A user who orbits to the north
sees a solid wall in front of the room while its other walls fade (a run showed the fade targets;
the effect on screen is read). The front came out plan-down, from the 800 mm south door, though the
wider door beside the room should make it plan-up (a run showed). For a project with no stored
location or bearing, the sample sun then stood 180 degrees from the intended way (read). Meanwhile
`openingRoomSide` gave the door beside the room a room side, so the two rules disagreed about that
door (a run showed).

On the centered partition floor, the middle of the south and north walls falls inside the
thickness of the partition, outside both clear polygons. `exteriorWalls` listed only the east and
west walls (a run showed). The long walls of a plain two-room house never faded, and a door in
either never counted for the front. With the partition off center, all four walls were listed (a
run showed).

On the centered ell floor, the middle of the long south wall has a room on both sides. The wall was
not listed, so its stretches from 0 to 3000 and from 7000 to 10000, which have open air to the
south, never faded (a run showed).

On the flush ell floor, the middle of the long wall has only the main room beside it. The wall was
listed whole, with the door into the ell (a run showed). Seen from the south, the whole wall faded,
the stretch between the main room and the ell included, with its door, so the two rooms ran
together (read). The tees at both ends of that stretch got conditional junction fills (a run
showed), though the stretch divides two rooms. ADR-0103 was written to prevent exactly that.

On the courtyard floor, `exteriorWalls` listed the four outer walls only. A point past the
courtyard face of an inner wall lies inside the courtyard room, so both faces of each inner wall
were in a room. `openingRoomSide` gave a door in a courtyard wall no side, for the same reason, so
its hole check never decided anything in a derived plan. A camera inside the courtyard counted as
inside the building, so nothing faded there (a run showed each of these).

On the linked shaft floor, the middle of the outer south wall falls in the thickness of the link,
so the street wall was not listed. The middle of the courtyard's south wall has the courtyard on
one side and the thickness of the link on the other, so that wall was listed, with its outward
normal pointing into the outer room (a run showed). A user saw the street wall stay solid and the
courtyard wall fade when the camera stood south of the house (read).

Two causes run through these cases. A point past a face can land in the thickness of a neighbor
wall. And one point at the middle cannot speak for a wall whose neighbors change along its length.

## Decision

### One rule reads the rooms along a wall from the room boundaries

A derived room's `polygon` runs along the centerlines of its walls, counter-clockwise, with a corner
at every graph vertex on its boundary, tees included. A run printed these polygons for the plans
above; the filter that keeps faces of positive area in `core/topology/rooms.ts` was read. A
free-standing inner ring of walls is a room of its own, and its polygon is also a hole of the room
around it. So the rooms along a wall can be read from the boundaries alone.

`roomSidesAt(place, rooms)` in `core/scene/wall-room-sides.ts` answers for one place on a wall: a
point on the centerline, a unit normal, and a floor id. A room lies along a side there when an edge
of one of its rings runs along the wall at that point. Both ends of the edge must lie within
`ROOM_RING_TOLERANCE_MM` of the line through the point, and the point must lie within that distance
of the edge. Edges shorter than the tolerance are ignored. The rings of a room are its `polygon`
and each of its `holes`, and the direction of a ring gives the side. For a polygon of positive
signed area the room lies to the left of each edge, and for negative area to the right. For a hole
the room lies on the other side, outside the hole. Only rooms whose `floorId` matches count. The
answer is `'positive'` (the side the normal points to), `'negative'`, `'both'`, or `'neither'`. No
point is tested against the inside of a polygon, and no thickness is read.

`ROOM_RING_TOLERANCE_MM` is `DEFAULT_JUNCTION_TOLERANCE_MM` of `core/topology/wall-graph.ts`, 1 mm,
the distance within which the wall graph merges wall ends. So every corner of a derived room counts
as on the walls it was traced from.

The rule reads the centerline `polygon`, not the `clearPolygon`. Issue #674 moved the
clear polygons to the faces of the construction profile, which does not bear on it.

`wallStretches(wall, rooms)` cuts a wall at every ring corner, of a room on its floor, that lies
within the tolerance of its centerline. Each piece takes the sides that `roomSidesAt` reads at its
middle, against the wall's left-hand normal. Neighbors with the same sides are joined, so the cut
at a tee with the same sides on both pieces disappears. The stretches cover the wall from 0 to its
length, in mm from its start. Cuts closer than the tolerance to each other or to an end count as
one, and a wall no longer than the tolerance has no stretches.

`distanceAlongWall`, in the same file, projects a point on the wall's direction from its start.
Three callers in `core/scene/` use it: `wallStretches` for the ring corners it cuts at,
`exteriorWalls` for the centers of openings, and `junctionFadeGroups` for the middles of incident
edges. `markWallSpan` in `engine/scene/wall-span.ts` measures differently, as the straight distance
of each edge end from the host wall's start. For a point on the wall's centerline the two give the
same number.

### `exteriorWalls` lists exterior runs

An exterior run is a stretch with a room along exactly one side. `exteriorWalls(walls, rooms,
openings)` returns one `ExteriorWall` for each run, in the order of the walls and then from each
wall's start. An entry carries `wallId`, `fromMm`, `toMm`, the `outwardNormal` that points away
from the room, and the `openingIds` of the openings whose center lies on the run. A wall can have
several runs, and two runs of one wall can face opposite ways. A wall with a room along one side
over its whole length has one run, from 0 to its length. An opening joins the first run whose
closed interval holds the distance of its center along the wall, so an opening centered on the
boundary of two runs joins the first.

The list is by run because the fade, the junction rule, and the furniture rule all concern the wall
between the camera and a room. A stretch with rooms on both sides is a partition there and must
stay solid, for the reason ADR-0103 gives. No single answer for the whole long wall of the flush
ell floor can be right.

### `openingRoomSide` reads the same rule at the opening

`openingRoomSide(node, rooms)` returns what `roomSidesAt` reads at the opening's center, against
the opening's normal, when that is `'positive'` or `'negative'`, and `undefined` otherwise.
`withRoomSide` sets the node's `roomSide` from it. The 50 mm clearance, the thickness, and the
point test past the face are gone, and so is the constant `OPENING_ROOM_SIDE_SAMPLE_MM`. The two
derivation paths, in `core/scene/scene-graph.ts` and `core/scene/scene-graph-deriver.ts`, no longer
pass a thickness.

Both functions keep their third parameter, unread, because `bridge/react/harness-fixtures.ts` and
its test still pass it, and this work did not touch `bridge/`. Each function marks the parameter
with a `void` statement and a comment that says why it stays, not with a lint directive. #856
tracks its removal.

Since the two functions share one rule, a derived opening has a room side exactly when its center
lies on an exterior run of its host wall, and the outward normal of that run points away from the
room side. Issue #832 asked for that agreement. It holds everywhere except exactly at the end of a
run (see the limits).

### The junction fade and the furniture pairing work by run

`junctionFadeGroups` keeps its signature. For each incident edge of a junction where three or more
walls meet, it finds the runs of the edge's wall that hold the middle of the edge. The group names
them in `exteriorRunIndexes`, as positions in the array that `exteriorWalls` returns for the same
inputs. `exteriorWallIds` holds the walls with a run on an incident edge. `fillHoldsUnconditionally`
is true when some incident edge lies on no run, since that stretch never fades. Membership is
therefore per incident edge. A wall that is exterior along one stretch and a partition along
another counts at a junction only when the incident edge lies on its exterior stretch.

`withAttachedFurniture` gives each piece to the first run, in `exterior` order, whose stretch of the
centerline it stands against. The test is the unchanged `furnitureAttachedToWall`, with the wall's
thickness. A piece against the stretch between two rooms joins no run, and a piece across the end
of a run joins that run and no other.

### Each run fades on its own, and each wall mesh has one owner run

`buildWalls` in `engine/scene/wall-builder.ts` builds one mesh for each graph edge. Each mesh now
records the stretch of its host wall that it was built for: `markWallSpan` in
`engine/scene/wall-span.ts` stores `{ fromMm, toMm }` under `userData.wallSpanMm`, and `wallSpanOf`
reads it back.

`prepareNearWallTransparency` in `engine/scene/near-wall-transparency.ts` builds one target for
each run. `ownedMeshesByRunIndex` in `engine/scene/near-wall-run-owner.ts` gives each wall mesh at
most one owner run. The owner is the first run of the mesh's wall, in `exterior` order, whose
stretch, widened by `ROOM_RING_TOLERANCE_MM` at each end, holds the middle of the mesh's recorded
span. A wall mesh with no recorded span belongs to the first run of its wall. A mesh whose span
middle lies in no run has no owner and stays solid. A run's target holds the meshes it owns, the
openings on the run, and the furniture paired with it. Its facing point is the center of the bounds
of its meshes. A run that owns no mesh gets no target. A conditional junction fill takes the
facings of the runs that its group names.

The stored format does not change. Runs, spans, and room sides are derived, and none is stored.

## What a user sees

These visible changes are part of the decision:

- The fade works by run, not by wall. A long wall fades only where it has open air on one side. The
  stretch between an ell or an addition and the main block stays solid, with its door and the
  furniture against it, and the junction fills at its ends hold. Ells and additions are common in
  the old houses this project serves.
- Walls that never faded now fade from outside: the long walls of a house split by a centered
  partition, the stretch beside the room of a wall that runs on past the end of the house, and the
  street wall of a linked shaft. The courtyard wall of a linked shaft, which faded wrongly, stops
  fading.
- The front of the building can change in an existing project, in either direction. A door that
  the old midpoint test missed now counts, and the front can turn to it. A door that the old test
  counted wrongly no longer counts, and the front can turn away from it. Such a door stands between
  two rooms on a wall the old test listed whole, or in the courtyard wall of a linked shaft. On the
  flush ell floor, the old test listed the whole long south wall, so the 900 mm door into the ell
  (`inner-door`) counted as an exterior door. Now that door lies on no run, as a committed test of
  `exteriorWalls` shows. With an 800 mm door added in the north wall, the front was plan-down
  before and is plan-up now. That result, and the same kind of turn on the linked shaft floor, came
  from a probe run in the branch review, which compared the old function from `main` with the new
  one. No committed test holds it. For a project with no stored location or north bearing, the
  sample sun turns with the front.
- An opening close to an inside corner or a tee now gets its room side where the old sample point
  past the wall face landed in the thickness of the neighbor wall. A hung window there moves its
  lower sash to the track on the room side, where before `facing` decided. The committed test
  covers a window centered 150 mm from an inside corner whose neighbor wall is 400 mm thick. A probe
  run in the branch review compared the old and the new room side for 6000 random openings in
  two-room plans: 271 changed from no side to a side, all near a corner or a tee, and none changed
  the other way. That count is in no committed test.
- Courtyards stay rooms. Their walls still never fade, and a camera inside a courtyard still counts
  as inside the building. #858 asks to let a courtyard count as open air. That needs a design and a
  schema step.

## Alternatives considered

Several samples along the wall, the first option of the issue. It would have changed only `core/`,
in about two cycles. It keeps the point test past the face, and with it the clearance constant, the
thickness question of issue #674, and the sample that lands in a neighbor's thickness, which is the
cause on the centered partition and linked shaft floors. The sample stations would have to avoid
tees, which needs the same corner scan this rule makes. And when the samples disagree, the wording
"exterior when any sample has a room on one side only" does not say which way is out.

The faces of the wall graph, a form of the second option of the issue. The face walk in
`core/topology/rooms.ts` knows the face on each side of each edge, but that knowledge stays inside
the room derivation. Holes are attached after the walk, so a courtyard wall would read "outer face"
on the side of the container. Using the faces needs new fields on `RoomSceneNode` and changes to
both derivation paths. The ring rule reads the same facts from the room nodes the scene already
has.

Keeping the midpoint and recording the limit, the third option. Rejected, because the findings show
visible defects in common plans, such as any two-room house with a centered partition.

One answer for each wall in place of runs. This was the smaller lane: the first three cycles only,
and no change to `engine/`. A wall would be exterior when it has a stretch with a room on one side
and all such stretches face one way. The long north wall and the long walls of the centered
partition floor would be listed, though the long north wall would then fade over its whole length,
the free stretch past the room included. On both ell floors the long south wall would be listed
whole, so the stretch between the ell and the main room would fade, with the door into the ell on
the flush ell floor, and the tees at the ends of that stretch would stay conditional. Moving to runs
later would redo the junction, furniture, and engine work. It was not taken, because the stretch
between two rooms is the very case ADR-0103 exists for.

A wall mesh with no recorded span in the target of every run of its wall. This was the first form
of the fifth cycle. A review found that one mesh could then sit in the targets of two runs. Both
targets wrote the same material in each frame, so the result depended on the order of the
targets. ADR-0145 met the same conflict for a corner piece of furniture and chose one owner for the
same reason.

## Evidence

The findings under "What the old rules did" came from scratch runs on `main` and from reading the
code, as each says. The scratch tests are not kept in the repository.

For the code after this work, the tests in the repository are the proof. On 2026-11-17 each file
was run on its own with `pnpm exec vitest run <path> --project unit`, and each passed:

- `core/scene/wall-room-sides.test.ts`, 15 tests. The stretches of each fixture floor: the long
  north wall cut at 4000, the long walls of the centered partition floor whole and the partition
  with rooms on both sides, the long wall of the centered ell floor in three stretches and that of
  the flush ell floor in two, the courtyard walls with rooms on both sides, and the street wall of
  the linked shaft with a room on one side. Also a clockwise room built by hand and the same wall
  reversed, a hole ring with no inner room, rooms of another floor, a dangling stub, a wall 1 mm off
  a room boundary against one 2 mm off, and a wall of no length. In the case of two room corners
  closer than the tolerance, the second room lies on the other side of the wall, and the wall gives
  two stretches that meet at one cut, with no stretch shorter than the tolerance.
- `core/scene/exterior-walls-runs.test.ts`, 18 tests. The runs of each floor with their ends,
  normals, and openings; no run for a courtyard wall or for the link; a wall along a hole, with its
  normal into the hole; rooms of another floor. On four floors, an opening has a room side exactly
  when a run holds it, and that run's normal faces away from the room side. An opening centered on
  the boundary of two runs joins the first.
- `core/scene/front-direction-partial-walls.test.ts`, 3 tests. On the long north wall floor the
  front faces the door beside the room, and faces plan-down once that door is taken away. On the
  centered partition floor it faces the north door.
- `core/scene/opening-room-side-rooms-along-the-wall.test.ts`, 5 tests. The courtyard door has no
  room side, and gets `'negative'` when only the outer room, with its hole, is passed. The answer is
  the same for every thickness passed and for none. The door beside the room on the long north wall
  has a side and the far window has none. A clockwise room built by hand still gives the right side.
- `core/scene/junction-fade-runs.test.ts`, 6 tests. Both junctions on the long wall of the flush ell
  floor hold opaque and name the runs of their incident edges, also with the long wall drawn the
  other way. The junction where the long north wall leaves its room holds and names its two runs. A
  tee with an interior leg names only the run of the through wall, and a corner of three exterior
  walls names all three and lets its fill follow the camera.
- `core/scene/wall-attached-furniture-runs.test.ts`, 3 tests, on the centered ell floor. A piece
  beside the first run joins that run alone, a piece between the main room and the ell joins none,
  and a piece across the end of the first run joins exactly that run.
- `engine/scene/wall-span.test.ts`, 2 tests. The two pieces of a wall split at a partition record
  their stretches, and an object that records none gives no span.
- `engine/scene/near-wall-transparency-runs.test.ts`, 4 tests, on built scenes with the fade
  applied. On the flush ell floor seen from the south, only the run past the ell fades and the door
  into the ell stays solid. On the centered ell floor both outer runs and the window fade and the
  middle stretch does not. On the long north wall floor seen from the north, the stretch beside the
  room and its door fade, and the far stretch and its window do not. The off-center partition floor
  has four wall targets and two junction fills.
- `engine/scene/near-wall-transparency-run-owner.test.ts`, 4 tests. A mesh with no span goes to the
  first run of its wall and to no other target. A mesh centered on the boundary of two runs goes to
  the first. A mesh in the gap between two runs goes to none, and one within the tolerance of a run
  end goes to that run. The flush ell floor still fades only its outer run with spans in place.

Two older files were edited. In `core/scene/opening-room-side-faces.test.ts` (6 tests) the window
150 mm from an inside corner beside a 400 mm neighbor wall now expects `'positive'`. In
`core/scene/opening-room-side.test.ts` (9 tests) the case on the long wall now checks that
`exteriorWalls` lists the stretch from 0 to 4000 with the window on it. The case of a sample inside
a hole is gone; the courtyard cases above replace it. Both files passed on the same date.

These files did not change in this work and passed on the same date:
`core/scene/exterior-walls.test.ts` (3 tests), `core/scene/junction-fade.test.ts` (3),
`core/scene/front-direction.test.ts` (19),
`core/scene/wall-attached-furniture.test.ts` (10), `engine/scene/near-wall-transparency.test.ts`
(13), `engine/scene/near-wall-transparency-conditional-fill.test.ts` (2),
`engine/scene/near-wall-transparency-furniture.test.ts` (2), `bridge/react/harness-fixtures.test.ts`
(23), and the rebuild gate `tests/performance/scene-rebuild-counts.test.ts` (9).

Nothing was run in a browser, and no fade was watched on screen. Which meshes fade is proved by the
engine tests on built scenes, as for ADR-0086, ADR-0103, and ADR-0140. No cost was measured.

### Why the scene captures should not move

The harness view does not mount the near-wall fade. Only `bridge/react/webgpu-scene-view.tsx`
mounts `NearWallFade`, so no harness capture shows a fade, and only the front and the room sides
reach its pixels. Each harness fixture has one stretch per wall over its whole length, with the
sides the old samples found. So its runs, its front, and the room sides of its openings stay as
they were. A prototype of the rule, run before the build, showed this. In the suite,
`core/scene/exterior-walls.test.ts` and `bridge/react/harness-fixtures.test.ts` pass unchanged. The
live-view capture draws one closed rectangular room from the top-down preset, and its exterior walls
do not change (read). The captures were not run for this work.

## Consequences and limits

- A room counts only where its `polygon` or a hole ring runs along the wall centerline, within
  1 mm. Derived rooms always do. A room with a stored custom polygon (`RoomOverride.customPolygon`)
  counts only where that polygon runs along a wall. No editor control writes such a polygon today,
  and the old samples had other blind spots for one.
- Courtyards are rooms, as described above, until #858 is decided.
- An opening whose center sits exactly on a room corner reads the sides of both ring edges that meet
  there. At the end of an exterior run that can give `'both'` and so no room side, while
  `exteriorWalls`, whose intervals are closed, still puts the opening on the run. A room corner on
  the host wall means another wall meets it there, so the opening would overlap that wall, which no
  valid plan has.
- The sides of a hand-built opening node are signed by its own `normal`. The agreement with
  `exteriorWalls` is stated for derived nodes, whose normal is the host wall's left-hand normal.
- A piece of wall shorter than twice the tolerance, right past the end of a room boundary, can read
  as along that boundary, because its middle lies within the tolerance of the boundary's end. No
  stretch is shorter than 1 mm.
- A wall mesh with no recorded span goes with the first run of its wall. `buildWalls` marks every
  mesh it builds, so only a mesh built some other way has none. A later run of that wall then owns
  no mesh and gets no target, so its openings do not fade.
- The third parameter of `openingRoomSide` and `withRoomSide` stays unread until #856 removes it.
- `exteriorWalls` runs twice for each floor in each enrollment: once in `enrollNearWallTargets` and
  once inside `junctionFadeGroups`. That predates this work. #857 asks to compute the runs once.
- `wallStretches` scans every ring corner on the floor for each wall. That cost, and the cost of the
  extra fade targets, was not measured.
- No test has a diagonal wall. One diagonal plan was tried in the scratch runs before the build.
  Corners merged within 1 mm on a long diagonal wall were not tried.

## References

- Issue #832: exterior wall detection sampled only the midpoint of a wall.
- #856: remove the unused wall thickness parameter once `bridge/` is free.
- #857: compute the exterior runs once for each floor in each enrollment.
- #858: let a courtyard count as open air.
- Issue #674: rooms now inset by the construction-profile thickness, which does not bear on the
  room side.
- [[ADR-0086-near-wall-transparency]]: the near-wall fade, which now fades runs.
- [[ADR-0087-opening-fade-with-host-wall]]: the opening fade, now with the run that holds the
  opening's center.
- [[ADR-0103-junction-fill-fade-coordination]] and [[ADR-0140-conditional-junction-fill-fade]]: the
  junction fill rules, now read per incident edge.
- [[ADR-0145-furniture-fades-with-attached-exterior-wall]]: the furniture pairing, now per run.
- [[ADR-0193-sample-daylight-for-a-project-with-no-site-location]]: the front direction.
- [[ADR-0216-hung-window-sashes-stay-in-their-frame]]: the room side that the hung-window fill
  reads.

## Update (2026-11-23): the room ring lives in the tolerance module

`ROOM_RING_TOLERANCE_MM` and the wall graph's merge distance, `DEFAULT_JUNCTION_TOLERANCE_MM`,
moved to `core/geometry/tolerance.ts`, the module that
[[ADR-0199-derived-tolerances-exact-junctions-and-lengths-that-read-back]] gives every geometric
tolerance. The ring is still 1 mm and still equals the merge distance. Only the file that the
Decision names is out of date: both constants are defined in the module now, not in
`core/topology/wall-graph.ts`. `core/scene/wall-room-sides.ts` imports the ring from the module,
`core/topology/wall-graph.ts` imports the merge distance, and `core/index.ts` still exports both.
Under ADR-0199, the ring changes to the 0.001 mm length tolerance in the later step that switches
the derivation. After that step, `ownedMeshesByRunIndex` widens each run by 0.001 mm at each end
instead of 1 mm.
