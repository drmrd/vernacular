---
slug: decisions/ADR-0200-half-edge-trial-result-and-the-inner-form-of-the-plan-geometry
title: 'ADR-0200: The result of the half-edge trial and the inner form of the plan geometry'
type: decision
tags: [architecture, core, geometry, topology, rooms, junctions, half-edge, kernel, evaluation]
related:
  [
    decisions/ADR-0097-evaluate-doubly-connected-edge-list-for-plan-geometry,
    decisions/ADR-0026-room-derivation-planar-face-enumeration,
    decisions/ADR-0058-donut-and-courtyard-rooms-via-hole-rings,
    decisions/ADR-0080-generalized-wall-junction-geometry,
    decisions/ADR-0082-three-dimensional-wall-junction-fill,
    decisions/ADR-0018-scene-graph-derivation,
    decisions/ADR-0218-exterior-walls-follow-the-rooms-along-the-wall,
    decisions/ADR-0199-derived-tolerances-exact-junctions-and-lengths-that-read-back,
    decisions/ADR-0201-wall-path-accessor-and-the-arc-wall-made-by-bending,
    decisions/ADR-0202-overlapping-walls-share-one-edge-and-drawing-over-a-wall-merges,
    decisions/ADR-0203-room-records-bind-to-rooms-by-wall-faces-and-an-anchor,
  ]
sourceFiles:
  [
    core/topology/rooms.ts,
    core/topology/wall-footprint.ts,
    core/topology/junction-fill.ts,
    core/topology/wall-graph.ts,
    core/topology/opening-edge.ts,
    core/scene/junction-fade.ts,
    core/scene/wall-room-sides.ts,
    editor/plan/opening-spans.ts,
    docs/specs/2026-11-18-geometric-kernel-and-first-arc-wall.md,
    docs/plans/2026-11-19-geometric-kernel-and-first-arc-wall.md,
  ]
status: current
updated: 2026-11-24
---

# ADR-0200: The result of the half-edge trial and the inner form of the plan geometry

## Status

Accepted on 2026-11-24: the owner took the fallback. The trial that [[ADR-0097-evaluate-doubly-connected-edge-list-for-plan-geometry]] asked
for has run on a branch that never merges. This record holds its result: the measurements, the
defects of today's walk that it found, the head commit of the branch, and the commands that rerun
its tests. It recommends the fallback design, which keeps today's wall graph and computes one
shared fan of edges per junction.

