---
slug: decisions/ADR-0204-the-main-entrance-and-the-view-from-the-front
title: 'ADR-0204: The main entrance and the view from the front'
type: decision
tags: [architecture, core, daylight, 3d-preview, environment]
related:
  [
    decisions/ADR-0193-sample-daylight-for-a-project-with-no-site-location,
    decisions/ADR-0218-exterior-walls-follow-the-rooms-along-the-wall,
    decisions/ADR-0205-opening-time-chosen-for-the-house,
    decisions/ADR-0139-plan-to-world-orientation,
    decisions/ADR-0038-openings-doors-and-windows,
    decisions/ADR-0179-domain-rules-in-command-handlers,
  ]
sourceFiles:
  [
    core/scene/front-direction.ts,
    core/scene/entrance-role.ts,
    core/commands/entrance-rule.ts,
    core/commands/handlers/entrance-commands.ts,
    editor/commands/entrance-commands.ts,
    editor/plan/opening-inspector-context.ts,
    editor/plan/opening-inspector.tsx,
    schema/17/revision-2/vernacular.schema.json,
    core/registries/opening-kind.ts,
    core/index.ts,
    core/scene/front-direction-test-support.ts,
    core/scene/front-direction.test.ts,
    core/scene/front-direction-floors.test.ts,
    core/scene/front-direction-families.test.ts,
    core/scene/entrance.test.ts,
    core/registries/opening-kind.test.ts,
    docs/specs/2026-11-19-first-view-of-a-project.md,
    docs/plans/2026-11-19-first-view-of-a-project.md,
    docs/specs/2026-11-15-daylight-and-shadow.md,
  ]
status: current
updated: 2026-11-21
---

# ADR-0204: The main entrance and the view from the front

## Status

Current. Accepted on 2026-11-21 with the entrance guess, the first part of #627. It follows section
5.2 of `docs/specs/2026-11-19-first-view-of-a-project.md`, called the first-view specification
below, and its plan, `docs/plans/2026-11-19-first-view-of-a-project.md`.

The record covers the main entrance of a building and, later, the view that opens on it. The
sections up to "References" cover the guess. The mark on the door is the second part of #627. It
adds the section "Extension, 2026-11-21: the mark" at the end, and where that section changes a
sentence above, the sentence says so. The view from the front is the third part and will add a
dated section of its own.

This record amends [[ADR-0193-sample-daylight-for-a-project-with-no-site-location]], which carries
a dated amendment that points here. It also explains three edits of the daylight specification,
`docs/specs/2026-11-15-daylight-and-shadow.md`, listed under "The edits of the daylight
specification".

## Context

`frontDirection` in `core/scene/front-direction.ts` gives the direction a building faces. The sample
sun turns to it when a site has no stored location and no stored north bearing (ADR-0193). The
opening time of [[ADR-0205-opening-time-chosen-for-the-house]] reads it for a site whose north is
set.

Until now the front was the outward normal of the widest exterior door, of any family and on any
floor. A wide sliding glass door at the back, a French door on an upstairs balcony, or a basement
door could each be taken for the entrance. The sun then lit the wrong side of the house.

The owner chose "Widest hinged door, ground floor (Recommended)" on 18 November 2026 (answer 2 of
the table "Decisions of the owner" in the first-view specification). On 19 November he settled how
the two new rules rank against each other (answer 9). The floor ranks first. So a house whose only
ground-floor door slides opens at that door, not at a hinged door upstairs.

## Decision

### The rule

With no door marked, the entrance is picked by these rules, in order.

1. Only doors on exterior runs count, as before
   ([[ADR-0218-exterior-walls-follow-the-rooms-along-the-wall]]). A door is an opening whose type
   `openingKindOfType` classifies as `'door'`.
2. Only one level competes. Floors form levels by exact elevation. A floor's elevation is the
   elevation of its node, whose id is `floor:<floorId>`. A floor with no node is at grade. The grade
   is `input.gradeElevation`, or `DEFAULT_GRADE_ELEVATION_MM` (0, in `core/model/site.ts`) when the
   input has none. The levels are tried in this order: the levels at or above grade from the lowest
   up, then the levels below grade from the highest down. The first level with any exterior door
   is the only one whose doors compete.
