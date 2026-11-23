---
slug: decisions/ADR-0201-wall-path-accessor-and-the-arc-wall-made-by-bending
title: 'ADR-0201: Walls are read through a wall path, and the first arc wall is a stored bulge made by bending'
type: decision
tags: [geometry, kernel, topology, walls, curved-walls, arc, format, schema, inspector, seams]
related:
  [
    decisions/ADR-0034-future-direction-extensibility-seams,
    decisions/ADR-0047-published-floor-plan-data-format-standard,
    decisions/ADR-0178-schema-version-and-revision,
    decisions/ADR-0181-millimetre-numbers-and-one-tolerance-model,
    decisions/ADR-0125-curved-opening-heads-from-shared-void-contour,
    decisions/ADR-0097-evaluate-doubly-connected-edge-list-for-plan-geometry,
    decisions/ADR-0199-derived-tolerances-exact-junctions-and-lengths-that-read-back,
    decisions/ADR-0202-overlapping-walls-share-one-edge-and-drawing-over-a-wall-merges,
    decisions/ADR-0203-room-records-bind-to-rooms-by-wall-faces-and-an-anchor,
  ]
sourceFiles:
  [
    core/model/types.ts,
    core/model/factories.ts,
    core/scene/scene-graph.ts,
    core/scene/contour.ts,
    core/topology/wall-graph.ts,
    core/topology/wall-footprint.ts,
    engine/scene/wall-scene-helpers.ts,
    engine/scene/wall-prism.ts,
    docs/specs/2026-06-10-vernacular-floor-plan-format.md,
    docs/specs/2026-11-18-geometric-kernel-and-first-arc-wall.md,
  ]
status: current
updated: 2026-11-23
---

# ADR-0201: Walls are read through a wall path, and the first arc wall is a stored bulge made by bending

## Status

