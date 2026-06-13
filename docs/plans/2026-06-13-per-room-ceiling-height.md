# Per-room ceiling height

Structure-and-multi-floor track. Closes the roadmap "Per-room ceiling height" scoped story.

## The gap

The per-room ceiling-height override is already half-built and currently a dead write:

- `RoomOverride.ceilingHeight?` exists on the model (`core/model/types.ts`).
- `setRoomCeilingHeight` / `SET_ROOM_CEILING_HEIGHT` exists and is registered
  (`core/commands/handlers/room-commands.ts`); it stores `RoomOverride.ceilingHeight`.
- The 3D ceiling already reads `ceilingHeight(node)` (`core/scene/ceiling-height.ts`,
  consumed by the room-shell builder), falling back to `DEFAULT_CEILING_HEIGHT_MM`.

But the stored override never reaches the derived node:

- `mergeOverride` (`core/topology/rooms.ts`) carries `name` and `customPolygon`, not `ceilingHeight`.
- `deriveRoomNodesForFloor` (`core/scene/scene-graph.ts`) hardcodes
  `ceilingHeight: floor.defaultCeilingHeight`, ignoring any override.

So a user can dispatch the command but nothing changes in 2D or 3D. There is also no UI to set it
(only `setRoomName` has an inspector editor today).

## Design decisions (forks decided)

1. **Thread the override through the topology `Room`, parallel to `name`.** Add optional
   `ceilingHeight?: number` to the `Room` topology type, have `mergeOverride` carry
   `override.ceilingHeight`, and have `deriveRoomNodesForFloor` resolve
   `room.ceilingHeight ?? floor.defaultCeilingHeight`. This keeps all override merging in one place
   (`mergeOverride`) and mirrors how `name` already flows override -> Room -> RoomSceneNode. The
   derived node keeps carrying a concrete resolved height (unchanged shape; the accessor's
   `DEFAULT_CEILING_HEIGHT_MM` fallback stays the final safety net).
2. **Resolved value on the node, not the raw override.** The node stores the resolved height
   (override when present, else the floor default), matching today's behavior where the node always
   holds a number. The 3D builder needs no change; the override simply moves the ceiling.
3. **Unit-aware inspector input mirroring `WallThicknessEditor`.** A new `RoomCeilingHeightEditor`
   (`editor/plan/room-ceiling-height-editor.tsx`) is a length input (parse/format via the slice-2
   unit helpers, assume-unit by system) that dispatches `setRoomCeilingHeight(roomKey, parsed)`.
   Shown inside `RoomInspector` next to the name editor, keyed to remount on selection / value
   change, seeded from the node's resolved `ceilingHeight`.

No new ADR or spec change: this completes a scoped story using an existing model field, an existing
registered command, and an existing 3D consumer. No architectural decision is introduced.

## RGB cycles

- **A (core wiring).** RED: `deriveRoomNodesForFloor` applies a `RoomOverride.ceilingHeight` to the
  derived `RoomSceneNode.ceilingHeight`, and falls back to `floor.defaultCeilingHeight` with no
  override. GREEN: add `Room.ceilingHeight`, carry it in `mergeOverride`, resolve it in the deriver.
  BLUE: review + refactor.
- **B (inspector input).** RED: `RoomCeilingHeightEditor` renders a unit-aware input seeded with the
  formatted height and, on Enter, dispatches `setRoomCeilingHeight(roomKey, parsedHeight)`; an
  unparseable entry dispatches nothing. GREEN: implement the component and wire it into `RoomInspector`
  (the inspector render is coverage-excluded glue folded into this GREEN). BLUE: review + refactor.

## Verification

Full local gate: `pnpm typecheck && lint && format:check && test && integration:audit && build`, plus
`pnpm rgb:audit` clean (`main..HEAD`) and the chromium e2e tree after a rebuild. The 3D ceiling moves
with the override (the room-shell builder already reads `ceilingHeight(node)`); a manual check or an
optional painted/lit baseline can confirm by eye, but no new baseline is required since no harness
fixture sets a per-room override.

## Deferrals

- The purpose / sub-purpose / period / style room-metadata commands also exist unsurfaced. Their
  inspector UI is old-house-vocabulary work (domain decisions) and is a separate later slice.
- `RoomOverride.ceilingHeight` is a per-room override of the floor default; a project-level default
  ceiling-height preference and floor-level editing stay as-is.