3. On that level, a door of the `swing` or `pivot` family comes before a door of the `slide`,
   `fold`, or `cased` family. This is a rank and nothing more. Two hinged doors are equal on it, and
   so are two unhinged ones.
4. Then the widest door wins. Of two equally wide, the one whose outward direction is nearer
   plan-down wins, with the tolerance of 1e-9 on the dot product (`DIRECTION_TIE_TOLERANCE`). Then
   the opening id that sorts first as a string. Then the floor that comes first in document order,
   since opening ids repeat across floors. These ties are the ones ADR-0193 set, with the floor
   added at the end.
5. With no exterior door there is no entrance, and the front is plan-down (`PLAN_DOWN`).

The level order follows from one comparison of two elevations, `levelPrecedes`. The first level is
found over all the candidate doors (`entranceLevel`), and `beats` then ranks the doors of that
level alone. `beats` holds rules 3 and 4 except the floor tie.

### The order of the floors

The document order of floors is the order in which floor ids first appear in `input.walls`. That is
how `frontDirection` already walked the floors. `assembleSceneGraph` emits the walls floor by floor
in the order of `project.floors`, so for a graph derived from a project this is the document order.
A floor with no walls has no exterior door, so it never matters that such a floor is missing from
the order.

The floor tie needs no code of its own. The candidates are listed floor by floor in that order, and
the reduce keeps the current candidate when the next one does not beat it. Two doors that tie on
every other rule then leave the earlier floor's door in place.

### The entrance and the front

`entranceOf(input)` returns an `Entrance`:

```ts
interface Entrance {
  readonly door: OpeningSceneNode | undefined
  readonly source: 'marked' | 'guessed' | 'none'
  readonly front: PlanDirection
}
```

With an exterior door, `door` is the opening node of the guessed door, with its id and its
`floorId`, `source` is `'guessed'`, and `front` is the outward normal of the run that hosts it. With
none, `door` is undefined, `source` is `'none'`, and `front` is `PLAN_DOWN`. The type already holds
`'marked'`, the shape the first-view specification publishes, so the mark and the view build on a
fixed shape. When the guess landed, no code path returned `'marked'`. The mark does now (see the
extension at the end).

`frontDirection(input)` returns `entranceOf(input).front`. Its callers do not change: among them
`useFrontDirection` in the bridge and `openingEnvironmentFor` in
`core/environment/environment-state.ts`, which both pass a whole scene graph.
`core/index.ts` exports `entranceOf` and the type `Entrance` next to `frontDirection`.

`FrontDirectionInput` gains two optional fields, `nodes` and `gradeElevation`, taken from
`SceneGraph`. A whole scene graph already carries them. A hand-built input in a test can leave them
out.

### The door family

`doorFamilyOfType(typeId)` in `core/registries/opening-kind.ts` returns the `DoorFamily` of a
built-in opening type: `'swing'`, `'slide'`, `'fold'`, `'pivot'`, or `'cased'`. It returns
undefined for a window type or an unknown id. `DOOR_FAMILIES` lists the five families once, and
`openingKindOfType` classifies a door by the same set, so the two functions cannot disagree. `core/index.ts` does not
export `doorFamilyOfType`, because nothing outside `core/` calls it yet.

### The edits of the daylight specification

Section 8 of the first-view specification gives these edits of the daylight specification to this
record.

- Call 1 in its section 4.2. It said that the front is the entrance, else the widest exterior door,
  else plan-down. It now says that the front is the entrance, the widest hinged door in an outside
  wall of the ground floor, that the mark of #627 is to win over the guess, and that with no
  exterior door the front is plan-down.
- The `frontDirection` bullet in its section 6.1. It said that the function returns the widest
  exterior door until #627 adds the entrance. It now says that `frontDirection` returns the front of
  `entranceOf`, names the order of the guess, and says that the mark will win over it. The camera
  and the sun still call the same function.
- The item in its section 10 on how the widest exterior door is found and how two equal doors tie.
  It is now marked as settled by this record and by section 5.2 of the first-view specification.