Current. The owner approved the kernel specification
(`docs/specs/2026-11-18-geometric-kernel-and-first-arc-wall.md`) on 2026-11-18. This record holds
its decisions on the wall path accessor and on the first slice of curved walls (#80): the arc is
stored as a bulge, a new optional field is a schema revision with no fallback to a version step,
the first curved wall is made by bending a straight wall (taken on 2026-11-17), an arc wall hosts no
openings in this stage, and the arc reaches users in the last of the four arc pull requests.

It builds the centerline seam that [[ADR-0034-future-direction-extensibility-seams]] asked for. When
the arc reaches users, `wall.curve` changes from reserved to defined in section 6.5 of the format
specification, and ADR-0047 and section 2.4 of the design specification are updated. Those notes,
and the note in ADR-0034 that the seam exists, land with the pull requests that make them true.

The code arrives in the kernel stage (#687). Until then a wall is two end points, a wall scene node
repeats them, and `wall.curve` is a reserved name. One point is open; see "Open points".

## Context

A wall is two end points (`core/model/types.ts`), and a wall scene node repeats them
(`core/scene/scene-graph.ts`). ADR-0034 asked for a centerline accessor in June, and none exists. When
the specification was written, a search by name found 129 reads of a wall's `start` or `end` in 25
production files, 23 of them outside the kernel, and reads under other names add at least three more
files, so at least 26 files outside the kernel read wall end points. The full number was not
measured. The architecture review found the same projection of a point onto a segment written seven
times; that was not checked again.

An arc is the smallest change that forces every one of those readers through one accessor, which is
why the architecture refactor round pairs the kernel with the first slice of #80. The format
reserves `wall.curve` and says a reserved name becomes a defined field only by a raised
`schemaRevision` or `schemaVersion`, with a decision record. Section 7 of the format specification
counts that promotion as additive. `core/` already holds an exact arc for opening heads (ADR-0125),
and the engine owns its tessellation.

## Decision

### The wall path

A wall path is a value that describes a wall's centerline: a straight line between two points, or a
circular arc between two points. One kernel function builds it from a wall, and every other file
works with the path through kernel functions. The implementation plan puts it in
`core/geometry/wall-path.ts` as a plain frozen value with a `kind`.

The functions cover what the wall-reading files do with end points today: the two ends, the length,
the point and the tangent and the normal at a distance along the path, the nearest point to a given
point with its distance along and its offset, the bounds, a part of the path between two distances,
the path offset to one side, the path under a transform, and the path flattened to a stated
deviation. One function projects a point onto a centerline, and the private copies go.

A position along a wall is a distance along its path. An opening's `position` already means that for
a straight wall, so no stored value changes.

### No file outside the kernel reads a wall's end points

- The wall scene node carries the path and no end points. A file that still reads `wall.start` on a
  scene node fails to compile.
- The model type keeps `start` and `end`, because they are the file format. For the model type a
  test that uses the type checker holds the rule: outside `core/geometry/`, `core/topology/`, and
  `core/migrations/`, no expression reads `start` or `end` from a value of the wall type. It also
  flags a wall passed to a parameter whose declared type has `start` or `end`, so a structural
  parameter cannot hide a read. The rule is checked by type, not by variable name.
- Migrations and the schema work on untyped data and are outside the rule. Commands that change a
  wall's ends do it through kernel functions.

The move happens in the open. The accessor lands with an exception list that names every file the
check finds, and with one real reader: `engine/scene/wall-scene-helpers.ts` moves to the path in the
same pull request. The list must equal the set of flagged files, so a stale entry fails too. Each
later pull request takes files off it. The list is empty before any arc can reach a user.

The accessor does not depend on the half-edge trial of the kernel specification (section 5.3). A
path describes one wall's centerline, and the inner form of the plan geometry does not change it.

### The arc as stored

A wall gains one optional field, `curve`. Absent means straight. The one defined form is an arc that
holds one number, the bulge: the rise of the arc at the middle of the wall divided by half the
straight distance between the wall's ends. The plan fixes the shape as
`Wall.curve?: { kind: 'arc'; bulge: number }`, with `0 < |bulge| <= 1`.

- A positive bulge curves to the left when looking from the wall's start to its end, the side the
  opening orientation already calls positive.
- The bulge is at most 1 in size, and a bulge of 1 is a half circle. A round room is two arc walls, and a tower that
  turns three quarters of a circle is two arc walls. Larger arcs are a later, additive change.
- The field has a `kind`, so later curve forms can sit beside the arc.

The bulge is chosen over a radius or a center for five reasons:

1. It cannot disagree with the end points. A stored center can lie at different distances from the
   two ends, and a stored radius can be shorter than half the wall.
2. Every value in the allowed range is a valid arc, and no edit to an end point can make it invalid.
3. `start` and `end` keep their meaning, so junctions, the junction migration of ADR-0199, and every
   tool that moves an end work as they do for a straight wall.
4. Moving an end keeps the shape. A half-round bay stays half round when it is widened, and the
   radius follows.
5. Moving, turning, and scaling a wall leave the number alone. A mirror flips its sign.

A radius is still what a person reads and types. It is computed from the bulge and the chord, and a
typed radius is converted to a bulge exactly enough, far below the length tolerance, that it reads
back as typed.

The centerline radius has a lower bound against the wall's resolved thickness, because the inner face
of a thick wall on a tight arc does not exist below half the thickness. The bound itself is open (see
"Open points"). The derivation stays total for a stored arc that breaks the bound, from an older
build or a hand-edited file: it draws that wall straight and lists it with what was set aside.

### The file format change

`wall.curve` is a new optional field and the promotion of a reserved name. Under ADR-0178 and section
7 of the format specification that is additive. It takes the next free `schemaRevision` of the
version that is current when it lands, and no migration. Both version steps of the kernel stage land
before it, so that is revision 1 of version 19 if no other revision of 19 lands first. Each change that
publishes a revision takes the next free number when it lands and checks it again before the merge.
There is no fallback to a version step.

What an older build does follows from the reading rules. A build at an older version refuses the
file. A build at the same version and an older revision opens it, keeps the field, says a newer build
saved it, and draws the wall straight. That second case can only be a build from between two kernel
pull requests.

### In the kernel

- The path of an arc wall is an exact arc. The graph finds where a line meets an arc and where two
  arcs meet, splits an arc at a tee, and treats two arcs on one circle as an overlap (ADR-0202).
- The fan around a junction is ordered by direction first and curvature second, so a straight wall
  and an arc that leaves tangent to it still have a defined order.
- The footprint of an arc edge is bounded by two arcs around the same center, one per face. A miter
  corner is the exact meeting point of the two face curves. Using the tangent line instead would put
  the corner off by several millimetres for a thick wall on a tight radius.
- Where an arc leaves a junction tangent to a line, within the angle tolerance, the two face curves
  touch at one point and their meeting point is badly conditioned. The corner is then the offset
  point of the junction on each face. Where a face line meets a face circle twice, the corner is the
  meeting point nearer the junction along both faces.
- A room boundary can hold arcs, and the area is exact: the area of the straight-sided outline plus
  or minus the circular segments. `core/` keeps the arc exact, and each consumer flattens it to a
  deviation it names. An area is never computed from a flattened outline.

### As drawn

In the plan, the wall's fill, face lines, selection, and paint bands follow the arc, and the canvas
draws true arcs. Hit testing and snapping use the nearest point on the arc. The snap points of an arc
wall are its two ends and the nearest point. The SVG export writes an arc.

In 3D an arc edge is one solid with two curved faces, built from the footprint above and tessellated
in `engine/`. Each face stays one paintable face, so paint and the 3D face pick work as for a
straight wall. Walk collision uses the flattened path.

### Making one: bend a straight wall

A selected wall shows a handle at its middle beside its two end handles. Dragging it sideways sets
the bulge, and the plan, the 3D view, and the inspector follow. The handle stops at a half circle and
snaps back to straight near the chord. The wall keeps its id, its junctions, its paint, and its room.

The wall inspector gains a Radius field beside the thickness and Length fields. It shows the radius
of an arc wall and is empty for a straight one. A typed radius shorter than half the wall is refused
with a reason, and clearing the field makes the wall straight. One command sets or clears a wall's
curve, and a drag is one undo step.

Bending is the hardest case for the accessor and the caches: the same wall changes from straight to
arc and back, with its id and everything attached to it. It needs no new tool, so it adds nothing to
the lists of tool ids that the stage for tools and input replaces. For tracing an underlay it takes
the same three inputs as a three-point tool: two ends and a point on the curve.

### Limits of this stage

- An arc wall hosts no opening, and a wall that hosts one cannot be bent. The bend handle and the
  Radius field do not show on such a wall, the opening tool does not offer an arc wall, and the
  handlers refuse both on a direct dispatch.
- A file can still hold an arc wall with an opening, from an older build or a hand edit, and the
  schema cannot forbid it. The derivation stays total: the opening gets its span along the arc in the
  plan, no void is cut in 3D, and the opening is listed with what was set aside.
- The arc reaches users in the last arc pull request, which adds the stored field, the command, the
  handle, and the Radius field. The three before it teach the kernel, the plan, and the 3D view to
  handle an arc path, and only tests and stories build one. This is a deliberate, short exception to
  the rule that a seam lands with a use. The alternative is one pull request too large to review.
- The arc comes after the half-edge trial and after the consumers move to the plan geometry. The arc
  work does not depend on the trial's outcome, because the fan order and the noding are the same in
  both designs. The planned ADR-0200 records that outcome.

### What waits for the rest of #80

The rest of #80 gets the design round the owner has already scheduled, and #80 keeps its
`public-beta` milestone. That round covers openings in an arc wall (the shape of the void and the
leaf in 3D), arcs of more than a half circle, other curve kinds, walls made of several curves, and
dimensions on an arc. A snap to an arc's center is later work as well. None of them needs a change to what this stage
builds: the accessor already gives a position along an arc, the stored field has a `kind`, the limit
on the bulge is one check, and the center is a kernel function.

## Alternatives considered

A stored radius or center. Rejected for the reasons listed under "The arc as stored".

Define `wall.curve` in the schema of the kernel's room records version step
([[ADR-0203-room-records-bind-to-rooms-by-wall-faces-and-an-anchor]]). It needs no revision and no
third version step. Its cost is a schema field with no writer until the bending pull request, and a
published schema is fixed once released, so the field would be fixed before the arc that writes it.

A third version step with a migration that changes nothing. Every older build would refuse the file,
and that is the kind of step ADR-0178 was written to stop.

A three-point arc tool. The stored form and the kernel stay the same, but a new tool adds an id to
about six shared lists that the stage for tools and input replaces, so that work is done twice. And
bending an existing wall is no longer possible unless both are built.

A typed radius alone. The last pull request shrinks, but a radius says nothing about which side the
wall curves to, so the field needs a second control, and tracing a curve from an underlay becomes
trial and error.

## Consequences

- No file outside the kernel reads a wall's end points, and the type checker holds the rule. That is
  one of the umbrella's kernel conditions.
- Every consumer follows a wall from straight to arc and back: the plan, the 3D view, room areas, and
  the SVG export show the same arc.
- A curved wall takes two acts, draw and then bend, and nothing in the tool rack says that walls can
  curve. A person has to find the handle.
- The arc reaches users about one trial and one approval later than it would without the trial.
- Between the first arc path pull request and the bending pull request, `main` carries arc code that
  only tests and stories reach.
- An older build at the same schema version draws an arc wall straight and says a newer build saved
  the file.
- A thickness change on an arc wall is refused when it would break the radius bound, which a user may
  not expect.
- Miters between a line and an arc, and between two arcs, are new geometry and the most likely place
  for a wrong corner. A corner property test and a scene baseline at a tight radius guard them.

## Open points

- The owner decides the smallest centerline radius against the wall's resolved thickness (kernel
  specification, section 5.7, point 2). It is needed before the arc paths pull request. The working
  assumption, recommended: the centerline radius is at least the wall's resolved thickness. Under it
  the bend handle stops at the bound, the Radius field refuses a radius below it with a reason, and
  the thickness command refuses a thickness that would break it on an arc wall. The other options are
  a bound just above half the thickness, where the inner face can come to a point, or no bound in this
  stage.

## References

- `docs/specs/2026-11-18-geometric-kernel-and-first-arc-wall.md`, sections 5.2, 5.7, and 9.
- `docs/plans/2026-11-19-geometric-kernel-and-first-arc-wall.md`, "Decisions this plan makes".
- `docs/specs/2026-06-10-vernacular-floor-plan-format.md`, sections 6.5 and 7.
- `docs/specs/2026-11-14-architecture-refactor-round.md`, sections 5.4 and 6.
- Issues #80 and #687.
