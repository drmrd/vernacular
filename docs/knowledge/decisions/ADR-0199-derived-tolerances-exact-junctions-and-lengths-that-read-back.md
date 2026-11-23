---
slug: decisions/ADR-0199-derived-tolerances-exact-junctions-and-lengths-that-read-back
title: 'ADR-0199: Geometric tolerances are derived, the 1 mm join moves to input, and lengths read back as typed'
type: decision
tags: [geometry, kernel, topology, tolerance, units, numeric-entry, format, migration, inspector]
related:
  [
    decisions/ADR-0181-millimetre-numbers-and-one-tolerance-model,
    decisions/ADR-0178-schema-version-and-revision,
    decisions/ADR-0026-room-derivation-planar-face-enumeration,
    decisions/ADR-0134-geometry-primitive-snaps-polygon-offset-corners,
    decisions/ADR-0218-exterior-walls-follow-the-rooms-along-the-wall,
    decisions/ADR-0182-migration-backups-in-their-own-directory,
    decisions/ADR-0179-domain-rules-in-command-handlers,
    decisions/ADR-0201-wall-path-accessor-and-the-arc-wall-made-by-bending,
    decisions/ADR-0202-overlapping-walls-share-one-edge-and-drawing-over-a-wall-merges,
    decisions/ADR-0203-room-records-bind-to-rooms-by-wall-faces-and-an-anchor,
  ]
sourceFiles:
  [
    core/topology/wall-graph.ts,
    core/topology/rooms.ts,
    core/topology/junction-fill.ts,
    core/geometry/segment.ts,
    core/geometry/polygon.ts,
    core/geometry/wall-face.ts,
    core/scene/wall-room-sides.ts,
    core/daylight/room-validation.ts,
    core/units/format-length.ts,
    core/units/format-adaptive-length.ts,
    core/units/format-entry-magnitude.ts,
    editor/plan/length-field.tsx,
    editor/plan/snap.ts,
    editor/plan/wall-tool.ts,
    docs/specs/2026-11-18-geometric-kernel-and-first-arc-wall.md,
  ]
status: current
updated: 2026-11-23
---

# ADR-0199: Geometric tolerances are derived, the 1 mm join moves to input, and lengths read back as typed

## Status

Current. The owner approved the kernel specification
(`docs/specs/2026-11-18-geometric-kernel-and-first-arc-wall.md`) on 2026-11-18. With it he took
three decisions that this record holds: the length tolerance is 0.001 mm, the 1 mm join moves to
pointer input with a migration that makes the ends it joined one point, and lengths show their
exact value below the precision setting while input steps follow the unit system. He also approved
the Length field in the wall inspector and chose that a length field shows the formatted length
after a commit.