## Consequences

- On a project whose widest exterior door slides, is upstairs, or is below grade, the front turns
  to the likely entrance, which is a hinged door of the ground floor when there is one. With no stored location and no stored north bearing, the
  implied north and the sample sun turn with it.
- For a site whose north is set, the opening time of ADR-0205 reads the same front, so it can move
  too.
- A wide pair of swing doors at the back still beats a narrower front door on the same level. A
  French door and a double door are 1626 mm wide by default, and a single swing door is 813 mm.
- The front still moves when a user adds a door, but only for a door that wins on the level and
  rank of the present one.
- A hand-built input with no floor nodes counts every floor at grade, so all its floors form one
  level. The existing case in which an upper-floor door beats a narrower ground-floor door keeps
  passing for that reason. For a derived graph of the same plan, the ground-floor door wins.
- No scene or story baseline moves. The harness fixture with a door has one single swing door on its
  only floor, and the opening-time journey draws a room with no door.
- The document does not change, and no schema revision or migration is needed.
- The guess does one more pass over the candidates, to find the level, and filters them once. Nobody
  measured the cost.

## Options not taken

- Rank the door family before the floor. A hinged door upstairs would then beat a sliding door on
  the ground floor. The owner rejected this order in answer 9, because a house whose only
  ground-floor door slides is entered through it.
- Break the floor tie by sorting floor ids. It needs no order from the graph, but floor ids carry no
  meaning, and the floor listed first in the project is the better guess. A test holds the
  difference: the first floor, `west-wing`, sorts after the second, `east-wing`.
- Take the floor order from `input.nodes` and fall back on the walls. That needs a second order
  source and a branch no test reaches, and for a derived graph the walls already give the document
  order.

## What stays open

- The mark on the door is built. See "Extension, 2026-11-21: the mark".
- The view from the front: the camera pose the first view opens on and its preset. That part also
  extends this record.
- `DIRECTION_TIE_TOLERANCE` is meant to move to the kernel tolerance module of #687.
- No rule was checked against drawn plans that could test it. The five projects of the test corpus (`tests/fixtures/projects/corpus/`)
  have one floor and single swing doors each.

## Evidence

On 2026-11-21, `pnpm exec vitest run` with the six files below and `--project unit` passed 48 tests.

- `core/scene/front-direction-floors.test.ts`. A graph with a basement at -2400, a ground floor at
  0, and an upper floor at 2700, with French doors of 1626 mm in the basement and upstairs and a
  single swing door of 813 mm on the ground floor. The ground-floor door wins. Without it, the upper
  door wins, although the basement door's id sorts first. With no nodes and no grade, all three
  floors are at grade and the id decides. With two levels above grade and none at the ground, the
  lowest wins. With two below grade, the highest wins. With the grade at 1000, the upper floor is
  the ground level.
- `core/scene/front-direction-families.test.ts`. A single swing door beats a wider sliding glass
  door. A pivot door beats a wider barn door. With no hinged door, a cased opening beats a narrower
  bifold door. A bypass door on the ground floor beats a single swing door upstairs. A pivot door
  beats a narrower single swing door, by width.
- `core/scene/entrance.test.ts`. `entranceOf`, read from the core barrel, names the guessed door
  with its id and floor, `'guessed'`, and its front. A room with no opening gives no door, `'none'`,
  and `PLAN_DOWN`. Two floors at one elevation, each with a door of the same id and width in its
  south wall, give the door of the first floor in the walls. `frontDirection` returns the front of
  `entranceOf` in each case.
- `core/registries/opening-kind.test.ts`. `doorFamilyOfType` gives the family of each built-in door
  type, and undefined for `double-hung-window` and an unknown id.
- `core/scene/front-direction.test.ts` and `core/scene/front-direction-partial-walls.test.ts`. The
  cases of ADR-0193 and ADR-0218 pass unchanged. The builders they share with the new files live in
  `core/scene/front-direction-test-support.ts`.

## References

- `docs/specs/2026-11-19-first-view-of-a-project.md`: the table "Decisions of the owner", section
  5.2, and section 8.
