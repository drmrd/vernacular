# Plan: precision snapping panel and editor snap preferences

Slice 8 of the editor-experience makeover. It gives a power user per-kind control
over snapping: a master on and off, a toggle for each running snap kind including
the angle lock, a configurable catch radius, a status-bar readout of the snap that
is engaging, and a panel that gathers the toggles. Every toggle is also a command
in the registry, reachable from a keybinding and the command palette. The decision
and its rationale are in ADR-0059. There is no journey-coverage flip.

The behavior cycles are red-green-blue rounds. The thin wiring steps that only
connect existing pieces land as `build:` or Infrastructure commits, which the cycle
audit exempts. Every green closes with a blue marker before the next red.

## Background already verified

- `snapPoint(cursor, context)` in `editor/plan/snap.ts` runs `pointSetSnap` (trace,
  then open-run corners) then `featureSnap` (endpoint, intersection, midpoint, edge,
  angle, perpendicular, parallel, grid). `SnapContext` carries `walls`,
  `gridSpacingMm`, `toleranceMm`, `origin`, `tracePoints`, `openVertices`,
  `freeAngle`.
- `useSnapping` in `editor/plan/use-snapping.ts` builds the context, hardcoding
  `DEFAULT_SNAP_GRID_MM` and `toleranceMm = SNAP_PIXEL_TOLERANCE / viewport.scale`.
- The editor command model is `EditorCommand` in `editor/commands/command.ts`;
  feature command sets are built by a `createXxxCommands(controls)` factory and
  merged at the `KeybindingLayer` and `CommandPalette` call sites in
  `editor/shell/editor-shell.tsx` (see `createViewCommands`).
- Selection lives in a bridge-owned store under `bridge/selection/`, the model the
  snap-preferences store mirrors.
- The shell mounts panels through `PanelSlot` with a slot id from
  `editor/shell/shell-panel-slots.ts`.

## Cycle 1: the snap-preferences model

Red, green, blue. Pure, no React.

- Allowed files: `editor/plan/snap-preferences.ts`, `editor/plan/snap-preferences.test.ts`.
- `SnapPreferences` = a master `enabled: boolean`, a per-kind `kinds` map over the
  running snap kinds (endpoint, intersection, midpoint, edge, angle, perpendicular,
  parallel, grid), and a `pixelRadius: number`. `DEFAULT_SNAP_PREFERENCES` has the
  master on, every kind on, and the radius at the current `SNAP_PIXEL_TOLERANCE`.
  Pure helpers: `toggleSnapKind`, `setSnapEnabled`, `setSnapPixelRadius`, and an
  `isSnapKindEnabled(prefs, kind)` reader. `trace` is not a toggle (it is a draw aid).
- Blue: extract any shared shape; keep helpers small.

## Cycle 2: per-kind gating in the pure snap module

Red, green, blue. Pure.

- Allowed files: `editor/plan/snap.ts`, `editor/plan/snap.test.ts`.
- `SnapContext` gains optional `enabled?: boolean` (default true) and a set of
  disabled kinds. Each step in `pointSetSnap`/`featureSnap` is skipped when its kind
  is disabled; `snapPoint` returns null when `enabled` is false. With the angle kind
  disabled, perpendicular and parallel resolve instead. The existing tests that set
  no preferences keep passing unchanged.
- Blue: keep the gating guards uniform; extract a small `isEnabled(kind)` closure if
  it reads cleaner.

## Cycle 3: the bridge snap-preferences store

Red, green, blue.

- Allowed files: `bridge/snap-preferences/` (new store module plus its test), and
  `bridge/index.ts` for the export.
- A store holding `SnapPreferences` with `get`, `subscribe`, and mutators that wrap
  the pure helpers, loading from and saving to `localStorage` under a namespaced key,
  defaulting and tolerating a missing or malformed value. Add a `useSnapPreferences`
  hook and a provider mirroring the selection store.
- Blue: marker or small tidy.

## Cycle 4: feed the preferences into the live snap context

Infrastructure wiring, committed as `build:` (cycle-audit exempt).

- Allowed files: `editor/plan/use-snapping.ts` and the plan controller seam that
  supplies its inputs.
- `buildContext` reads the snap preferences (the master flag, the disabled-kind set,
  and `toleranceMm = pixelRadius / viewport.scale`) and passes them through. A small
  focused test covers the radius and the disabled-kind pass-through if it is not
  already covered by Cycle 2.

## Cycle 5: the snap toggle commands

Red, green, blue.

- Allowed files: `editor/commands/snap-commands.ts`, `editor/commands/snap-commands.test.ts`,
  and the command index export.
- `createSnapCommands(controls)` returns the master toggle, a toggle per kind, and
  radius increase and decrease commands, each with an id, a palette title, and a
  keybinding, each running a store mutation. Merge them at the `KeybindingLayer` and
  `CommandPalette` sites (that merge edit is `build:`).
- Blue: marker or tidy.

## Cycle 6: the engaged-snap status readout

Red, green, blue.

- Allowed files: the status readout component and its test (a small component under
  `editor/`), plus the shell mount (the shell edit is `build:`).
- Show the engaging snap kind from the live snap result, for example `Snap: endpoint`,
  and a quiet state when nothing is snapping or the master is off, as a `role="status"`
  region.
- Blue: marker or tidy.

## Cycle 7: the precision snapping panel

Red, green, blue.

- Allowed files: the panel component and its test under `editor/`, plus the shell
  slot mount (the shell edit and the slot id constant are `build:`).
- The panel shows the master toggle, a labeled checkbox per kind with `aria-pressed`
  or a native checkbox, and the radius input, each reading and writing the store.
- Blue: marker or tidy.

## Gate before the pull request

- `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm integration:audit && pnpm build`.
- `pnpm rgb:audit --range "origin/main..HEAD"` clean.
- Build, then the full chromium e2e tree (the existing snap journeys must stay green
  under the default preferences).
- No schema change, so `pnpm schema:check` is not required.
