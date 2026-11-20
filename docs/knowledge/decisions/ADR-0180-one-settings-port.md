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
    storage/settings/settings-port.ts,
    storage/settings/local-storage-settings-port.ts,
    storage/settings/in-memory-settings-port.ts,
    storage/settings/legacy-setting-keys.ts,
    session/settings/settings-service.ts,
    bridge/react/settings-context.ts,
    app/app-settings.tsx,
    eslint.config.js,
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

> Amended on 2026-11-19. A setting that one browser tab changes now reaches the other open tabs at
> once, with no reload. Section 5.11 of the same specification changed with this record: it gained
> a design point and a condition for done about other tabs.

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
- The port interface has an optional member, `onOutsideChange(listener)`. It tells the listener the
  name of each setting that something outside the port changed, such as another browser tab. The
  member is optional because the memory port has no outside to hear from, and a port without it is
  still a complete port.
- The browser port takes a second constructor argument, the object that carries the browser's
  `storage` event. By default the port uses the global object when that object can carry the `storage` event,
  and listens to nothing when it cannot. A test passes its own. The port listens only while it has
  a listener.
- The settings service listens for its whole life when its port has the member.

Whether the port is the library store's settings methods or a separate interface is left to the
persistence specification. That was settled on 2026-11-15: the port is a separate interface, as the
amendment under Status records.

## Consequences

- The rule in `.claude/rules.md` holds without an exception, and lint enforces it.
- A new setting is a typed key. It does not need a storage decision of its own.
- Settings stay per browser profile, as now. Carrying them between machines is a separate question.
- The browser port keeps each setting as JSON text in local storage under
  `vernacular.settings.<name>`. Local storage reads synchronously, so the theme is known at the
  first render of the shell. Where the browser refuses storage, the port keeps the values in memory
  for the tab.
- The theme choice is stored now, one choice for the browser, and it survives a reload.
- The application builds the settings service once, when it mounts (`app/app-settings.tsx`). The
  service is not a member of the session ports.
- A setting that one browser tab changes reaches every other open tab at once, with no reload, and
  the later change wins.
- This is the second user-visible change, after the stored theme. A theme or snap change in one
  tab shows in every open tab at once. An older copy in another tab can no longer overwrite a
  newer snap change after that change has arrived, because the service drops its kept value and
  reads the new one before the next change builds on it. Where the browser grants its project locks,
  two tabs that both show an editor show two different projects, because a second tab that asks
  for a project open in another tab is refused. The settings are shared by all of them.
- The browser port reacts to an event for its own storage and for a key with its own prefix, and
  it drops its memory copy of that setting before it tells the listeners. For a cleared storage it
  does so for every name that it has read or written. The service then calls each subscriber of
  that name with the new value. `bridge/` and `editor/` did not change: their subscriptions render
  again. An end-to-end journey with two tabs holds the behavior
  (`e2e/tests/journeys/settings-follow-another-tab.spec.ts`).
- Known limits of following another tab:
  - A setting that an older build stores under the old key in another tab is not followed.
  - A service never stops listening. In development, strict mode builds the service two times, and
    a remount builds it again. Each discarded service keeps its handler on the window. It has no
    subscriber, so the cost is a small leak.
  - A subscriber that throws stops the later subscribers of that event, as on the write path.
  - Two keys with one name and different parse functions can give different values, one through
    the subscriber and one through `get`. `useSetting` reads through `get`, so what React shows
    stays consistent.
- The lint rule sees a storage API behind one TypeScript cast and in the common destructurings
  (`const { localStorage } = window`, `const { storage } = globalThis.navigator`). It does not see
  an alias (`const w = window; w.localStorage`), nor a few rarer forms such as `top.localStorage` or
  a destructuring behind a cast. It does not see `src/service-worker.ts` either, which reaches the
  cache storage through a typed copy of `self` and hands it to `storage/`.

## References

- `docs/specs/2026-11-14-architecture-refactor-round.md`, section 5.2.
- `docs/specs/2026-06-01-vernacular-design.md`, section 7.7.