The decision was the owner's. The kernel specification
(`docs/specs/2026-11-18-geometric-kernel-and-first-arc-wall.md`, section 5.3, point 5) left the
rule for the decision to the owner as well. "The owner's decision" below records the choice and the
rule used. The pull request that builds the plan geometry (`feat/floor-plan-geometry`, #674 and
#687) can start once this record merges.

No code from the trial lands on `main`. The chosen design is written again, test first, in that
pull request.

## Context

The kernel specification gives each floor one derived plan geometry: the wall paths, the wall
graph, the footprints, the junction fills, the opening spans, the faces of each wall, and the
rooms. Every consumer reads it, and none builds a graph of its own. The specification leaves one
thing to this record, the inner form of that structure.

ADR-0097 put the question off until curved walls (#80) or courtyards (#78) were scheduled, and
asked for a time-boxed trial then: "port room derivation to an explicit DCEL face walk on a
throwaway branch and measure it against the current enumeration." Curved walls are now scheduled.
ADR-0097 set this bar: "a measurable drop in special-case post-passes (the hole containment pass
folding into faces, the two fan passes sharing one traversal) and a credible path to incremental
invalidation, without giving up the derived-not-serialized property. If the spike does not clear
that bar, the flat-array pipeline stays."

The specification compares three designs.

- Today's walk. `deriveRooms` in `core/topology/rooms.ts` builds half-edges, walks the faces, and
  throws the half-edges away. Holes come from a containment pass over pairs of rooms after the
  rooms are built (`assignHoles`, ADR-0058). The room walk, the footprints, and the fills each
  compute the fan of edges around every junction for themselves.
- The fallback. Today's graph of junctions and undirected edges, with one function that computes
  the fans once per build and hands them to the walk, the footprints, and the fills. Holes keep the
  containment pass.
- Explicit half-edges. A structure that keeps each half-edge with its origin, its twin, the next
  half-edge around its face, and its face. Each face holds its outer cycle and its inner cycles, so
  a hole is part of a face.

The specification also says what the trial cannot show. ADR-0097 saw most of the value of
half-edges in a structure that "persists across edits and updates incrementally". The plan
geometry is rebuilt on each build and is never changed in place, so the trial measures a structure
that is rebuilt every time. Two of the gains that ADR-0097 named no longer need half-edges: the
shared fan works on today's graph, and so does a build that is cut by connected component. Where
both designs reach the same result, a measurement does not choose between them.

## The trial

The trial lives on the branch `feat/half-edge-face-walk-trial`. Its head is commit
`df5c5efb13850348e037d1f7883a6d6e9bf8c2fc`, 53 commits after its base `d248d503b` on `main`. The
branch is pushed later so that reviewers can read it. It never merges, and it opens no pull
request. It is kept until the plan geometry pull request merges and is deleted then. It changes no
file outside `core/topology/`.

On that branch the trial built:

- `buildHalfEdgeStructure`, which turns today's `PlanarGraph` into frozen records: the half-edges,
  the faces with an outer cycle and a list of inner cycles, the fan of each junction, the connected
  components, and the edges it skipped;
- room derivation from that structure (`deriveRoomsFromHalfEdges`), which returns today's `Room`
  records;
- the shared fan (`junctionFansOf`), the footprints and fills that read it
  (`wallFootprintsFromFans`, `junctionFillsFromFans`), and an option on `deriveRooms` that makes
  the room walk read it too. Together these are the fallback;
- room derivation for one connected component (`deriveRoomsForComponent`);
- an observer that counts fan computations, containment tests, and passes over rooms in all three
  designs;
- parity tests, counting tests, and a generator of random plans.

It built no arcs, no rule for overlapping walls, and no room records, and it moved no consumer.

## Results

### The measurements

This is the table of section 5.3, point 4 of the specification, filled in. The labels M1 to M9 are
the specification's. The sections after the table give the detail behind each row.

| #   | Measurement                                                 | Half-edges                                                                                                                                                                              | The fallback                                                                                                                                          | Chooses between the two?                                             |
| --- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| M1  | The same rooms as today's `deriveRooms`                     | The same on 52 fixture floors, on 2,000 generated plans, and on 250 plans with wall ends close to the join distance. Two named plans are set aside as a defect of today's walk (#1146). | The same by definition, since it keeps today's walk.                                                                                                  | No. The gate is met.                                                 |
| M2  | The same footprints and fills from one fan                  | The same on every fixture floor.                                                                                                                                                        | The same on every fixture floor and on 200 generated plans.                                                                                           | No. The gate is met.                                                 |
| M3  | Fan computations per floor for rooms, footprints, and fills | One per junction: 18 on a floor of the reference project, against 72 today.                                                                                                             | One per junction: 18.                                                                                                                                 | No.                                                                  |
| M4  | Containment tests to find holes                             | Reference project: none. The 200 plans with holes: 560 component locations, which take 1,346 point-in-polygon tests.                                                                    | Reference project: 360 room-pair tests, which take 272 point-in-polygon tests. The 200 plans: 3,594 room-pair tests and 3,088 point-in-polygon tests. | Yes. Half-edges run fewer tests.                                     |
| M5  | A rebuild of part of a floor                                | Equal, record for record, in both cases. The trial's function builds the whole plan first.                                                                                              | Today's walk on one building's walls gives the same rooms. With a loop inside a room it needs the containment pass over all rooms.                    | No. Neither design shows a cheaper build of part of a floor.         |
| M6  | Derived and not stored                                      | All hold.                                                                                                                                                                               | All hold.                                                                                                                                             | No. The gate is met.                                                 |
| M7  | Production lines under `core/topology/`                     | 1,675 raw, 1,080 counted.                                                                                                                                                               | 1,350 raw, 818 counted. Today's walk has 1,218 raw and 720 counted.                                                                                   | Yes. Half-edges cost 325 raw lines more, 262 counted.                |
| M8  | Structural links for a consumer                             | A wall face to its rooms and a room to its holes are stored. An opening to its edge is not part of the structure.                                                                       | A function that exists today answers each of the three.                                                                                               | No. No consumer of this stage needs a link the fallback cannot give. |
| M9  | Time                                                        | Not run.                                                                                                                                                                                | Not run.                                                                                                                                              | The owner may schedule it.                                           |

### The counts on both inputs

The counting tests ran each design on two inputs. The reference project of `tests/performance/` has
four floors. Each floor is a grid of 5 by 2 rooms of 4000 by 5000 mm, with 27 walls, 18 junctions,
10 rooms, one connected component, and no holes. The second input is 200 generated plans from the
three families that hold free-standing loops, so every one of them has holes to find.

| Count                                | Design       | Reference project (4 floors) | 200 generated plans with holes |
| ------------------------------------ | ------------ | ---------------------------- | ------------------------------ |
| Fan computations                     | Today's walk | 288                          | 10,724                         |
|                                      | The fallback | 72                           | 2,681                          |
|                                      | Half-edges   | 72                           | 2,681                          |
| Containment tests                    | Today's walk | 360 room pairs               | 3,594 room pairs               |
|                                      | The fallback | 360 room pairs               | 3,594 room pairs               |
|                                      | Half-edges   | 0                            | 560 component locations        |
| Passes over rooms to find holes      | Today's walk | 4                            | 200                            |
|                                      | The fallback | 4                            | 200                            |
|                                      | Half-edges   | 0                            | 0                              |
| Point-in-polygon tests to find holes | Today's walk | 272                          | 3,088                          |
|                                      | The fallback | 272                          | 3,088                          |
|                                      | Half-edges   | 0                            | 1,346                          |

The containment counts are in different units. Today's walk and the fallback count room-pair
tests: one for each ordered pair of rooms that the hole pass compares, including a pair that the
shared-wall check ends early. The half-edge design counts component locations: one for each
connected component it places inside a face, and each location may scan several faces. A plan with
one component needs no location. The row of point-in-polygon tests puts all three designs in one
unit.

### The same rooms (M1)

The half-edge walk and today's `deriveRooms` return the same rooms in the same order: the same ids,
wall id lists, outlines, clear and outer outlines, areas, and holes. Corners agree within 1e-6 mm
and areas within 1e-6 mm².

The fixture floors number 52: ten floors from the scene fixtures, ten room fixtures written inline
in the tests, 28 floors from the stored project files under `tests/fixtures/projects/` (the minimal project, the
two-floor cottage, five corpus plans, and ten version fixtures of two floors each), and the four
floors of the reference project. Three of the 52 hold no walls.

The generated plans number 2,000, from seeds 1 to 2000. Eight families take turns with the seed,
so each has 250 plans: a partitioned grid, a free-standing loop, nested loops, separate buildings,
stubs and tees, crossing walls, covered walls, and loops in a partitioned grid. The walls are at
least 500 mm long and lie on a 50 mm grid within 20,000 mm. The generator shuffles the wall order,
reverses some walls, and turns and moves about half of the plans. No generated plan is on the
exception list.

A further 250 plans, outside the 2,000, put wall ends close to the join distance of 1 mm. Every
wall in them is longer than twice the join distance. Each plan has ends that merge without
coinciding, and ends that lie within six join distances of another end and do not merge. Both
walks give the same rooms on all 250.

The structure itself was checked on the 52 fixture floors. Twins pair up, every cycle closes, the
fans hold each half-edge once, the components cover the edges, and the faces cover the half-edges
on all 52. The Euler count (junctions minus edges plus faces equals one plus the number of
components) holds on 51. The plan for the trial expected it on every fixture floor, so this is a
deviation. The floor that fails is the corpus plan
`21-modern-cad-line-plan-30x35-parking-three-rooms`: 13 walls, 18 junctions, 26 edges, one
component, and 8 faces give a count of 0 where a planar map gives 2. One wall there lies over part
of another, so two edges join the same pair of junctions, and the graph is not a planar map. The
trial keeps today's order between two such edges so that the rooms stay the same. See "Defects of
today's walk".

Two named plans are on the exception list, both from #1146:

> On two named plans of issue 1146 both ends of one wall merge into one junction. Today's face walk
> gives both half-edges of that wall one successor, so one half-edge has no predecessor and the
> walk that starts there never returns to its start. The half-edge structure skips the edge,
> records it in `skippedEdges`, and gives today's rooms for the other walls. Issue 1146 reports the
> symptom as `RangeError: Invalid array length`. The tests at commits `7a5210b27` and `b0cc8c6dc`
> asserted that symptom and passed in most runs, but the walk must fill an array to the engine's
> largest length before it throws, and that did not always finish inside the runner's default
> per-test limit, so the head's tests check the cause instead.

Those plans also have two edges on one pair of junctions, so the structure built from them is not
a planar map either. The trial claims only that the rooms of the other walls match.

What the trial shows for short walls, by length:

- A wall at or below the join distance never reaches either walk. `buildWallGraph` drops it.
- A wall longer than the join distance and at most twice as long, whose two ends merge into one
  junction: today's walk cannot close a face (#1146). The half-edge walk skips the edge and gives
  today's rooms for the other walls. Two named plans show this, and no generated plan does.
- Any other wall between one and two join distances: the trial makes no claim.
- Walls longer than twice the join distance whose ends come within three join distances of other
  ends without coinciding, and walls of 3 to 20 mm: the same rooms in both walks on the 250 plans.
- Walls of at least 500 mm on the 50 mm grid, with about half of the plans then turned: the same
  rooms on the 2,000 plans.

One difference is known, and real walls cannot reach it. Where the face around a free-standing
component is at or under the minimum room area of 1 mm², the half-edge code drops the hole, and
today's walk would give it to the next room out. A component of real walls cannot fit inside such
a face.

### Footprints and fills from one fan (M2)

Footprints and fills computed from the shared fan equal today's on every fixture floor and on the
first 200 generated plans. Computed from the fans of the half-edge structure, they equal today's
on every fixture floor.

### Fan computations (M3)

Today the fan around each junction is computed four times per floor: once by the room walk, once
by the footprints, and twice by the fills, because `junctionFills` calls `wallFootprints`. On a
floor of the reference project that is 72 computations for 18 junctions. The fallback and the
half-edge design both compute it once, 18 per floor.

A fifth site stays as it is in every design. `junctionFadeGroups` computes the fan again at
`core/scene/junction-fade.ts:121`. The trial moves no consumer, and that file is identical at the
base and at the head of the branch. The specification has the fade read the shared fan once the
plan geometry exists, in both designs.

### Containment tests to find holes (M4)

This is the one measurement where the designs differ in what they compute.

Today's walk and the fallback build the rooms and then run one pass that compares ordered pairs of
rooms. The reference project has no holes and still pays for the pass: 90 pairs on each floor, 360
in all. The 200 plans with holes take 3,594 pairs.

The half-edge design locates each component once, inside the structure build, and the trial's
observer reports each location when room derivation reads the component from its face's inner
list. On the 200 plans its 560 counts locations against today's 3,594 room pairs. Counted in one
unit, point-in-polygon tests, the same plans take 1,346 in the half-edge build and none in its room
derivation, against 3,088 in the hole assignment of today's walk and of the fallback. On the
reference project the figures are 0 against 272.

"No pass over rooms" means no containment pass. The half-edge room derivation still loops over the
rooms once to attach holes, by lookup and with no geometric test.

The specification expected "one point-in-face test per free-standing component". The measured
design differs in two ways. It locates every component when a plan has two or more, including the
outermost ones, and each location takes several point tests.

### A rebuild of part of a floor (M5)

Both cases of the specification pass for half-edges. In a plan of two separate buildings of 4000
by 4000 mm, 10,000 mm apart, one wall of the first building moves by 500 mm, and the rooms of the
second building from `deriveRoomsForComponent` equal a fresh build. In a building of 8000 mm split
at 4000 mm with a free-standing loop of 1000 by 1000 mm inside one room, moving the east wall of
the loop by 200 mm changes the holes and the area of the room around it, and the other rooms keep
their records.

The fallback matches the first case: today's walk on the walls of the second building alone gives
the same rooms as on the whole plan. It does not match the second case by a cut alone. Today's walk
on one component's walls cannot see a hole that another component makes, so it still needs the
containment pass over all rooms.

Neither result is a cheaper build. `deriveRoomsForComponent` builds the graph and the structure of
the whole plan, derives every room and hole, and then keeps the faces of the component that was
asked for. It costs as much as a full build. The trial made no claim about cost, and a cheaper cut
would need four things that it did not build:

- the walls of one component without building the whole graph;
- a map from each other component to the face that holds it, kept or cheaply updated;
- the room polygons of each contained component in the order of the whole plan's faces;
- a component identity that does not depend on the order of the edges. The trial numbers components
  by the smallest edge index, which follows wall order.

So the half-edge design has the same limit as today's graph here, and M5 does not choose.

### Derived and not stored (M6)

The structure, its arrays, every half-edge and face record, and the inner list of each face are
frozen. A write in strict mode throws a `TypeError`. Two builds from the same walls are deeply
equal, and the build leaves the caller's graph unfrozen. `git diff d248d503b -- core/model schema`
prints nothing at the head of the branch, so no field was added to the model or the schema. The
fallback adds no state either.

### Production lines (M7)

Two measures are given: raw lines from `wc -l`, and counted lines as the ESLint `max-lines` rule
counts them, with blank and comment lines skipped. Only production files under `core/topology/` are
measured. Tests, the test-support files, the plan generator, and the lines that exist only for the
trial's observer (29 raw, 26 counted) are left out.

| Design                                                                      | Raw lines | Counted lines |
| --------------------------------------------------------------------------- | --------- | ------------- |
| Today's walk, seven files at the base commit                                | 1,218     | 720           |
| The fallback                                                                | 1,350     | 818           |
| Half-edges with today's walk still present                                  | 1,852     | 1,211         |
| Half-edges after a switch deletes ten functions of today's walk             | 1,693     | 1,097         |
| Half-edges with `outgoingFromFans` deleted too, the figure this record uses | 1,675     | 1,080         |

The fallback adds 132 raw lines to today's walk, 98 counted. The three half-edge files add 502 raw
lines, 393 counted: `half-edge-structure.ts` 210 and 165, `half-edge-faces.ts` 127 and 103, and
`half-edge-rooms.ts` 165 and 125.

A switch to half-edges deletes the face walk and the hole pass of today: `buildHalfEdges`,
`outgoingByVertex`, `enumerateFaces`, `traceFace`, `nextHalfEdge`, `facesByHalfEdge`,
`twinFaceIndexOf`, `isContainedBy`, `immediateContainer`, and `assignHoles`, 159 raw lines and 114
counted. It also deletes `outgoingFromFans`, the adapter that feeds the shared fan to today's walk,
18 raw lines and 17 counted. This record uses the figure after both deletions: 1,675 raw and 1,080
counted. That is 325 raw lines and 262 counted more than the fallback, about 24 and 32 percent,
and 457 raw and 360 counted more than today's walk.

Two things were not measured. A switch also changes the body of `deriveRooms`, `faceBoundary`, and
the types of the face walk, and those lines are counted as unchanged. About 14 lines that mix real
logic with an observer argument are counted as production lines.

### Structural links (M8)

The specification names three links and asks, for each, which consumer of this stage would read it
and how the fallback answers.

| Link                     | Consumer in this stage                                                                                                                                                                                                               | Half-edges                                                                                                                 | The fallback                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| An opening to its edge   | Opening spans clipped to each edge: `openingSpansAlong` in `editor/plan/opening-spans.ts` today, and the 3D walls once they read the plan geometry.                                                                                  | Not in the structure. The trial built no openings, and an opening is placed by its wall and its position in either design. | `resolveOpeningEdge` in `core/topology/opening-edge.ts`, by wall id and position. |
| A wall face to its rooms | `wallStretches` and `roomSidesAt` in `core/scene/wall-room-sides.ts`, for exterior walls, the junction fade, and the room side of an opening (ADR-0218). Room records that bind by wall faces (ADR-0203, specification section 5.6). | Stored: each half-edge holds its wall id and its face.                                                                     | The face walk's `twinFaceIndices` in `core/topology/rooms.ts`.                    |
| A room to its holes      | Room nodes.                                                                                                                                                                                                                          | Stored: the inner cycles of the face.                                                                                      | `Room.holes`, from `assignHoles`.                                                 |

No consumer of this stage needs a link that the fallback cannot give. The plan geometry hands
every consumer the same records in both designs, as section 5.3, point 6 of the specification
lists them. On a floor with overlapping walls the link from a wall face to its rooms gives today's
wrong answer in both designs until the pull request for overlapping walls (#681) does the noding.

### Time (M9)

No timing run took place, and this record holds no timing figure. The specification leaves the run
to the owner: each design against today's walk on the reference project and on a generated plan of
1,000 walls, under the owner's conditions. The owner chose not to schedule it, so the decision stands on the
counts alone.

## Defects of today's walk

The trial found two defects of today's walk and a third fault beside them, in the list that the
shared fan is built from. None of the three is a difference in rooms between the two designs.

1. A wall whose two ends merge into one junction (#1146). A wall longer than the join distance and
   at most twice as long can have both ends merge into the same junction. The graph then holds an
   edge from a junction to itself, today's successor map is no longer one to one, and the face walk
   cannot close a face. The symptom is `RangeError: Invalid array length`. Two named plans show it:
   the ten walls of the issue, and a room of 4000 by 3000 mm with a wall from (-0.6, 0) to (0.6, 0)
   at its corner. The issue already carries a comment with this cause.
2. A wall that lies over part of another merges the rooms beside it (#681, a symptom the issue does
   not list yet). On the corpus plan `21-modern-cad-line-plan-30x35-parking-three-rooms` the wall
   `w-r3-hall-right` lies inside `w-hall-left`, and two edges join the same junctions. Both walks
   return 7 rooms where the plan has 8 without the covered wall. The half-edge walk reproduces the
   result because it keeps today's order between the two edges.
3. An edge from a junction to itself is listed twice in that junction's edges (no issue yet).
   `vertexIncidence` in `core/topology/wall-footprint.ts` adds an edge once for each of its ends,
   so such an edge appears twice at its one junction. Today's footprints and fills read that list.
   The shared fan is built from it too, and the trial's adapter for the room walk then names one
   half-edge of that edge twice and loses the other, where today's room walk holds both. Today's
   walk already fails on such a plan (#1146), so the parity tests cannot show the gap. The same
   merged wall causes it, and the fallback has to settle it in the plan geometry pull request.

One note for the plan geometry pull request is not a defect. `junctionFansOf` sorts by the angle of
the unit direction, and today's room walk sorts by the angle of the raw direction. For two
overlapping edges on one line the two could break an exact tie differently (#681). The parity
tests found no case.

## Limits of the evidence

- Both walks read the same `buildWallGraph`. The trial says nothing about whether the merge of
  nearby ends joins the right ends. That belongs to the property tests and to the work on exact
  junctions.
- The half-edge structure is a planar map only when no two edges share a pair of junctions and no
  edge joins a junction to itself. Both happen on today's graphs. The fallback has the same limit,
  and the pull request for overlapping walls removes it for both.
- A probe that was never committed reversed the order between two edges on one pair of junctions.
  It restored the Euler count on the corpus plan and broke the parity of rooms and footprints
  there. The fallback could take the same order, so the probe says nothing for either design, and
  the rerun does not cover it.
- A mutation run partway through the trial covered the three half-edge files. Of the mutants that
  it left alive or uncovered, later tests killed seven, and twelve were accepted. Eight change only
  the text of an error message or a label. Four change logic: an equal-area tie when the boundary cycle of a component is
  chosen, two forms of the area check in the search for the containing face, and the order between
  two half-edges of the same direction. The per-commit checks accepted three more label strings,
  one in the error of `outgoingFromFans` and two in `deriveRoomsForComponent`. The run was not
  repeated at the head.
- The counts say how many tests each design runs. They say nothing about how long a build takes.

## How to rerun

The tests were rerun on 2026-11-24 on a clean checkout of the head commit
`df5c5efb13850348e037d1f7883a6d6e9bf8c2fc`. CI does not run on the branch, so a reviewer runs them
locally.

| Command                                                                                                              | Exit code | Result                                                  |
| -------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------- |
| `pnpm exec vitest run core/topology --project unit`                                                                  | 0         | 21 test files and 127 tests passed.                     |
| `pnpm exec vitest run core/topology/half-edge-trial-counts.test.ts --project unit --silent=false --reporter=verbose` | 0         | Passed. Prints the totals line below.                   |
| `git diff d248d503b -- core/model schema`                                                                            | 0         | Prints nothing: the model and the schema are unchanged. |
| `git diff d248d503b -- core/scene/junction-fade.ts`                                                                  | 0         | Prints nothing: the fifth fan site is unchanged.        |

The two `pnpm` commands run from the root of the checkout. The recorded run passed the checkout's
path to `pnpm` with `-C`, and the path is left out here. The totals line of the second command:

```text
Trial totals {"plans":200,"today":{"fanTotal":10724,"containmentTotal":3594,"passes":200},"fallback":{"fanTotal":2681,"containmentTotal":3594,"passes":200},"halfEdges":{"fanTotal":2681,"containmentTotal":560,"passes":0}}
```

## Recommendation

Take the fallback: today's graph, one shared fan per junction, and the containment pass for holes,
run once per build inside the plan geometry.

The working rule of the specification adopts half-edges only if they do better than the fallback
on M4 or M5, or give a link of M8 that a consumer of this stage needs, and the owner judges that
gain worth the difference in M7. Read against that rule:

- M4 favors half-edges. They run no containment test on the reference project against 360 room
  pairs, and 1,346 point-in-polygon tests on the 200 plans against 3,088. So the first half of the
  rule is met, and the question passes to the owner's judgment of gain against cost.
- The gain is small and has no time attached. A floor of ten rooms saves 90 pair tests per build.
  The saving comes from locating whole components in place of comparing rooms pair by pair. That
  step reads face cycles and component numbers, which today's walk can also produce, so the
  fallback could probably take the same step without stored twin and next links. This is an
  inference from the code. The trial did not test it.
- M5 does not choose. The cut works for separate buildings in both designs, both need the other
  components to place holes, and the trial's cut costs a full build.
- M8 gives no link that a consumer of this stage needs and the fallback cannot give.
- The benefit that ADR-0097 expected most, a structure that persists and updates in place, is out
  of reach in this stage because the plan geometry is rebuilt on every build. Of ADR-0097's bar,
  the trial shows the drop in post-passes and keeps the derived property. It shows no cheaper path
  to incremental invalidation.
- The cost is 325 more raw production lines than the fallback (262 counted) and three more cycles
  in the plan geometry pull request: 12 against 9.

Courtyards (#78) remain the reason to ask again, as the specification says. The trial branch holds
the half-edge form until the plan geometry pull request merges, and this record keeps its
measurements after that.

## The owner's decision

The owner decided on 2026-11-24 and also chose the rule. The two choices were:

1. Take the fallback, as recommended. The plan geometry keeps today's graph with one shared fan,
   and ADR-0097's "the flat-array pipeline stays" applies.
2. Adopt explicit half-edges. The plan geometry keeps the half-edges, and holes become the inner
   cycles of a face.

| Point              | Entry                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The owner's choice | The fallback (choice 1).                                                                                                                                                        |
| The rule used      | The working rule of the specification, section 5.3, point 5. Half-edges do better on M4, but the owner judged that gain, with no time attached, not worth the difference in M7. |
| Date               | 2026-11-24                                                                                                                                                                      |

The plan geometry pull request starts after the documents pull request `docs/half-edge-trial-result`
merges.

The owner also settled three smaller points:

- The timing run (M9) is not scheduled.
- The merged rooms on the corpus plan go to #681 as a symptom.
- The edge listed twice gets an issue of its own, linked to #1146, for the plan geometry pull
  request to fix.

## Consequences

With the fallback, as chosen:

- The plan geometry pull request has 9 cycles, and its cycle for the inner form is one cycle: the
  wall network keeps today's graph, and holes come from one containment pass inside the build.
- The shared fan and the functions that read it are written again, test first. The reference
  project then computes 18 fans per floor in place of 72. The new fan has to handle an edge from a
  junction to itself, which the trial's adapter does not.
- The three links stay answers of functions. They are not stored pointers, and holes are not part
  of a face. The specification names both as reasons to revisit when courtyards (#78) are
  scheduled.
- The half-edge code exists only on the trial branch, and the branch is deleted when the plan
  geometry pull request merges. After that, a later adoption starts from this record.

Had the owner adopted half-edges, which was not chosen:

- The plan geometry pull request has 12 cycles. Its cycle for the inner form becomes four: twin,
  next, and face; inner cycles as holes; components; and frozen records.
- `core/topology/` grows by about 325 raw production lines over the fallback, and the face walk and
  the hole pass of today are deleted.
- The new code must carry the trial's handling of an edge from a junction to itself, and it keeps
  today's order between two edges on one pair of junctions until the pull request for overlapping
  walls does the noding.

In both cases the defects above keep their issues, #1146 and #681, and the fifth fan site moves
with the consumers of the plan geometry.

## References

- [[ADR-0097-evaluate-doubly-connected-edge-list-for-plan-geometry]]: the question, the bar, and
  the request for the trial.
- [[ADR-0026-room-derivation-planar-face-enumeration]] and
  [[ADR-0058-donut-and-courtyard-rooms-via-hole-rings]]: today's face walk and its hole pass.
- [[ADR-0080-generalized-wall-junction-geometry]] and
  [[ADR-0082-three-dimensional-wall-junction-fill]]: the footprints and fills that read the fan.
- [[ADR-0218-exterior-walls-follow-the-rooms-along-the-wall]] and
  [[ADR-0203-room-records-bind-to-rooms-by-wall-faces-and-an-anchor]]: the consumers of the link
  from a wall face to its rooms.
- [[ADR-0202-overlapping-walls-share-one-edge-and-drawing-over-a-wall-merges]]: the rule that
  removes two edges on one pair of junctions.
- `docs/specs/2026-11-18-geometric-kernel-and-first-arc-wall.md`, section 5.3: the trial, its
  measurements, the working rule, and the fallback design.
- `docs/plans/2026-11-19-geometric-kernel-and-first-arc-wall.md`: the trial's steps and the cycles
  of the plan geometry pull request for each design.
- Branch `feat/half-edge-face-walk-trial` at `df5c5efb13850348e037d1f7883a6d6e9bf8c2fc`: the
  trial's code and tests. It never merges.
- Issues #1146 (a wall whose ends merge into one junction), #681 (overlapping walls), #78
  (courtyards), #80 (curved walls), #674 and #687 (the plan geometry).
