---
slug: decisions/ADR-0180-one-settings-port
title: 'ADR-0180: User settings go through one settings port in storage'
type: decision
tags: [settings, storage, preferences, session, lint]
related:
  [
    decisions/ADR-0059-precision-snapping-preferences,
    decisions/ADR-0175-session-layer-for-application-state,
    decisions/ADR-0188-project-id-address-and-index-record,
  ]
sourceFiles:
  [
    storage/settings/,
    session/settings/settings-service.ts,
    bridge/react/settings-context.ts,
    storage/opfs/opfs-probe.ts,
    storage/opfs/origin-private-root.ts,
    editor/design-system/theme-provider.tsx,
    editor/plan/snap-preferences-store.ts,
    storage/library-store.ts,
  ]
status: current
updated: 2026-11-19
---

# ADR-0180: User settings go through one settings port in storage

## Status

Current. The owner chose this on 2026-11-14 and approved the architecture refactor round
specification the same day. It supersedes the part of ADR-0059 that persists snap preferences from
`editor/`. The snapping behavior ADR-0059 describes stays. The settings port, the settings service,
the adapter in `bridge/`, and the lint rule have landed. The snap preference store keeps its
preferences through the service, and a value that an older build stored under
`vernacular.snap-preferences` is carried once to `vernacular.settings.snapPreferences`, after which
the old key is removed.

> Amended on 2026-11-15 by section 5.11 of
> `docs/specs/2026-11-15-session-layer-and-document-identity.md`, which answers the question this
> record left open. The settings port is its own interface in `storage/`, not a part of the library
> store, because the library store has no implementation to build on. The snap preferences and the
> theme choice are its first users. Which project opens at start is not a setting. It comes from
> the project index ([[ADR-0188-project-id-address-and-index-record]]).

## Context

`.claude/rules.md` allows browser storage APIs only in `storage/`. ADR-0059 made an exception: the
snap preferences are written to `localStorage` from `editor/plan/snap-preferences-store.ts`. A
second file outside `storage/` touches a storage API as well (`app/opfs-probe.ts`, which has since
moved into `storage/opfs/`), and no lint rule checks either.

Other settings have no saved home at all. The theme is held in memory
(`editor/design-system/theme-provider.tsx`), unit precision is a set of constants, and the design
language choice the Arris migration introduces will need one. The design specification puts
`getSettings` and `saveSettings` on the library store, but that interface has no implementation.

## Decision

`storage/` provides one settings port with a browser implementation and an in-memory one.

- The session owns a settings service on top of it: typed keys, defaults, and change notification.
- Every user setting goes through that service: snap preferences, theme, design language, and unit
  precision.
- The editor reads settings through a `bridge/` adapter and never touches a storage API.
- A lint rule forbids browser storage globals outside `storage/`.
- The existing snap preference key is read once and carried into the new store, so nobody loses
  their preferences.

Whether the port is the library store's settings methods or a separate interface is left to the
persistence specification.

## Consequences

- The rule in `.claude/rules.md` holds without an exception, and lint enforces it.
- A new setting is a typed key. It does not need a storage decision of its own.
- Settings stay per browser profile, as now. Carrying them between machines is a separate question.
- A setting that one browser tab changes reaches another tab when that tab reloads, and the later
  change wins.
- The lint rule sees a storage API behind a TypeScript cast and in a destructuring. It does not see
  an alias: `const w = window; w.localStorage` passes.

## References

- `docs/specs/2026-11-14-architecture-refactor-round.md`, section 5.2.
- `docs/specs/2026-06-01-vernacular-design.md`, section 7.7.