- `docs/plans/2026-11-19-first-view-of-a-project.md`: the entrance guess.
- `docs/specs/2026-11-15-daylight-and-shadow.md`: call 1, section 6.1, and section 10.
- #627: the entrance and the first view of a project. #687: the kernel tolerance module.
- [[ADR-0193-sample-daylight-for-a-project-with-no-site-location]]: the front direction and the
  implied north.
- [[ADR-0218-exterior-walls-follow-the-rooms-along-the-wall]]: the exterior runs that host an
  exterior door.
- [[ADR-0205-opening-time-chosen-for-the-house]]: the opening time that reads the front.
- [[ADR-0139-plan-to-world-orientation]]: the plan frame of the front.

## Extension, 2026-11-21: the mark

The owner marks one door as the main entrance, in the door inspector or from the command palette.
While a door is marked, `entranceOf` returns it with `source: 'marked'`, and `frontDirection`
follows it, so the sample sun does too. Clearing the mark brings back the guess above. The rules of
the guess do not change. The mark only wins over them. This is the second part of #627, and it
merges without waiting for #744 (answer 10 of the first-view specification).

### The field and its revision

`Opening` gains an optional field, `entrance?: true` (`core/model/types.ts`). It is `true` on the
one main entrance door and absent everywhere else. It is never written as `false` or `null`, and
clearing the mark removes the key. The schema publishes it as revision 2 of version 17, at
`schema/17/revision-2/vernacular.schema.json`, and `CURRENT_SCHEMA_REVISION` is 2. The field is
additive, so a file without it loads as it is, with no migration step ([[ADR-0178-schema-version-and-revision]]
sets the revision rule). The table of known keys and the generated validators carry it, and
the scene node of an opening copies it (`OpeningSceneNode.entrance`, set in `deriveOpeningNode`).

The mark sits on the door and not in a reference from the project, as call 1 of the first-view
specification says. A reference would need a floor id and an opening id, and it could name a door
that no longer exists. The field moves with its door and goes with it on delete, and an undo of the
delete brings both back.

### The first marked door wins

`entranceOf` looks for a marked door before it guesses. It takes the first marked door in document
order: the floors in the order of the walls, then the openings in the order of their floor. A mark
on an opening that is not a door is ignored. A marked door wins over the guess on any floor and on
any wall, also when the wall is not an exterior run, for example while the rooms are not closed yet.

### The front of a marked door

The front of a marked door is the outward normal of its exterior run. When the door is not on an
exterior run, the front is the side of the wall that faces away from the center of its floor. The
center is the middle of the bounds of every wall endpoint on that floor. Of the door's two normals,
the one with a positive dot product against the vector from that center to the door wins
(`awayFromWallCenter`). When the two normals are equal within `DIRECTION_TIE_TOLERANCE`, the one
nearer plan-down wins, and when they are equal on that too, the one nearer plan-right wins
(`tieBrokenNormal`).

### The two commands and the one-mark rule

Two commands in `core/commands/handlers/entrance-commands.ts` change the mark.

- `project/mark-main-entrance`, built by `markMainEntrance(floorId, openingId)`. It marks that door
  and removes the mark from every other opening on every floor. A target that is missing or is not
  a door changes nothing.
- `project/clear-main-entrance`, built by `clearMainEntrance()`. It removes the mark everywhere.

Both reassign the whole `floors` array, which is what the undo capture records, so one undo or one
redo restores every earlier mark. The rule that a project holds at most one marked door lives in
these handlers, in kind with [[ADR-0179-domain-rules-in-command-handlers]], and not in the shape of
the file. A test, `core/commands/entrance-every-command.test.ts`, runs every registered command
through the command samples on a project with a marked door and checks that at most one door is
marked afterward, and only on a door.

### What carries the mark

A copy and a paste, a new floor, a new opening, and a retype to a window never carry the mark. The
paste, add-opening, and add-floor handlers drop it, and `retypeOpening` drops it when the new type
is not a door. A retype from one door kind to another keeps it, and so do a move, a resize, and
every other command that rewrites an opening in place. All of these use one function,
`withoutEntranceMark` in `core/commands/entrance-rule.ts`.