This record gives [[ADR-0181-millimetre-numbers-and-one-tolerance-model]] the tolerance values that
it left to the kernel specification, and ADR-0181 carries a note that points here. The other notes
this record calls for (ADR-0026 on the merge, ADR-0134 on the grid, ADR-0218 on the room ring, and
ADR-0181's consequence on the Length field) land with the kernel pull requests that make them true.

The code arrives in the kernel stage of the architecture refactor round (#687). Until then the wall
graph merges ends within 1 mm, each module keeps its own epsilon, and the formatter rounds at the
user's precision. One point is open; see "Open points".

## Context

"The same point" means 1 mm in the wall graph (`core/topology/wall-graph.ts:26`), 1e-6 in the
junction fills, 1e-9 in the opening voids, and exact equality in the wall tool. "Parallel" is a
cross product below 1e-9 in three files, and the cross product is not normalized, so the same angle
passes for a short wall and fails for a long one. The graph's merge keeps the first point it saw
and is not transitive. A face counts as a room above a fixed 1 mm². Six more constants compare
computed geometry with a number of their own.

ADR-0181 decided that one module defines the tolerances and that a typed value is applied exactly.
It left the values to the kernel specification, with two bounds: far below the smallest display
step, and far above floating-point rounding at building scale.

The formatter has a related fault. It rounds to the user's precision (1/8 inch by default) and says
nothing about what it dropped, so a thickness typed as 4 9/16 inches cannot read back. Every field
built from `LengthField` shows a bare decimal in the entry unit. The snap grid, the keyboard step,
and the nudge are 100 mm in every project, which is not a multiple of 1/256 inch, and the angle
snap does not round the drawn length. So almost no length drawn with the pointer in an imperial
project is exact.

## Decision

### What a tolerance is

A geometric tolerance decides whether two computed quantities are equal. A pick radius, a snap
radius, a drag threshold, a rendering offset, or a rule such as "furniture within 100 mm counts as
on a wall" is a distance a person or a rule works with, not a tolerance. Those stay in their files,
and an architecture test carries them on a list, each with its reason. The specification's table
(section 5.1, point 8) gives the entries: the hit, snap, marquee, and click thresholds, the wall
attachment rule, the slab side face inset (ADR-0150), the miter limit (ADR-0080), the walk camera's
pitch guard, the sun position guard, and the two color gates.

### The values

- The length tolerance is 0.001 mm. Two points closer than that are the same point.
  - Below the display. The smallest display step is 1/256 inch, 0.0992 mm, which is 99 times the
    tolerance. Two values one display step apart never merge, and a merge never moves a point by
    an amount the formatter would show.
  - Above the rounding. A 64-bit number 1 km from the origin has a spacing of about 1.2e-10 mm,
    so the tolerance is about 8.6 million times that. A chain of 10,000 transforms that each add
    one rounding error drifts by about 1.2e-6 mm at worst, still about 860 times below the
    tolerance. These figures follow from the number format; they are not measurements.
  - The value sits nearer the display side on purpose. Data from other tools often carries three
    to six decimals of a millimetre, and 0.001 mm joins points that such rounding pulled apart.
- Two segments are parallel when the shorter one, laid along the direction of the other, ends
  within the length tolerance of it. This is a length test, so it means the same for a short wall
  and a long one. For a direction with no length, the angle tolerance is 1e-8 radians: the angle at
  which a line 100 m long drifts sideways by one length tolerance.
- Two walls lie on the same line or the same circle when every point of the shorter one is within
  the length tolerance of the other's line or circle. Such a pair is an overlap
  ([[ADR-0202-overlapping-walls-share-one-edge-and-drawing-over-a-wall-merges]]) and is never
  intersected, because the crossing point of two nearly parallel lines is badly conditioned.
- A face is degenerate when its area is at most the length tolerance times its perimeter, so its
  mean width is below the tolerance. This replaces the two fixed areas of 1 mm².
- Derived coordinates that must meet exactly, such as offset corners, are rounded to a grid of
  1e-6 mm. That is the grid ADR-0134 already uses, now stated as one thousandth of the length
  tolerance. Stored coordinates are never rounded.
- The margins hold within 1 km of the plan origin and shrink in proportion beyond it. The property
  tests generate input up to that extent. Nothing refuses a larger plan in this stage.

### One module

One module, `core/geometry/tolerance.ts`, defines the tolerances and the predicates that use them:
same point, zero length, point on a path, parallel, same line or same circle, and zero area. No
other file compares computed geometry with a number of its own. The implementation plan fixes the
names of the derived values (`LENGTH_TOLERANCE_MM`, `ANGLE_TOLERANCE_RAD`,
`DERIVED_COORDINATE_GRID_MM`, `SUPPORTED_EXTENT_MM`, and the two smallest display steps) and keeps
the exported names `DEFAULT_JUNCTION_TOLERANCE_MM`, `ROOM_RING_TOLERANCE_MM`, and
`OUTLINE_TOLERANCE_MM`, so that no importer of `core/index.ts` changes.

The module lands in two steps. First every geometric constant moves into it with its current value,
and behavior does not change. Then the step with the migration below switches the derivation to the
length tolerance. Constants owned by other work keep their values as named entries, each with its
reason, until the work that owns them changes them.

Two distances are rules and live in the module as named entries of their own:

- The join distance, 1 mm, an input rule (next section).
- The daylight outline distance, 1 mm, which decides which daylight input the field accepts. It
  does not become the length tolerance in this stage, because that would change which rooms and
  apertures the daylight field refuses. Whether it later does is the daylight work's decision.

The room ring of ADR-0218 (`ROOM_RING_TOLERANCE_MM`) moves into the module at 1 mm, still tied to
the graph's merge. When the derivation switches, room corners become exact points on the walls they
were traced from, so the ring switches to the length tolerance in the same step. That narrows the
near-wall fade's window from 1 mm to 0.001 mm, and the fade's tests are pinned across the switch.

### The join rule moves to input

The 1 mm merge leaves the derivation. When the pointer places or moves a wall end within the join
distance (1 mm) of a junction or of a wall, the editor writes the end exactly onto that junction or
wall before it builds the command. A typed value is never moved (ADR-0181, point 3). Snapping
already writes exact coordinates, so this rule matters only when snapping is off or misses.

### A migration makes old junctions exact

A room whose corners are 0.5 mm apart is closed under the old rule and open under the new one, so
existing projects need a migration. It takes the next free `schemaVersion` when it lands (18 if no
other step lands first), and `CURRENT_SCHEMA_REVISION` returns to 0 with it (ADR-0178). A version
step is right even though no field changes, because the meaning of "the same point" in stored data
changes.

The migration carries its own frozen copy of the old graph rule and the two segment helpers it
calls, with two frozen entries in the tolerance module (the 1 mm merge and the 1e-9 parallel limit,
each with the reason "migration to version 18, never changes"). A later change to the kernel then
cannot change what the migration does. It runs that rule once on each floor and writes the result
into the walls:

1. A wall of 1 mm or less has no junction and bounds no room today. Its end is set to its start, a
   move of at most 1 mm. It keeps its id, openings, and paint, and the derivation sets it aside as a
   wall of no length. Nothing is deleted.
2. Every other end takes the point of the vertex the old merge gave it, a move of at most 1 mm. All
   ends at one vertex take the same point.
3. A vertex that split a wall it does not end is a tee. It moves, with every end at it, to the
   nearest point on the met wall's current line.
4. A vertex that is a tee on two or more walls goes to the crossing of the first two lines, in the
   order of the floor's wall list, if that point is within 2 mm. Otherwise it goes onto the first
   wall's line, and the report counts it.
5. Steps 3 and 4 repeat until a pass moves no vertex by more than 1e-6 mm, at most 8 passes. The
   migration never refuses the document. It keeps the eighth pass and names the floor.
6. Crossings of wall middles within 1 mm of each other become separate points. Three walls that
   cross this way leave a room less than about 1 mm across. The migration moves only wall ends, so
   it leaves such a cluster and counts it.
7. An opening keeps the plan point of its center, projected onto the new wall line, and is clamped
   if it would reach past an end. A dimension point exactly on a wall end moves with it; any other
   stays.
8. The migration returns its counts: ends moved and the largest move, walls set to no length, tees
   that took the second rule of step 4, near-crossing clusters, floors at the pass limit, clamped
   openings, and walls whose formatted length changes at the default precision. Its pull request
   runs it over every format and version fixture and reports the counts.

So an end at a corner moves at most 1 mm, an end at a simple tee at most 2 mm, and each further
level of a chain of tees adds at most 1 mm. These bounds are derived from the old rule. Most ends
are expected not to move at all, because snapping wrote them exactly; that was not measured. The
migration adds no dialog, and the migration backup of ADR-0182 keeps the original.

### How a length is shown

The formatter looks for the coarsest step at which the stored value is exact within the length
tolerance. It starts at the user's precision and goes down to 1/256 inch or 0.1 mm. If it finds one
it shows that value in full. If not, it rounds at the user's precision and marks the result as
approximate. The precision setting is the coarsest step shown, no longer a cap. A thickness typed
as 4 9/16 inches reads 4 9/16 inches at a precision of 1/8 inch, and a metric wall of 3000.4 mm
reads 3.0004 m where it read 3.00 m. A diagonal wall, a wall that ends on another wall's middle, and
the coordinates of a free cursor carry the mark.

`LengthField` itself moves to this formatter, for every field built from it. After a commit a
length field shows the formatted length, for example 4 9/16".

### The Length field

The wall inspector gains a Length field beside the thickness field. It shows the distance between
the wall's ends through the formatter. A typed length keeps the wall's start and moves its end
along the direction from start to end, through one kernel function that places an end at a typed
length exactly and does not pass it through the join rule. The start stays because an opening's
`position` is measured from it, so every opening keeps its place. The field dispatches the existing
`moveWallEndpoint` command, so the edit is one undo step and no command is added. Walls joined at
the moved end do not change, as with the end drag today.

The field refuses, with a reason, a length that is not positive and a length that would leave an
opening past the new end. The plan fixes the texts: "Enter a length greater than zero." and "The
wall would end before an opening." The check runs in the field; the handler does not change until
the command layer moves rules into handlers (ADR-0179). On an arc wall the field shows the length
along the arc and takes no input in this stage.

### Input steps follow the unit system

In an imperial project the snap grid, the keyboard candidate step, and the selection nudge are 4
inches (101.6 mm), and the larger nudge is 3 feet (914.4 mm). A metric project keeps 100 mm and
1000 mm. While grid snapping is on, the angle snap rounds the length along its ray to the grid step
from the run's last point. With Alt held the angle snap is off, as today. The visible grid of an
imperial project steps in inches and feet, so snapped points lie on its lines. These steps land with
the formatter, so the labels and baselines move once.

## Alternatives considered

Keep the 1 mm merge for old documents. That leaves two meanings of "the same point" for as long as
old documents exist, and it keeps the defect ADR-0181 names: a merge that can move a wall end by
about 1/25 inch.

Keep the precision setting as a cap, rounding and marking any value not exact at the user's
precision. A typed value finer than the precision then does not read back (4 9/16 inches shows as an
approximate 4 5/8 at 1/8 inch), and the read-back guarantee holds only at a precision of 1/64 inch.

Show a bare number in the entry unit in a length field after a commit, and accept fractions on
input. The owner chose the formatted length instead, because a typed fraction must read back as it
was typed. Either choice moves the baselines of every length field story.

Keep 100 mm input steps in an imperial project. Most lengths drawn with the pointer would then carry
the approximate mark, because the angle snap does not round and almost no grid point is a multiple
of 1/256 inch.

## Consequences

- One module defines the tolerances, and an architecture test fails when a file outside it declares
  one, by name or as a numeric constant below 1e-3 in the geometry, topology, and scene folders.
- Two display values one step apart, down to 1/256 inch and 0.1 mm, are always two points.
- Old projects keep their rooms under the new rule. This is the first migration in the project that
  moves stored geometry. Two things can change on screen: a tee vertex moved off the grid can change
  a wall's length label between exact and approximate, and a near-crossing cluster leaves a room
  less than 1 mm across.
- The length tolerance is derived from the number format, not from measured plans. The join rule on
  input and the migration are the guards, and the property tests probe the band between 0.001 mm
  and 1 mm.
- Most labels change: the plan labels, the readouts, the dimensions, and the accessible wall label.
  The story baselines of the coordinate readout, the dimension inspector, the overall dimensions,
  the wall inspector, and every length field move, and so do the app screenshots of a new imperial
  project.
- The read-back guarantee of ADR-0181 is tested through the Length field: a property test types
  every inch fraction down to 1/64 and every metric value down to 0.1 mm, saves, loads, and compares.

## Open points

- The owner decides the wording of the umbrella's sixth kernel condition and of ADR-0181's
  consequence (kernel specification, section 11, point 1). Both name the wall tool, which takes no
  typed length on `main`. The working assumption, recommended: "A length typed in the Length field
  of the wall inspector reads back the same after save and reload, for every inch fraction down to
  1/64 and every metric value down to 0.1 mm", with the test through the wall tool moved to the
  stage for tools and input under an issue of its own. If he accepts it, ADR-0181's consequence
  changes from "typed in the wall tool" to "typed in the Length field of the wall inspector". The
  other options are to add typed length entry to the wall tool in this stage, or to keep the wording
  and leave the condition open after this stage.
- The glyph that marks an approximate length is settled in the visual review of the formatter's
  pull request. The plan works with a leading "≈ ". The tests check an `exact` flag, not the glyph.

## References

- `docs/specs/2026-11-18-geometric-kernel-and-first-arc-wall.md`, sections 5.1, 5.8, and 11.
- `docs/plans/2026-11-19-geometric-kernel-and-first-arc-wall.md`, "Decisions this plan makes".
- `docs/specs/2026-11-14-architecture-refactor-round.md`, sections 5.4 and 7.
- Issue #687.
