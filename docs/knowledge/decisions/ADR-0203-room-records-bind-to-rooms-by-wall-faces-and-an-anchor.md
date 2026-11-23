---
slug: decisions/ADR-0203-room-records-bind-to-rooms-by-wall-faces-and-an-anchor
title: 'ADR-0203: A room keeps its data in a stored room record that binds to its room by wall faces first and an anchor second'
type: decision
tags: [topology, rooms, room-identity, format, schema, migration, commands, kernel]
related:
  [
    decisions/ADR-0036-room-metadata-overrides-and-labels,
    decisions/ADR-0026-room-derivation-planar-face-enumeration,
    decisions/ADR-0029-schema-registry-migration-framework,
    decisions/ADR-0178-schema-version-and-revision,
    decisions/ADR-0179-domain-rules-in-command-handlers,
    decisions/ADR-0190-strict-check-refuses-and-two-classes-of-repair,
    decisions/ADR-0199-derived-tolerances-exact-junctions-and-lengths-that-read-back,
    decisions/ADR-0201-wall-path-accessor-and-the-arc-wall-made-by-bending,
    decisions/ADR-0202-overlapping-walls-share-one-edge-and-drawing-over-a-wall-merges,
  ]
sourceFiles:
  [
    core/topology/rooms.ts,
    core/model/types.ts,
    core/model/paint.ts,
    core/commands/handlers/room-commands.ts,
    core/commands/handlers/register-all-project-commands.ts,
    core/migrations/schema/rekey-room-overrides.ts,
    core/architecture-era/resolve-period.ts,
    core/architecture-era/resolve-style.ts,
    editor/shell/inspector.tsx,
    tests/format/room-overrides-binding.test.ts,
    docs/specs/2026-11-18-geometric-kernel-and-first-arc-wall.md,
  ]
status: current
updated: 2026-11-23
---

# ADR-0203: A room keeps its data in a stored room record that binds to its room by wall faces first and an anchor second

## Status

Current. The owner approved the kernel specification
(`docs/specs/2026-11-18-geometric-kernel-and-first-arc-wall.md`) on 2026-11-18, including its
decision 4: a room record binds to its room by wall faces first and by a point second. This record
answers the umbrella specification's question of how room identity survives a wall split, and how
existing room overrides migrate.

It supersedes in part [[ADR-0036-room-metadata-overrides-and-labels]]: the key, the sorted ids of a
room's bounding walls, under which `Project.roomOverrides` stores a room's data. The rest of ADR-0036
stands. The note in ADR-0036, a note on the room id in ADR-0026, section 3.2 of the design
specification, and the format specification's description of `roomOverrides` change with the pull
request that brings the records.

