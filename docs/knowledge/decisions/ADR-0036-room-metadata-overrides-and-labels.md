---
slug: decisions/ADR-0036-room-metadata-overrides-and-labels
title: 'ADR-0036: Room metadata as a top-level overrides slice keyed by a stable room key, with Canvas labels'
type: decision
tags:
  [
    architecture,
    core,
    topology,
    rooms,
    overrides,
    commands,
    undo-redo,
    scene-graph,
    plan,
    rendering,
    units,
    migration,
  ]
related:
  [
    decisions/ADR-0026-room-derivation-planar-face-enumeration,
    decisions/ADR-0005-command-pattern-framework-captured-inverse,
    decisions/ADR-0018-scene-graph-derivation,
    decisions/ADR-0021-2d-plan-rendering-interaction,
    decisions/ADR-0027-units-module-targets-millimeter-storage,
    decisions/ADR-0029-schema-registry-migration-framework,
    decisions/ADR-0035-wall-editing-endpoint-move-and-thickness,
  ]
sourceFiles:
  [
    docs/specs/2026-06-01-vernacular-design.md,
    docs/plans/2026-06-06-room-naming-and-labeling.md,
    core/model/types.ts,
    core/topology/rooms.ts,
    core/commands/handlers/room-commands.ts,
    core/scene/scene-graph.ts,
    core/scene/scene-graph-deriver.ts,
    core/units/format-area.ts,
    core/migrations/schema/add-room-overrides.ts,
    editor/plan/room-label.ts,
    editor/plan/draw-plan.ts,
    editor/plan/room-name-editor.tsx,
  ]
status: current
updated: 2026-06-06
---

# ADR-0036: Room metadata as a top-level overrides slice keyed by a stable room key, with Canvas labels

## Status