### A file with several marks (open question 6, option a)

Open question 6 of the first-view specification is settled on option (a). Loading reports nothing.
The first marked door in document order wins everywhere, and the next command that marks or clears
the entrance removes the extra marks, so the file heals with its first edit of the mark. The file
passes the strict schema check, because a schema cannot say "at most one". Such a file can come from
an edit outside Vernacular, or from a build older than the mark, which keeps the unknown field and
copies it on paste. `countMarkedDoors(project)`, in the same file as `withoutEntranceMark`, counts
the marked doors and is ready for the load checks of the command layer. Option (b), a notice when
the project opens, would edit the document handle of the session layer, which is outside this
change. The issue left the choice to the builder, and the pull request body names it so the owner
can overrule it.

### The inspector and the palette

The opening inspector shows a "Main entrance" checkbox on a door and not on a window. The box is
ticked on the marked door. Ticking it dispatches `markMainEntrance`, and unticking it dispatches
`clearMainEntrance`. With no door marked, the door that the guess picks shows the box unticked,
with the line "Vernacular treats this door as the entrance until one is marked." Another door shows
neither the line nor a tick.

What the inspector shows comes from `entranceRoleOf(entrance, floorId, openingId)` in
`core/scene/entrance-role.ts`. It returns `'marked'`, `'guessed'`, or `'other'`, and it matches the
door by floor and id together, because opening ids repeat across floors. A copy of the marked door
on another floor shows no tick.

The command palette lists "Mark as main entrance" (editor command id `mark-main-entrance`) while
one door is selected and it is not already marked. Nothing, two items, a window, a wall, or the
marked door itself leave it disabled. It is `createEntranceCommands()` in
`editor/commands/entrance-commands.ts`, added to `createCommandSet`.

### Where the build departs from the plan

- The plan lists `bridge/react/use-entrance.ts`, a hook that memoizes `entranceOf`. It was not
  built. `SelectionInspector` returns early for each kind of selection, and a hook called after
  those returns would break the rules of hooks. `selectedOpeningContext` in
  `editor/plan/opening-inspector-context.ts` calls `entranceOf(graph)` instead, with the graph the
  inspector already holds. `bridge/react/use-front-direction.ts` is unchanged, because it already
  calls `frontDirection` on the whole scene graph and so follows the mark.
- The branch is `feat/mark-the-main-entrance`, not `feat/main-entrance-mark`.
- The names the specification left to the builder are the two command ids above, the scene node
  field `entrance`, and `countMarkedDoors`.

### The inspector edits the opening on the active floor

The work found a defect on `main` that the mark would have made worse. `singleSelectedOpening`, which
resolves the selected id to a raw opening, searched the floors in order and ignored the active
floor. A copied floor keeps its opening ids, so on the upper floor the inspector could show and
edit the opening of the ground floor, and the mark would have landed on the wrong door. It now lives
in `editor/plan/opening-inspector-context.ts`, takes the active floor id, and searches the active
floor first and then the other floors in order. A `fix:` commit of its own covers it.

One limit stays. A door that was selected on another floor stays selected, and so markable, after
a floor switch, because the lookup falls back to the other floors. The inspector behaves the same
way today. This is a known limit and not a decision to keep it.
`openingWallHasOneRoomSide` has the same shape of problem, since it finds the opening node by id
alone over the whole graph. It is not fixed here.

### Consequences of the mark

- A marked door turns the front, and with no stored location or north bearing the implied north and
  the sample sun turn with it. Clearing the mark returns them to the guess.
- A marked interior door now wins, so the case "a plan whose only door is interior" of ADR-0193
  gives that door's front and not plan-down once the door is marked.
- The story baseline of the default opening inspector moves with the checkbox, and the two new
  stories, "Marked entrance" and "Guessed entrance", get baselines on CI. No scene harness
  baseline moves.
- The mark survives a reload, because it is part of the document. One
  journey, `e2e/tests/journeys/mark-main-entrance.spec.ts`, marks a door, reloads, and finds the box
  still ticked.
