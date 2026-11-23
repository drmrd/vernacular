---
slug: decisions/ADR-0202-overlapping-walls-share-one-edge-and-drawing-over-a-wall-merges
title: 'ADR-0202: Overlapping walls share one edge that the first wall owns, and a wall drawn over a wall merges with it'
type: decision
tags: [geometry, kernel, topology, walls, rooms, overlap, degenerate-input, commands, wall-tool]
related:
  [
    decisions/ADR-0026-room-derivation-planar-face-enumeration,
    decisions/ADR-0179-domain-rules-in-command-handlers,
    decisions/ADR-0097-evaluate-doubly-connected-edge-list-for-plan-geometry,
    decisions/ADR-0199-derived-tolerances-exact-junctions-and-lengths-that-read-back,
    decisions/ADR-0201-wall-path-accessor-and-the-arc-wall-made-by-bending,
    decisions/ADR-0203-room-records-bind-to-rooms-by-wall-faces-and-an-anchor,
  ]
sourceFiles:
  [
    core/topology/wall-graph.ts,
    core/topology/rooms.ts,
    core/geometry/segment.ts,
    core/commands/handlers/wall-commands.ts,
    editor/plan/wall-tool.ts,
    docs/specs/2026-11-18-geometric-kernel-and-first-arc-wall.md,
  ]
status: current
updated: 2026-11-23
---

# ADR-0202: Overlapping walls share one edge that the first wall owns, and a wall drawn over a wall merges with it

## Status

Current. The owner approved the kernel specification
(`docs/specs/2026-11-18-geometric-kernel-and-first-arc-wall.md`) on 2026-11-18, including its
decision 3, taken on 2026-11-17: a wall drawn over part of another wall merges with it. Its code
settles #681. It takes overlap into the scope of room derivation, which ADR-0026 listed as out of
scope; the note in ADR-0026 lands with the pull request that makes overlapping walls keep their
rooms.

The code arrives in the kernel stage (#687). Until then a wall drawn along part of another wall can
make a room disappear, and the add-wall handler appends a wall with no check.

## Context

The wall graph handles crossings and tees. Two segments on one line give no intersection
(`core/geometry/segment.ts`), so a shared stretch becomes two edges between the same two junctions.
The architecture review of 2026-11-14 ran four cases against the room derivation: a square, a wall
inside one edge, a wall that overlaps one edge and runs past the corner, and an exact copy of one
edge. The last three give no rooms (#681). The kernel specification did not run them again. Read
from the code, the cause is the face walk: two edges leave a junction at the same angle, the sort has
no rule for that, and the walk joins the room to the outer face.

## Decision

### The derivation

1. The derivation is total. For any list of walls it returns a plan geometry, and no input makes a
   room disappear that the walls enclose.
2. Two walls overlap when they lie on the same line or the same circle, under the test of ADR-0199,
   and share a stretch longer than the length tolerance. The graph makes one edge for the shared
   stretch.
3. The wall that comes first in the floor's wall list owns the shared edge. The footprint, the 3D
   solid, the faces, and the room boundary of that stretch come from the owner. The other wall is
   recorded on the edge as covered and contributes only the parts of itself that no earlier wall
   covers. Nothing is drawn twice.
4. A wall covered over its whole length contributes nothing. The plan geometry lists it, so that a
   later stage can show it to the user.
5. A wall shorter than the length tolerance is set aside and listed, as today.
6. The fan around a junction is ordered by direction first and by curvature second, so the order is
   always defined, also for a straight wall and an arc that starts tangent to it
   ([[ADR-0201-wall-path-accessor-and-the-arc-wall-made-by-bending]]).

Old documents, a move, and a paste can hold an overlap whatever the drawing rule is, so these points
hold for every input.

### Drawing over a wall merges

7. The add-wall command keeps the parts of the drawn wall that no existing wall covers and adds each
   as a wall. The existing wall does not change: it keeps its id, thickness, construction, openings,
   and paint. If nothing is left, no wall is added.
8. In both cases the plan says so in one line. The plan fixes the texts: "Part of this wall was
   already there." and, when nothing is added, "This wall was already there." The whole act is one
   undo step. Where the line shows is left to the builder; if the command layer has built a place
   for notes on commands by then, the line goes there.
9. "Merge" does not join two walls into one longer wall. Joining would give the result a new extent,
   and every opening on it is measured from the wall's start.
10. One kernel function computes the parts. The handler calls it, and the wall tool calls it for the
    preview, so the user sees what will be added before the click.

### Other commands are not changed here

An end point drag, a move, and a paste can also leave an overlap. This stage does not change them.
The derivation gives them a defined result, and the command layer decides whether they merge or
refuse when it moves rules into the handlers (ADR-0179). The kernel function of point 10 is there
for a handler to call.

## Alternatives considered

Refuse a wall drawn over a wall. Points 7 to 10 would become a rule that rejects the wall: the editor
checks it first and shows the reason, a chained run of walls ends at the refused segment, and the
handler throws on a direct dispatch until the command layer brings typed rejections. Points 1 to 6
stay. Its cost: tracing over an underlay stops in the middle of a run, and the user has to find where
the existing wall ends and start again from there.

Keep both walls in the document and let the derivation show one. Points 1 to 6 already do that for
every overlap that does not come from drawing. As the rule for drawing it has a cost that grows:
covered walls pile up where nobody can see or select them, and one reappears when its owner is moved
or deleted.

## Consequences

- The four cases of #681 each yield one room with the area of the square, and a property test adds a
  wall along any stretch of an existing wall and finds the same rooms with the same areas.
- A document that already holds two overlapping walls opens, shows each stretch once in the plan and
  in 3D, and lists the covered wall.
- The document can hold less than the user drew. A user who draws over a wall to give that stretch
  another thickness gets no change and one line of text.
- Whether a move, a paste, or an end point drag merges or refuses stays with the command layer. An
  issue for it is on the kernel specification's list of issues to file (section 7).

## References

- `docs/specs/2026-11-18-geometric-kernel-and-first-arc-wall.md`, sections 5.1 (point 4) and 5.5.
- `docs/plans/2026-11-19-geometric-kernel-and-first-arc-wall.md`, "Decisions this plan makes".
- Issues #681 and #687.