Accepted, landed. Rooms stay a derived projection of wall topology (ADR-0026), but
a user can now name a room and override its derived polygon, and the 2D plan paints
a room label (the name plus the formatted area). The stable key, the override store,
the merge, the two commands, the override-aware deriver, and the label content and
drawing are implemented and unit-tested across `core/topology/`, `core/commands/`,
`core/scene/`, `core/units/`, `core/migrations/schema/`, and `editor/plan/`. The
design specification (section 3.2, "Rooms are derived, not authored. Users name and
tag rooms; geometry comes from walls. A `customPolygon` override exists for cases
where wall topology can't infer a room") remains authoritative; this ADR records the
implementation interpretation and the additive-top-level-slice and migration
decisions. No `docs/specs/` change accompanies this work: it implements behavior the
spec already mandates.

## Context

Room geometry is derived and never stored (ADR-0026): `deriveRooms(walls)` enumerates
the bounded faces of the wall graph and gives each room a stable id built from its
sorted bounding wall ids. The deferral list in ADR-0026 reserved the `customPolygon`
override and room naming for a later slice. This is that slice.

The central design problem is not the naming UI but **where room metadata lives and
how it is keyed to a room stably across edits**. A room has no stored identity; it is
recomputed on demand. So a stored name or polygon override must be keyed by something
the derivation reproduces deterministically, and that store must be reachable by the
undoable command path.

Two existing invariants shape the answer. First, all mutation flows through
`dispatch(command)` with a framework-captured inverse (ADR-0005), and the
inverse-capture proxy is ROOT-LEVEL: it records only the root project's own top-level
keys. Second, the scene-graph deriver memoizes per-floor room nodes keyed by the
`Floor` reference (ADR-0018, ADR-0026), and a name change leaves the floor reference
unchanged.

## Decision

### The stable room key is single-sourced with `Room.id`

`core/topology/rooms.ts` exposes `roomKey(room)`, the sorted bounding-wall-id string
joined by `-`, and a module constant `ROOM_ID_PREFIX = 'room:'`. `deriveRooms` builds
each `Room.id` as `ROOM_ID_PREFIX + roomKey({ wallIds })`, so the key the override map
uses is identical to the `room:`-stripped derived id by construction, not by
coincidence. `roomKey` takes `Pick<Room, 'wallIds'>` so it can key off a bare wall-id
set during id construction. The equivalence `room.id === ROOM_ID_PREFIX +
roomKey(room)` is pinned by the topology tests, so the key cannot silently diverge
from the id. The unprefixed key is used by the override map and the command params;
the `room:` prefix stays on `Room.id` and `RoomSceneNode.id` so selection and the
override key stay aligned.

### A new additive top-level `Project.roomOverrides` slice

`core/model/types.ts` adds `interface RoomOverride { name?: string; customPolygon?:
Point[] }` and an optional `Project.roomOverrides?: Record<string, RoomOverride>`, a
sibling of `meta` and `floors`, keyed by `roomKey(room)`. It is deliberately a NEW
TOP-LEVEL slice rather than a field nested under a floor or a room, and that placement
is the load-bearing decision of this slice. The inverse-capture proxy traps `set` and
`deleteProperty` on the project root only (ADR-0005); a nested store would mutate
inside an object the shallow proxy never sees, so the change would go unrecorded and
therefore be non-undoable. Making room metadata its own top-level key is what lets an
undoable command reassign it whole and have the proxy record the change. (Rooms have
no stored object to hang a field on in any case, which independently rules out a
per-room store.)

### Two undoable commands and the `applyRoomOverrides` merge

`core/commands/handlers/room-commands.ts` adds `setRoomName(roomKey, name)` and
`setRoomCustomPolygon(roomKey, polygon)`. Both handlers go through one private helper,
`mergeRoomOverride(state, roomKey, patch)`, which reassigns the whole
`state.roomOverrides` slice to a new map with a new override object for the target
key, spreading any existing entry under the patch so the entry's other field survives
(setting a name keeps an existing custom polygon and vice versa). The handlers author
no inverse; the dispatcher captures it, and because the reassignment is a root-level
key change the captured inverse restores the prior `roomOverrides` reference, including
back to an absent map (undoing the first name on a project removes the slice entirely).
This is the same immutable whole-slice reassignment convention the project and wall
commands follow (ADR-0005).

`core/topology/rooms.ts` adds the pure merge `applyRoomOverrides(rooms, overrides)`:
for each derived room, look up its override by `roomKey`; attach a stored `name`, and
when a `customPolygon` is present replace `polygon` and recompute `area` as
`Math.abs(polygonArea(customPolygon))` (sign-normalized the way `deriveRooms`
produces non-negative areas). A room with no override is returned unchanged; an
`undefined` map returns the input unchanged; iteration is over the derived rooms, so a
stale override key that matches no current room never synthesizes a phantom room. The
command stores, the deriver applies; the merge happens in exactly one place.

### The override-aware room deriver re-keys its cache

`deriveRoomNodesForFloor(floor, overrides?)` (`core/scene/scene-graph.ts`) runs
`applyRoomOverrides(deriveRooms(floor.walls), overrides)` and projects each merged
room to a `RoomSceneNode`, which gains an optional `name?`. The node id is unchanged
(the derived `room:<sorted-wall-ids>`), so the override key and selection stay aligned.

The subtle interaction is in the memoized deriver (`scene-graph-deriver.ts`). The
slice-1 room cache was a `WeakMap<Floor, RoomSceneNode[]>`, but a name or polygon
override changes the room nodes while the floor reference is unchanged, so keying on
the floor alone would serve stale nodes. The cache is now
`WeakMap<Floor, { overrides; nodes }>`, and a cache hit requires both the same `Floor`
reference AND the same `roomOverrides` reference; a new top-level `roomOverrides` map
(which every override command produces) misses the cache and rebuilds that floor's
room nodes. The floor and wall caches are untouched, so their memoization tests stay
green. This composes with ADR-0018: an override command produces a new top-level slice
reference, which is exactly the dirty signal the reference-keyed cache needs.

### Canvas `fillText` labels through the narrow plan-drawing seam

`editor/plan/room-label.ts` adds the pure `roomLabelContent(room, options)`: the name
line (or `undefined`), the area line `formatArea(room.area, preferences)`, and a
world-space `anchor` at the room centroid. `editor/plan/draw-plan.ts` adds
`drawRoomLabel`, gated by an optional `roomLabels?: RoomLabelOptions` on
`DrawPlanOptions`, painting one or two lines centered at the projected centroid (the
area drops below a present name). The label uses ONLY members already on
`PlanDrawingContext` (`font`, `textAlign`, `textBaseline`, `fillStyle`, `fillText`),
so the seam does not grow and every existing recording fake stays a valid context. This
is the worked example of the ADR-0021 guidance to reach for the narrow Canvas seam, not
the full DOM type; ADR-0026 grew the seam by one `closePath` for room fills, and this
slice grows it by nothing.

`core/units/format-area.ts` adds `formatArea(squareMillimeters, preferences)`,
reusing the slice-2 length constants squared (`MM_PER_METER ** 2`, `MM_PER_FOOT ** 2`,
ADR-0027) rather than introducing new conversion factors, and the shared rounding
helper, branching on `preferences.system` to emit `m²` or `ft²` with the leading-space
symbol convention.

### The additive schema bump (v1 to v2) and its no-op migration

`core/model/factories.ts` bumps `CURRENT_SCHEMA_VERSION` from 1 to 2, and
`core/migrations/schema/add-room-overrides.ts` registers a `SchemaMigration` with
`from: 1` whose `migrate` returns the document unchanged. Because `roomOverrides` is
optional and `applyRoomOverrides` treats an absent map identically to an empty one, the
migration is structural and effectively a no-op: it invents no overrides and never
touches `meta.schemaVersion` (the migration orchestrator advances the version,
ADR-0029). The migration future-proofs the chain and lets the migration framework
round-trip; the additive optional field keeps every existing `Project` literal and
factory output type-checking.

## Why this approach

- **A single-sourced key is what makes the store reachable from the derivation.** The
  override map and the derived room agree on their key because both compute it through
  `roomKey`, and `Room.id` is built from the same function. There is no second place to
  keep in sync.
- **Top-level placement is forced by the inverse-capture proxy, not chosen for
  convenience.** The shallow root proxy records only the project's own top-level keys
  (ADR-0005), so an undoable room-metadata store must be a top-level `Project` slice. A
  nested store would silently break undo.
- **Re-keying the room cache on the overrides reference reuses the existing dirty
  signal.** No new dirty-tracking mechanism was needed; an override command produces a
  new top-level map reference, the same immutable-update discipline ADR-0018 already
  relies on, and the cache simply checks that reference alongside the floor.
- **The label needs no seam growth.** Painting text reuses the `font`/`fillText`
  members the seam already carried, keeping the ADR-0021 "extend the narrow interface
  only when forced" discipline intact.

## The room key is provisional under wall editing

The override key is the sorted bounding-wall-id set, which is stable across pure
re-derivation but **interacts with wall editing (ADR-0035)**: moving an endpoint can
reshape a room without changing its bounding-wall set (the name survives), while adding
or removing a bounding wall changes the set, so the room takes a new key and its stored
name or polygon is orphaned (the derived room reverts to no name and the centerline
polygon). The orphaned entry stays in `roomOverrides` harmlessly, since
`applyRoomOverrides` ignores keys that match no current room. Finalizing the keying
(for example a stable per-room identifier assigned on first naming, plus
orphan-reconciliation) is a follow-up once wall editing's effect on room identity is
observable. `roomKey` is the single seam that follow-up changes.

## Deferred refinements and explicit non-goals

- **Thickness-aware (clear-area) labels.** The label area is the slice-1 centerline
  shoelace area until the dimensions-and-thickness-aware-area slice introduces
  interior-inset clear-area polygons. The label pipeline reads `RoomSceneNode.area` and
  `formatArea` is independent of how that number is produced, so labels update with no
  labeling change when that slice lands.
- **DOM-overlay labels and label-collision handling.** Labels paint on the Canvas with
  `fillText` at the room centroid, consistent with the slice-3/4/5 decision to draw
  plan chrome on the Canvas (ADR-0021). Automatic placement to avoid overlap, label
  dragging, and auto-hide are deferred; the centroid `anchor` is the seam a refinement
  adjusts.
- **Room purpose, sub-purpose, era override, and tags.** This slice ships only the
  user-entered name and the custom polygon. The purpose/era/tag vocabulary and its
  registry land with the old-house architectural-vocabulary milestone; `RoomOverride`
  is shaped so those fields are additive there without another top-level slice.
- **The interactive custom-polygon drawing tool.** The `setRoomCustomPolygon` command,
  the merge rule, and the override-honoring rendering ship now; the free-form
  polygon-drawing tool that dispatches the same command is follow-on wiring.
- **Durable persistence of overrides.** The additive field and the no-op migration land
  here so the in-memory model and the command/undo path are complete and testable; the
  durable store round-trip is owned by the project-stores wiring (ADR-0003, ADR-0030),
  where the schema bump folds into the coordinated shared-schema change set.

## Alternatives considered

- **Store the name and polygon on a nested per-floor or per-room field.** Rejected:
  the inverse-capture proxy records only top-level project keys (ADR-0005), so a nested
  edit would be unrecorded and non-undoable, and a derived room has no stored object to
  carry the field.
- **Hand-author the command inverses.** Unnecessary and error-prone; the whole-slice
  reassignment lets the dispatcher capture the inverse, the same convention every other
  handler uses.
- **Key the override map by a fresh per-room UUID assigned on first naming.** More
  robust under wall editing, but it needs an identifier-assignment-and-reconciliation
  mechanism that depends on observing how wall editing reshapes rooms. Deferred behind
  the `roomKey` seam until that is observable.
- **Grow `PlanDrawingContext` toward the full Canvas 2D type for text.** Rejected: the
  seam already carried `font`/`fillText`, so no growth was needed, keeping the
  testability discipline of ADR-0021.

## References

- Design specification, section 3.2 ("Rooms are derived, not authored") and section
  6.11 ("2D plan: Canvas `fillText` for dimensions and labels"). This ADR records the
  interpretation; the spec is authoritative.
- Implementation plan: `docs/plans/2026-06-06-room-naming-and-labeling.md`.
- ADR-0026 (room derivation; this slice completes its `customPolygon`-and-naming
  deferral and reuses `roomKey`/`ROOM_ID_PREFIX`).
- ADR-0005 (command pattern and the root-level inverse-capture proxy that forces
  `roomOverrides` to be a top-level slice and captures the command inverses).
- ADR-0018 (scene-graph derivation; the room cache re-keys on the `roomOverrides`
  reference alongside the `Floor` reference).
- ADR-0021 (the narrow Canvas seam the labels paint through without growth).
- ADR-0027 (the `core/units/` length constants `formatArea` reuses, squared).
- ADR-0029 (the migration framework the additive v1-to-v2 no-op migration registers
  into).
- ADR-0035 (wall editing, whose effect on room identity makes the `roomKey` keying
  provisional).
