# Room purpose and sub-purpose inspector

Old-house-vocabulary track. Closes the "surfacing shipped vocabulary" scoped story for room purpose.

## The gap

The room-purpose vocabulary is fully built but unreachable from the editor:

- `builtinRoomPurposes` (`core/registries/room-purposes.ts`) ships a rich registry: modern rooms plus
  historic reception, service, and transitional rooms (parlor, scullery, butler's pantry, sleeping
  porch, and so on). This is the product's old-house identity content.
- `RoomOverride.purpose` (a registry id) and `RoomOverride.subPurpose` (free text) exist on the model.
- `setRoomPurpose` / `setRoomSubPurpose` commands exist and are registered.

There is no UI to set either, so none of the vocabulary is reachable.

## Design decisions (forks decided)

1. **Read the current value from the override map, not the scene graph.** Purpose and sub-purpose are
   editorial metadata that no renderer consumes, so they stay on `RoomOverride` and the inspector reads
   `project.roomOverrides[roomKey]` directly. (This is the opposite of ceiling height, which is
   render-relevant and was threaded through the scene node.) No core or scene-graph change is needed;
   this is a pure editor slice over existing commands.
2. **Purpose is a registry-backed `<select>`.** It mirrors the opening-type chooser: one option per
   `builtinRoomPurposes` entry (text from the entry's `displayName['en-US']`), plus a leading
   "Untagged" option for the absent value. Selecting "Untagged" dispatches `setRoomPurpose(roomKey,
undefined)` to clear; any other value dispatches the chosen id. A `<select>` (not radios) suits the
   long list, unlike the short finish picker.
3. **Sub-purpose is a free-text input** mirroring the room-name editor: seeded from `subPurpose`,
   committing on Enter, and an empty entry clears it to `undefined`.
4. **Both render in the room inspector** beneath the name and ceiling-height editors. The inspector
   computes the room key once and looks up the override, passing the current purpose and sub-purpose
   down.

No new ADR or spec change: this surfaces an existing registry through existing commands. The wider
old-house-vocabulary decisions (new vocabulary, era tagging UI for period and style, curved openings,
trim data) stay scoped and are separate later slices.

## RGB cycles

- **A (purpose select).** RED: `RoomPurposeEditor` renders a labelled select listing the builtin room
  purposes by display name plus an untagged option, seeded from the `purpose` prop, and dispatches
  `setRoomPurpose(roomKey, id-or-undefined)` on change. GREEN: implement the component and wire it into
  the room inspector (reading `override.purpose`). BLUE: review + refactor.
- **B (sub-purpose input).** RED: `RoomSubPurposeEditor` renders a text input seeded from `subPurpose`
  and dispatches `setRoomSubPurpose(roomKey, text-or-undefined)` on Enter, clearing on an empty entry.
  GREEN: implement the component and wire it into the room inspector (reading `override.subPurpose`).
  BLUE: review + refactor.

## Verification

Full local gate: `pnpm typecheck && lint && format:check && test && integration:audit && build`, plus
`pnpm rgb:audit` clean (`origin/main..HEAD`) and the chromium e2e tree after a rebuild. No visual
baseline changes (the inspector is DOM, not canvas).

## Deferred

- Era tagging UI (period and style overrides) reads the periods and styles registries the same way and
  is the next vocabulary slice.
- Period and style inheritance resolution (floor or project default) already exists in
  `core/architecture-era/`; surfacing the resolved value is part of the era-tagging slice.
- Locale display: the registry carries `displayName` per locale; the MVP shows en-US only.
