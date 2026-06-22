# Notification subsystem

Status: draft specification. This introduces a shared toast and banner system for the editor.
It has no prior ADR; the build itself will land one because the subsystem is architectural.
It unblocks the file-operation error surfacing (#233), export progress feedback (#267), the
degraded-storage warning (#262), and the status feedback half of the autosave work.

## Summary

The editor has no shared way to tell the user that something happened. Errors from saving,
exporting, and opening are swallowed into `console.error`, so a failed save looks identical to
a successful one. A storage backend that cannot persist anything only warns to the console. The
one user-facing surface that does exist, the import-error alert, is a bespoke component wired to
a single call site. This feature adds one notification system with two presentations: a toast
that comes and goes, and a banner that stays while a condition holds. It then routes the existing
silent and bespoke surfaces through that system.

The system is deliberately small. It is ephemeral UI state held in React, emitted from the React
boundary, and kept outside the command dispatcher and undo history. A notification is feedback,
not a domain mutation.

## Goals

- Give the editor one way to emit user-facing feedback, with an ergonomic hook API.
- Two presentations from one model: a transient toast and a persistent banner.
- Surface the file-operation failures that are silent today (save, export, open, reopen) as
  error toasts with a retry action where retry makes sense.
- Show export work in progress as a toast that resolves to success or failure in place.
- Raise a dismissible banner when storage cannot persist the project.
- Migrate the import-error alert onto the system and keep its message mapping as a shared helper.
- Stay within the layering rules: emission happens in React, `core/` never emits, nothing routes
  through `dispatch(command)`.

## Non-goals

- A framework-agnostic event bus that lets non-React layers emit. Every emit site is already in
  React and `core/` must not emit, so a bus is unused weight. Rejected below.
- Determinate progress with a percentage. The export promise toast shows an indeterminate spinner
  only. A measured progress bar for large bundles is tracked separately (#320).
- A notification history or notification center. Notifications are shown and forgotten.
- Routing the autosave status readout or the crash-recovery prompt (#232, owner-gated) through
  the system. The header save-status readout stays as it is; a failed save additionally raises a toast.
- Per-call custom positioning. Toasts have one anchored region; banners have one strip.

## Background

Three facts about the current code shape the design.

First, every place that would emit a notification is already inside React. The file-operation
handlers live in `app/use-project-actions.ts`, storage capability detection runs in a hook in
`app/app.tsx`, and the import flow is a React action in `app/use-open-file-action.ts`. None of
these are in `core/` or `engine/`.

Second, mutations already have a home and it is not this one. `dispatch(command)` in
`core/commands/dispatcher.ts` returns `void`; the session wrapper in
`bridge/session/editor-session.ts` calls it and fires a change notification, also returning
nothing. There is no result to thread back, and undo history is built from commands. A
notification is neither a command nor undoable, so it must live outside this path.

Third, the editor already announces things to assistive technology. The plan overlay has an
`aria-live="polite"` region (`editor/plan/plan-overlay.tsx`) and the 3D scene proxy overlay has
another (`bridge/react/scene-proxy-overlay.tsx`). The notification regions must be distinct from
these so a single event is never announced twice.

The design system supplies the building blocks: design tokens in `editor/design-system/tokens.ts`,
a `ds-` CSS class prefix with BEM-style elements, hooks that return prop objects to spread (see
`use-menu-button.ts`), and inline conditionally-rendered overlays rather than portals. There is
already a `ds-status` namespace with `LoadingState` and `EmptyState`. Toast and banner join it as
design-system primitives.

## Design

### One model, two tiers

A notification is a single record. Its `tier` chooses the presentation.

```
Notification = {
  id: string                          // stable; re-emitting the same id updates in place
  tier: 'toast' | 'banner'
  severity: 'info' | 'success' | 'warning' | 'error'
  message: string                     // human-readable, never a raw stack or error object
  actions?: { label: string; onAction: () => void }[]   // 0 to 2
  dismissible?: boolean
  autoDismissMs?: number              // toasts only; omitted means it stays until dismissed
}
```

A stable `id` is the update key. Emitting a notification whose `id` matches a live one replaces
it in place rather than stacking a duplicate. This is how the export promise toast moves from
pending to resolved, and how a recurring condition avoids piling up identical banners.

`message` is always human-readable text. The mapping from a raw error to that text is the shared
`humanMessage` helper described below. The system never renders an `Error` object or a stack.

Each action is a label and a handler. A notification carries zero, one, or two actions. The
common case is a single retry on a failed operation.

### Toast behavior

Toasts are transient. They stack in one anchored region, newest nearest the anchor, and grow away
from it. At most three are visible at once; when a fourth arrives the oldest is dropped.

Auto-dismiss depends on severity. Success and info toasts dismiss themselves after a short delay
(about four seconds). Error toasts are sticky: they stay until the user dismisses them or an
action resolves them, because an error the user never saw is the failure this feature exists to
prevent. The `autoDismissMs` field expresses this per notification; the ergonomic wrappers set the
default that matches each severity, and a caller can override it.

### Banner behavior

Banners are persistent and condition-bound. A banner stays while its underlying condition holds.
It is a full-width strip directly under the header, above the editor body. Banners do not
auto-dismiss. A banner may still be `dismissible` so the user can clear it for the session even
while the condition persists; the degraded-storage banner is dismissible by owner decision.

### Architecture: context and hook

The system is a React context with a hook, living in
`editor/design-system/notifications/`.

- `NotificationProvider` holds the active notification list and the timers that auto-dismiss
  toasts. It is mounted once, high in the editor shell, so the whole editor shares one list.
- `useNotifications()` returns the emit API (below) plus the current list, for the regions to
  render.
- `ToastRegion` and `BannerRegion` are presentational. They read the list, filter by tier, and
  render `Toast` and `Banner` primitives. They hold no emit logic.
- `Toast` and `Banner` are pure presentational primitives driven by a single notification and a
  dismiss callback, styled with design tokens under the `ds-` prefix.

The list is the single source of truth. Emitting adds or replaces by `id`; dismissing removes;
a toast timer removes on expiry. Nothing here is a command and nothing is undoable, which is why
the system sits beside the dispatcher rather than inside it.

### Public API

The hook returns ergonomic wrappers over the raw model so call sites stay short and uniform.

```
const n = useNotifications()

n.success('Exported plan.pdf')
n.info('Imported 12 furniture pieces')
n.warning('Some assets could not be loaded')

n.error(humanMessage(err), { actions: [{ label: 'Retry', onAction: retry }] })

n.banner({
  id: 'storage-degraded',
  severity: 'warning',
  message,
  dismissible: true,
  actions,
})

n.promise(task, {
  pending: 'Exporting plan.pdf...',
  success: () => 'Exported plan.pdf',
  error: (e) => ({
    message: `Export failed: ${humanMessage(e)}`,
    actions: [{ label: 'Retry', onAction: retry }],
  }),
})

n.dismiss(id)
```

`success`, `info`, and `warning` raise a toast of that severity with the matching auto-dismiss
default. `error` raises a sticky error toast. `banner` raises a banner. `promise` raises one toast
that starts in a pending state with an indeterminate spinner, then mutates the same toast (by id)
to success or error when the task settles; it returns the task's own promise so the caller can
still await it. Each of `pending`, `success`, and `error` may be a plain message string or the
richer `{ message, actions }` form. `dismiss` removes a notification by id.

`humanMessage(error: unknown): string` is the shared mapper from a thrown value to display text.
It is the generalization of the existing `errorMessage` helper in `use-open-file-action.ts`
(`error instanceof Error ? error.message : String(error)`), moved somewhere shared so every call
site maps errors the same way.

### Integration: real call sites

The system is only worth building if the silent surfaces route through it. The wiring targets,
verified against the current tree:

- **File-operation errors (#233).** `app/use-project-actions.ts` has seven handlers that end in
  `.catch((error) => console.error(...))`: save, export-bundle, export-image, export-pdf,
  open-folder, open-recent, and reopen-folder. Each becomes
  `n.error(humanMessage(error), { actions: [{ label: 'Retry', onAction: retry }] })`, with retry
  wired where the action can be retried cleanly.

- **Export progress (#267).** Three of the four export actions in `app/use-project-actions.ts`
  are promise-based (bundle, image, pdf). Each wraps its promise in `n.promise(...)` so the user
  sees the export start and resolve. The fourth, export-plan, is a synchronous download and gets a
  plain `success`/`error` toast rather than a promise toast.

- **Degraded storage (#262).** `app/app.tsx` probes storage capability and, when
  `isStorageDegraded(probed)` is true (`storage/storage-capabilities.ts`), only `console.warn`s
  today. It instead raises `n.banner({ id: 'storage-degraded', severity: 'warning', message, ... })`
  with a message built from `summarizeStorageCapabilities`. The banner is dismissible.

- **Import-error migration.** The import catch in `app/use-open-file-action.ts` sets a bespoke
  status that renders `editor/shell/import-alert.tsx`. The catch instead calls
  `n.error(humanMessage(error))` (or a message that names the file). The `ImportAlert` component
  and its mount in the shell are removed, and its `errorMessage` helper becomes the shared
  `humanMessage`.

- **Autosave status tie-in.** The header save-status readout in `editor/shell/editor-shell.tsx`
  stays as it is (`Ready` / `Saving...` / `All changes saved` / `Save failed`). When the status
  reaches `Save failed`, the editor additionally raises an error toast with a retry action, so a
  failure is not only legible in a small header label.

### Accessibility and placement

- `ToastRegion` is the anchored toast container. It is positioned bottom-right, clear of the
  footer status bar, and uses `aria-live="polite"`. Error toasts announce with `assertive`.
- `BannerRegion` sits under the header. It uses `role="status"`, raised to `role="alert"` for
  warning and error severities.
- Both regions honor `prefers-reduced-motion`: motion is reduced to a simple appearance with no
  slide or bounce.
- Both regions are distinct DOM regions from the canvas live-regions in
  `editor/plan/plan-overlay.tsx` and `bridge/react/scene-proxy-overlay.tsx`, so an event announced
  on the canvas is never also announced by a toast.
- Dismiss controls are real buttons, reachable and operable by keyboard, sized to the minimum
  target token already used in the design system.

## Rejected alternatives

**A framework-agnostic global event bus.** An obvious generalization is a singleton event bus that
any layer, including `core/` and `engine/`, can publish to, with a React adapter subscribing and
rendering. It is rejected as premature. Every emit site identified is already in React, and the
layering rule forbids `core/` from emitting UI feedback at all. A bus would add a global singleton
and a lifecycle to manage that no current caller needs. Keeping emission at the React
boundary respects the existing layering and stays simpler. If a future non-React emitter ever appears,
the hook API can be backed by a bus then without changing call sites.

**Threading results back through `dispatch`.** Another option is to make commands return a result
and surface failures from there. This conflates feedback with mutation, drags undo history into UI
concerns, and would require changing the `void` dispatch contract that the whole command system
relies on. Notifications stay out of the command path.

## Testing and stories

The build follows the project red-green-blue TDD cycle, one behavior per cycle.

- Store and provider unit tests: add, dismiss, auto-dismiss on a fake timer, update-in-place by id,
  the promise wrapper resolving and rejecting, and the max-visible cap dropping the oldest toast.
- `humanMessage` mapper tests covering an `Error`, a thrown string, and a thrown non-error value.
- Component interaction tests for `Toast` and `Banner`: dismiss button, action button invocation,
  severity to role and aria-live mapping.
- The new isolable presentational components get CSF3 stories with play tests and arm64 visual
  baselines, advancing the story-coverage work (#285, #275).

The subsystem lands with an ADR, since introducing a shared feedback channel that sits beside the
command system is an architectural decision worth recording.

## Follow-ups

These issues are unblocked or informed by this subsystem and are referenced above: #233 (file-op
error surfacing), #267 (export progress), #262 (degraded-storage warning), #320 (determinate
export progress), and the autosave status feedback. The wiring section names the exact call sites
each one touches.
