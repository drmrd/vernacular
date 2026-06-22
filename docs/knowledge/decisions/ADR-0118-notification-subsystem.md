---
slug: decisions/ADR-0118-notification-subsystem
title: 'ADR-0118: Notification subsystem'
type: decision
tags:
  [
    design-system,
    notifications,
    toast,
    banner,
    accessibility,
    aria-live,
    react,
    ui-feedback,
    error-handling,
  ]
related:
  [
    decisions/ADR-0001-six-layer-architecture,
    decisions/ADR-0005-command-pattern-framework-captured-inverse,
    decisions/ADR-0043-dom-overlay-and-accessibility,
    decisions/ADR-0096-design-system-consolidation,
    decisions/ADR-0022-storage-capability-detection,
  ]
sourceFiles:
  [
    editor/design-system/notifications/notification.ts,
    editor/design-system/notifications/notification-store.ts,
    editor/design-system/notifications/use-notifications.tsx,
    editor/design-system/notifications/human-message.ts,
    editor/design-system/notifications/toast.tsx,
    editor/design-system/notifications/banner.tsx,
    app/use-project-actions.ts,
    app/use-export-actions.ts,
    app/use-open-file-action.ts,
    app/use-degraded-storage-banner.ts,
    editor/shell/use-save-failure-toast.ts,
    editor/shell/editor-shell.tsx,
  ]
status: current
updated: 2026-06-21
---

# ADR-0118: Notification subsystem

## Status

Accepted, landed. The editor has one shared notification system with two presentations, a toast that
comes and goes and a banner that stays while a condition holds. The failures that used to vanish into
`console.error`, the export work that gave no sign it had started, the storage backend that could not
persist, and the bespoke import alert all route through it now.

## Context

The editor had no shared way to tell the user that something happened. A failed save looked identical
to a successful one, because the catch ended in `console.error` and nothing reached the screen. The
export actions ran with no sign they had started or finished. A storage backend that could not persist
the project only warned to the console. The single user-facing surface that did exist, the import-error
alert, was a one-off component wired to a single call site, with its own error-to-text helper that no
other failure could reuse.

Three facts about the existing code decided the shape of the fix.

Every place that would emit feedback is already inside React. The file-operation handlers live in
`app/use-project-actions.ts`, storage capability detection runs in a hook reached from `app/app.tsx`,
and the import flow is a React action in `app/use-open-file-action.ts`. None of them sit in `core/` or
`engine/`, and the layering from ADR-0001 forbids those layers from emitting UI feedback at all.

Mutations already have a home, and it is not this one. `dispatch(command)` returns nothing and feeds the
undo history (ADR-0005). A notification is neither a command nor something to undo, so there is no result
to thread back through that path and no reason to want one.

The editor already announces things to assistive technology. The plan overlay and the 3D scene proxy
overlay each own an `aria-live` region (ADR-0043). A new notification region has to stay distinct from
those, or a single event gets announced twice.

## Decision

A notification is one record with a `tier` that selects its presentation, a `severity`, a
human-readable `message`, up to two actions, and optional dismiss and auto-dismiss fields. A stable `id`
is the update key: re-emitting the same id replaces the live notification in place instead of stacking a
duplicate, which is how the export toast moves from pending to resolved and how a recurring condition
avoids piling up identical banners.

The system is a React context and hook under `editor/design-system/notifications/`. A
`NotificationProvider` holds the active list and the auto-dismiss timers and is mounted once, high in the
shell, so the whole editor shares one list. `useNotifications()` returns the emit API and the current
list. `ToastRegion` and `BannerRegion` read the list, filter by tier, and render the pure `Toast` and
`Banner` primitives. A single pure reducer owns every change to the list: emitting adds or replaces by
id, dismissing removes, a timer removes on expiry. Nothing here is a command and nothing is undoable,
which is why the system sits beside the dispatcher rather than inside it.

The hook exposes ergonomic wrappers so call sites stay short: `success`, `info`, and `warning` raise a
toast with the auto-dismiss default that matches the severity, `error` raises a sticky error toast that
stays until the user dismisses it or an action resolves it, and `banner` raises a banner. A `promise`
wrapper raises one toast in a pending state with an indeterminate spinner, then mutates that same toast
by id to success or error when the task settles, and returns the task's own promise so the caller can
still await it. Error text never comes from a raw `Error` or stack; the shared `humanMessage` helper maps
a thrown value to display text, generalizing the old per-call helper from the import flow so every site
maps errors the same way.

### The emit API keeps stable method identities

The provider keeps a stable object of emit methods separate from the changing notification list, and that
separation is load-bearing. A consumer that calls an emit method inside an effect keyed on that method,
which the degraded-storage banner does deliberately, would re-run on every change to the list if the
method were rebuilt on each render; the emit inside the effect would change the list again, and the cycle
repeats until the process runs out of memory. So the methods are memoized once and never rebuilt, and only
the list reacts. Anyone maintaining the provider has to preserve that split.

### Distinct live regions, role tied to severity

The toast region is anchored bottom-right, clear of the footer status bar, and announces politely, with
error toasts raised to assertive. The banner region sits under the header and uses `role="status"`,
raised to `role="alert"` for warning and error. Both regions are separate DOM regions from the canvas
live-regions of ADR-0043, so an event announced on the canvas is never also announced by a notification.
The toast region does not impose an `aria-live` value that would override a toast's own `role="alert"`:
an outer polite region silently demotes an inner alert, so an error would stop announcing assertively.

### Rejected: a framework-agnostic event bus

The obvious generalization is a singleton event bus that any layer, including `core/` and `engine/`, can
publish to, with a React adapter that subscribes and renders. It is rejected as premature. Every emit
site is already in React, and the layering rule forbids the lower layers from emitting feedback, so a bus
would add a global singleton and a lifecycle to manage that no caller needs. If a non-React emitter ever
appears, the hook API can be backed by a bus then without touching the call sites.

### Rejected: threading results back through dispatch

Making commands return a result and surfacing failures from there conflates feedback with mutation, drags
undo history into UI concerns, and would break the `void` dispatch contract that the whole command system
relies on. Notifications stay out of the command path.

## Consequences

- File-operation failures, export progress, degraded storage, import errors, and a failed autosave now
  surface through one channel with one error-to-text mapping, instead of vanishing into the console or
  living in a bespoke component.
- The emit API has a standing requirement: its method identities stay stable across renders, kept apart
  from the reactive list. Collapsing the two back into one memo reintroduces the effect-keyed infinite
  loop described above. This is the one piece of the provider that cannot be simplified away.
- The import-error alert and its mount are gone, and its error helper became the shared `humanMessage`,
  so the migration removed code rather than adding a parallel path.
- The header save-status readout is unchanged. A failed save raises an error toast in addition to the
  small header label, on the transition into the error status only, so a mount already at error stays
  quiet.
- Out of scope and tracked elsewhere: determinate export progress with a percentage (#320), a
  notification history or center, and routing the crash-recovery prompt (#232) or the autosave readout
  itself through the system. The toast shows an indeterminate spinner; the readout stays as it is.

## References

- ADR-0001 (the layer boundaries that keep emission at the React seam and bar `core/` from emitting).
- ADR-0005 (the command pattern and its `void` dispatch contract that notifications stay outside of).
- ADR-0043 (the canvas DOM-overlay live regions the notification regions stay distinct from).
- ADR-0096 (the design-system consolidation the toast and banner primitives join under the `ds-` prefix).
- ADR-0022 (the storage-capability detection that drives the degraded-storage banner).
- Specification: `docs/specs/2026-06-21-notification-subsystem.md`.
