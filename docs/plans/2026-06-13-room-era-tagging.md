# Room era tagging (period and style overrides)

Old-house-vocabulary track. Closes the "era tagging UI" scoped story for the room level.

## The gap

Era is two axes, period and style, that resolve through a hierarchy
(`room.override ?? floor.override ?? project default`). The registries and commands exist but the room
overrides are unreachable:

- `builtinPeriods` (`core/registries/periods.ts`) ships Colonial through Contemporary with date ranges.
- `builtinStyles` (`core/registries/styles.ts`) ships academic high styles and vernacular folk forms.
- `RoomOverride.periodOverride` (a `PeriodId`) and `RoomOverride.styleOverride` (a `StyleTag` of
  `{ styleId, vernacular? }`) hold the room-level values; `setRoomPeriod` and `setRoomStyle` exist and
  are registered.

There is no UI, so a room cannot be tagged with a period or style.

## Design decisions (forks decided)

1. **Two registry-backed selects, mirroring the purpose editor.** `RoomPeriodEditor` lists
   `builtinPeriods` by display name; `RoomStyleEditor` lists `builtinStyles` by display name. Each has a
   leading "Inherit" option (value `""`) that clears the override, so the room falls back to the floor
   or project default. They read the current value from the room's override and dispatch
   `setRoomPeriod` / `setRoomStyle` on change. This is a pure editor slice over existing commands and
   registries; no core or scene-graph change.
2. **Style dispatches `{ styleId }`; the vernacular modifier is deferred.** `StyleTag` carries an
   optional `vernacular` flag meaningful only for academic styles with a vernacular variant. The MVP
   select picks the base style and dispatches `{ styleId: value }`, reading the current value from
   `styleOverride.styleId`. A vernacular-variant control (enabled only when the chosen style declares
   `hasVernacularVariant`) is a noted follow-up.
3. **Group the room metadata editors.** The room inspector is at the per-function line cap, so the
   purpose, sub-purpose, period, and style editors move into a small `RoomMetadataEditors` component
   (inside `inspector.tsx`) that takes the room's `RoomOverride` and reads each field from it. The
   inspector looks up the override once and passes it down. No behavior change for the existing purpose
   and sub-purpose editors.
4. **Flat option lists, display name only.** Consistent with the purpose editor: no academic/vernacular
   optgroups and no period date-range suffix in this slice. Both are noted niceties the registries
   already carry data for.

No new ADR or spec change: this surfaces existing registries through existing commands. The wider
vocabulary work (new vocabulary, curved openings, trim data, construction profiles) stays scoped.

## RGB cycles

- **A (period select).** RED: `RoomPeriodEditor` renders a labelled "Period" select listing the builtin
  periods plus an "Inherit" option, seeded from the `period` prop, dispatching `setRoomPeriod(roomKey,
id-or-undefined)` on change. GREEN: implement the component, extract `RoomMetadataEditors` (moving the
  purpose and sub-purpose editors into it), and render the period editor there. BLUE: review + refactor.
- **B (style select).** RED: `RoomStyleEditor` renders a labelled "Style" select listing the builtin
  styles plus an "Inherit" option, seeded from `style?.styleId`, dispatching `setRoomStyle(roomKey,
{styleId}-or-undefined)` on change. GREEN: implement the component and add it to `RoomMetadataEditors`.
  BLUE: review + refactor.

## Verification

Full local gate: `pnpm typecheck && lint && format:check && test && integration:audit && build`, plus
`pnpm rgb:audit` clean (`origin/main..HEAD`) and the chromium e2e tree after a rebuild. No visual
baseline changes (DOM inspector, not canvas).

## Deferred

- The vernacular-variant style modifier.
- Academic / vernacular style grouping and the period date-range hint (the registry carries both).
- Showing the resolved inherited period and style (from `core/architecture-era/`) when a room has no
  override; this slice shows "Inherit" rather than the resolved value.
- Floor-level and project-level era editing surfaces.
