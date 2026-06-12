---
slug: decisions/ADR-0059-precision-snapping-preferences
title: 'ADR-0059: Precision snapping preferences, running-snap toggles, and the snap panel'
type: decision
tags: [editor, snapping, preferences, commands, keybindings, accessibility, bridge]
related:
  [
    decisions/ADR-0033-drawing-snap-model,
    decisions/ADR-0053-along-wall-and-intersection-snaps,
    decisions/ADR-0054-smart-angle-snap,
    decisions/ADR-0050-command-registry-keybindings-and-palette,
    decisions/ADR-0020-bridge-owned-selection-outside-undo,
  ]
sourceFiles:
  [
    docs/specs/2026-06-10-editor-experience-makeover.md,
    editor/plan/snap.ts,
    editor/plan/snap-preferences.ts,
    editor/plan/use-snapping.ts,
    bridge/snap-preferences/snap-preferences-store.ts,
    editor/commands/snap-commands.ts,
    editor/shell/editor-shell.tsx,
  ]
status: current
updated: 2026-06-12
---

# ADR-0059: Precision snapping preferences, running-snap toggles, and the snap panel

## Status

Accepted. Implemented across `editor/plan/snap.ts` (per-kind gating), a pure
`editor/plan/snap-preferences.ts` model, a bridge-owned store, editor toggle
commands, a status-bar readout, and a precision panel. Slice 8 of the
editor-experience makeover. No journey-coverage capability is added; this is a
power-user surface over snapping that does not change the default drawing
behavior.

## Context

Snapping grew over slices 7d, 7e, and 7f into a fixed chain: trace, then an open
run's corners, then endpoint, intersection, midpoint, edge, angle, perpendicular,
parallel, and grid. The angle lock from ADR-0054 sits above perpendicular and
parallel and supersedes them whenever it resolves, with a hold-to-free modifier as
the only escape. A power user drawing a period plan needs finer control: turn off
the snaps that fight a particular task, widen or tighten the catch radius, and see
which snap is actually engaging. ADR-0054 deliberately left the standing of
perpendicular and parallel for this slice to settle.

Two design questions had to be answered. Where do these preferences live, and how
does a user flip them. The project already persists unit preferences in
`ProjectMeta` through the dispatched `setUnits` command, so the document was one
option. The command registry from ADR-0050 already routes keyboard and palette
actions, so the toggles had a natural home there.

## Decision

### Snap preferences are editor-level, not document data

Snap preferences are per-user tool configuration, not part of the drawing. They are
held in a bridge-owned store and persisted to `localStorage`, the same place a user
would expect their editor settings to survive a reload. This follows ADR-0020,
which already keeps selection in the bridge outside the command and undo system:
snap preferences are editor state of the same kind, so flipping a snap is not an
undoable document edit and does not travel inside a saved `.building` file. The
store loads defaults when storage is empty or unavailable, the same defensive
posture the storage-capability detection takes elsewhere.

The pure model lives in `editor/plan/snap-preferences.ts`: a `SnapPreferences`
value of a master `enabled` flag, a per-kind enabled map, and a pixel catch radius,
plus pure update helpers and an `isSnapKindEnabled` reader. The defaults preserve
today's behavior exactly. The master is on, every running snap kind is on, and the
radius is the current twelve-pixel tolerance, so a user who never opens the panel
draws exactly as before. The active-draw `trace` snap stays always on: it is a
drawing aid for the in-progress run, not a standing running snap, so it is not a
toggle.

### Per-kind gating in the pure snap module

`SnapContext` gains an optional master `enabled` flag and an optional set of
disabled kinds. The chain in `snap.ts` is unchanged in order; each step is skipped
when its kind is disabled, and `snapPoint` returns null (a free cursor) when the
master is off. The radius preference feeds the existing `toleranceMm`, so a wider
radius catches from farther away at every zoom. Keeping the gating inside the pure
module means it is unit-tested without React or the DOM.

### The angle, perpendicular, and parallel reconciliation

The angle lock stays above perpendicular and parallel in the chain and supersedes
them while it is on, as ADR-0054 established. Slice 8 makes that standing a
preference rather than a hard rule: turning the angle snap off drops it from the
chain, and perpendicular and parallel become the active directional snaps. The
hold-to-free modifier from ADR-0054 still works as a momentary escape regardless of
the toggle, so a persistent off and a momentary free are separate controls.

### Toggles are editor commands; the panel is the visible surface

Each toggle is an `EditorCommand` (ADR-0050) built by a `createSnapCommands`
factory that closes over the store controls, then merged into the registry at the
keybinding and palette call sites, the same closure pattern ADR-0057 used for the
view commands. So a user flips the master, any single kind, or the radius from a
keybinding or the command palette. The precision panel mounts in a shell panel slot
and shows the master toggle, a labeled checkbox per kind, and a radius input, each
wired to the store. The status bar names the snap currently engaging (for example
`Snap: endpoint`), reading the live snap result, so the effect of a toggle is
visible while drawing.

## Why this approach

- **Per-user settings belong to the user, not the file.** Storing snap preferences
  in the document would change a collaborator's snap behavior when they open a
  shared plan and would make toggling a snap an undoable edit. The bridge store
  keeps them where editor settings belong.
- **The pure chain stays testable and its order stays intact.** Gating each step by
  a preference is a small guard, not a restructuring, so the planar snap logic keeps
  its existing priority and its plain-Node tests.
- **Reuse over reinvention.** The toggles ride the existing command registry and its
  keybinding and palette routes, and the store mirrors the existing selection store,
  so the slice adds behavior without new framework.

## Deferred refinements and explicit non-goals

- **No per-project snap overrides.** Preferences are global to the editor. A future
  per-project override could layer on top if a plan needs its own snap setup.
- **No new journey capability.** Snapping is already covered by the snap-along-wall
  and smart-angle journeys; this slice governs those snaps rather than adding a new
  gated behavior, so the coverage matrix is unchanged.
- **The radius is a single pixel value.** Per-kind radii are out of scope; one catch
  radius governs the whole chain, matching the single existing tolerance.

## Alternatives considered

- **Store snap preferences in the project document via a dispatched command,
  mirroring `setUnits`.** Rejected. It would version per-user tool config into the
  file format (a schema migration and a drift-guard update), make each toggle an
  undo step, and carry one user's snap setup into another user's session. Unit
  preferences are a document property of the plan; snap preferences are not.
- **A fixed precision mode that replaces the smart defaults wholesale.** Rejected. It
  splits snapping into two resolution paths and forces a user to rebuild the sensible
  defaults by hand. A single preference set with smart defaults and per-kind opt-out
  is simpler and never regresses the out-of-the-box experience.
- **Leave perpendicular and parallel permanently below the angle lock with no
  control.** Rejected. ADR-0054 explicitly deferred their standing to this slice, and
  a power user needs to reach them by turning the angle snap off.