The code arrives in the kernel stage (#687). Until then a room's data is found by the key of its
bounding walls. One point is open; see "Open points".

## Context

A room's id is the sorted ids of its bounding walls (`core/topology/rooms.ts`). The user's data for a
room is stored under that key in `Project.roomOverrides` and found by exact match. The key is taken
from every half-edge of the face before dead-end stubs are removed, so a short stub wall drawn inside
a room adds its id to the key. The room gets a new id, and its name, purpose, period, style, ceiling
height, and custom outline no longer match. Nothing is deleted, and nothing tells the user. Deleting
a wall and drawing it again gives a new wall id and the same result.

Paint does not have this fault: a wall face is keyed by wall id and side, and a floor or ceiling by
floor id. Once arcs exist the key has a second fault. A round room of two arc walls, divided by a
partition that crosses both arcs, gives two rooms with the same three walls and so the same id.

## Decision

### A room record

The user's data for a room is a room record, stored in the document as a list. A record holds:

- an id of its own, which never changes;
- the floor it is on;
- its boundary: the wall faces that bounded its room when the record was last bound, each a wall id
  and a side;
- its anchor: a point inside the room at that time;
- the fields the override holds today.

Rooms are still derived from the walls and never stored (ADR-0026). A record is not a room. It is user
data that looks for its room.

### The binding rule

The kernel binds records to rooms with one rule, and the binding is a pure function of the document.

1. The score of a record for a room is the share of the record's boundary faces that bound that room.
2. A pair is admitted when its score is one, or when its score is at least one half and the room
   holds the record's anchor. The condition on the anchor for a score below one is open (see "Open
   points"); this is the working assumption.
3. Admitted pairs are taken in order: highest score first, then the room that holds the record's
   anchor, then the larger room, then the earlier record. Each record gets at most one room and each
   room at most one record.
4. A record still without a room takes the room that holds its anchor, if that room has no record.
5. A record still left over is unbound. It is kept and listed.

### One step after wall edits

After every command that changes a floor's wall list, one step rewrites each bound record of that
floor: its boundary becomes the room's current faces, and its anchor moves only if it is no longer
inside the room. Unbound records are not touched.

Before the handler runs, the same wrapper gives every record of that floor that has no anchor yet its
sides and its anchor, bound against the rooms of the floor as it was. There the record still matches
its room, so the edit that follows binds it with the full rule.

- The binding and the rewrite are kernel functions in `core/topology/`. The plan puts them in
  `core/topology/room-records.ts`, so that topology does not import commands.
- They read the wall network through the one memo of the plan geometry, so the step builds no second
  network, and a wall command builds the changed floor's network once.
- The wrapper is one function in `core/commands/` (the plan names
  `core/commands/room-record-binding.ts`), registered once beside the project commands. No handler
  calls it by name: the registration wraps every project command, runs the handler, and then runs the
  step for each floor whose wall list the handler replaced.
- It runs inside the command, so undo reverts it with the rest.

The command layer specification takes this step as an input and runs it after a handler's apply and
before the change set is computed. When change sets exist, the step becomes a reader of the change
set. ADR-0179 and the command layer redesign the place it is registered.

### What this gives the user

| Edit                                               | Result                                                                                                                                                   |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A stub or a tee wall is added                      | Nothing changes. Every face of the record still bounds the room.                                                                                         |
| A wall is deleted and drawn again, or is split     | Nothing changes. The other faces carry the record, and the step then learns the new wall.                                                                |
| A wall is dragged and the room shrinks or grows    | Nothing changes. Faces do not depend on position.                                                                                                        |
| The whole plan is moved, turned, or mirrored       | Nothing changes, for the same reason.                                                                                                                    |
| A partition divides the room                       | The part that keeps the larger share of the record's faces keeps the record. On a tie, the part that holds the anchor. The other part has no record.     |
| A partition between two named rooms is removed     | The merged room keeps one record. The other is unbound and kept.                                                                                         |
| That partition is drawn again                      | Both rooms have their records again.                                                                                                                     |
| Every wall of a room is deleted and new ones drawn | The record is unbound while the room is gone, and its anchor finds the new room.                                                                         |
| An outside wall of a named room is deleted         | The room is gone and the record is unbound. No neighbor holds its anchor, so none takes it. When a new outside wall closes the room, the record returns. |

### Room ids and the life of a record

- A room with a record has an id made from the record's id, and a room without one has an id made
  from its faces. The plan fixes the forms `room:record:<recordId>` and `room:faces:<faces>`, where
  `<faces>` is the sorted list of `<wallId>:<side>` joined with `|`. The faces id differs from every
  record id, and it differs for the two halves of a divided round room, because faces carry a side.
- The first command that sets a field on a room creates its record, with an id fixed when the command
  is made, so redo gives the same record.
- A record whose last field is cleared is removed. Records exist only while they hold something the
  user entered.
- The room commands take the record id, or the room's current id when it has no record yet. The
  lookups in `core/architecture-era/` do the same.
- The application never deletes an unbound record. The cost is that a name can come back: a user who
  deletes a named room and later draws a new room around the same spot finds the old name on it. The
  other choice is to delete user data when walls are deleted. A list of unbound records with a
  control to delete them is later work.

### The migration

`roomOverrides` becomes a list of room records. That takes the next free `schemaVersion` when it
lands (19, if the junction migration of ADR-0199 took 18 and no other step landed between them), and
a migration that loses nothing:

- a record's id is its old key, which is unique in the map and needs no random value;
- its boundary is the wall ids of the key, with no side, because finding the side needs a derivation
  and a migration must not depend on the live kernel. A face with no side matches either side, and
  the first wall command on that floor writes the sides and the anchor before its handler runs;
- its floor is the floor that holds its walls;
- a key whose walls no longer exist becomes a record with no floor. It was already dead under the old
  rule, and it is kept, as the migration to version 17 kept such keys;
- every field of every override is in the output, and the test shows it.

This is the migration class of [[ADR-0190-strict-check-refuses-and-two-classes-of-repair]]: a change
that loses no data is a step in the migration chain, runs with no question, and has a test that shows
every value of the input in the output.

The existing migration to version 17 imports `roomKey` from the kernel
(`core/migrations/schema/rekey-room-overrides.ts`). It gets its own copy of that one line, so removing
`roomKey` cannot change an old migration. The format test `tests/format/room-overrides-binding.test.ts`
moves to the records in the same pull request.

## Alternatives considered

A point alone, where the record belongs to whichever room holds it. It breaks when a wall is dragged
past the point: the neighbor takes the name.

Faces alone, with no point. A room rebuilt with new walls loses its record. Faces and a point each
cover the other's gap.

Keep today's key and repair it after each edit. Not weighed further, because the key cannot tell the
two halves of a divided round room apart.

## Consequences

- A room keeps its name, purpose, period, style, ceiling height, and custom outline through stubs,
  splits, drags, and redrawn walls. Each row of the table above is a test.
- A document at version 17 with room overrides has the same data on every room after the migration
  and one edit. When that first edit deletes and redraws every wall of a room, or deletes its
  outside wall, the result is the one in the matching row of the table above.
- The binding rule has cases no table can list. A wrong binding puts a name on the wrong room, which a
  user sees at once and cannot explain. Property tests and the rule's fixed order guard it, and since
  an unbound record is never deleted, a wrong binding loses nothing.
- During an end drag the step derives the changed floor's rooms once per pointer move, and the scene
  graph can derive the rooms part a second time after the step rewrote the records. Both run on the
  network the memo already holds. No time was measured.
- The room commands, the inspector, and the lookups in `core/architecture-era/` move from the wall
  key to the record id.

## Open points

- The owner decides the anchor condition for a score below one (kernel specification, section 5.6,
  point 3). It is needed before the room records pull request. The working assumption, recommended,
  is the rule above: a score below one is admitted only when the room holds the record's anchor.
  Without it a common edit names the wrong room. In a row of rooms under one long outside wall,
  deleting the end wall of a named room leaves its neighbor bounded by half of the record's faces,
  and an unnamed neighbor takes the name for good. The other options are to score by the length of
  the shared face stretches, which needs a new stored field, or to keep the rule without the
  condition and accept that case.

## References

- `docs/specs/2026-11-18-geometric-kernel-and-first-arc-wall.md`, section 5.6.
- `docs/plans/2026-11-19-geometric-kernel-and-first-arc-wall.md`, "Decisions this plan makes".
- `docs/specs/2026-11-14-architecture-refactor-round.md`, sections 5.4 and 8.
- Issue #687.
