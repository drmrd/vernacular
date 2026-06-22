# Notification subsystem implementation plan

> **For agentic workers:** This plan is executed with the project's red-green-blue TDD
> discipline using the role-separated subagents (`test-author` for RED, `implementer` for
> GREEN, `clean-code-reviewer` + `refactorer` for BLUE), orchestrated from the main thread.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one shared notification system for the editor with two presentations (a transient
toast and a persistent banner), then route the editor's silent and bespoke feedback surfaces
through it.

**Architecture:** A React context-and-hook under `editor/design-system/notifications/`. A pure
reducer owns the active list (add or replace by id, dismiss, cap visible toasts). `NotificationProvider`
wraps the app so every emit site sits under it, exposing `useNotifications()` with ergonomic
wrappers (`success`/`info`/`warning`/`error`/`banner`/`promise`/`dismiss`). Presentational
`Toast`/`ToastRegion` and `Banner`/`BannerRegion` render the list. Notifications are ephemeral UI
state, deliberately outside `dispatch(command)` and undo history.

**Tech stack:** TypeScript, React 19, Vitest + React Testing Library (jsdom), Storybook CSF3 with
play tests, the existing design-system tokens and CSS. No new dependencies.

**Spec:** `docs/specs/2026-06-21-notification-subsystem.md`.

## Global constraints

Copied from the project rules and the spec. Every task implicitly includes these.

- **Layering:** emission happens in React only. `core/` never imports React or Three and never
  emits notifications. `app/` may import `editor/`; `editor/` may import `bridge/`; the notification
  system lives in `editor/design-system/` and is imported downward from `app/` and `editor/shell/`.
- **Outside the command system:** notifications never flow through `dispatch(command)` and are not
  undoable. `dispatch` stays `void`.
- **No new dependencies.** Pure React plus the existing design system. (The 30-day cooldown and
  exact-pin rules therefore do not come into play.)
- **RGB commit sequence:** each behavior is three commits in order: `test:` (RED, the failing test),
  then `feat:` or `fix:` (GREEN, minimal implementation), then `refactor:` (BLUE, possibly an empty
  marker commit). `pnpm rgb:audit origin/main..HEAD` must pass. Glue-only wiring carries an
  `Infrastructure:` trailer and `test(e2e)` commits are exempt, per the project audit rules.
- **Conventional Commits.** No `Co-Authored-By` and no `Claude-Session` trailers. Author identity
  `Dan Moore <9156191+drmrd@users.noreply.github.com>`.
- **No em-dashes** in any newly composed prose (ADR, comments). Code is exempt.
- **Design-system conventions:** `ds-` CSS class prefix, BEM-style elements, design tokens via
  `var(--...)` from `editor/design-system/tokens.ts`, hooks return prop objects to spread, inline
  conditionally-rendered overlays rather than React portals.
- **Stories:** every new isolable presentational component gets a CSF3 story with a play test and an
  arm64 visual baseline. Baseline regeneration needs the arm64 docker container
  (`colima start --cpu 6 --memory 12`, render with `--platform linux/arm64`, `colima stop` after).
- **Full check chain before any PR:** `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
&& pnpm integration:audit && pnpm build`, plus `pnpm storybook:test` and
  `pnpm exec playwright test --project=chromium`. CI on the PR is the authority; merge through the
  merge queue, never a direct push to `main`.
- **ESLint limits that bite:** `max-lines-per-function` 40, `max-lines` 300, `max-params` 3,
  `no-magic-numbers`, `no-nested-ternary`. Warnings fail the gate. Keep helpers small and hoist
  constants.

## File structure

New, under `editor/design-system/notifications/`:

- `notification.ts`: the `Notification` record, the tier/severity/action types, the emit-input and
  `NotificationApi` types, and the tuning constants. Pure types and constants, no React.
- `notification-store.ts`: the pure reducer: `notificationReducer`, upsert-by-id, dismiss, and the
  visible-toast cap. No React.
- `human-message.ts`: `humanMessage(error: unknown): string`, the shared error-to-text mapper.
- `use-notifications.tsx`: `NotificationContext`, `NotificationProvider`, and the `useNotifications`
  hook with the ergonomic wrappers, id generation, auto-dismiss timers, and the promise wrapper.
- `toast.tsx` + `toast.css`: `Toast` (one notification) and `ToastRegion` (the anchored stack).
- `banner.tsx` + `banner.css`: `Banner` (one notification) and `BannerRegion` (the under-header strip).
- `toast.stories.tsx`, `banner.stories.tsx`: CSF3 stories with play tests.
- `index.ts`: re-exports the public surface.

Modified:

- `editor/design-system/index.ts`: re-export the notification public surface.
- `editor/design-system/app-frame.tsx` + `app-frame.css`: add an optional `banner` slot under the header.
- `app/app.tsx`: mount `NotificationProvider`; raise the degraded-storage banner.
- `editor/shell/editor-shell.tsx`: render `ToastRegion`, pass the `BannerRegion` into `AppFrame`,
  remove `ImportAlert`, raise an error toast on save failure.
- `app/use-workspace-state.ts`: inject `notifications` into the project-actions context.
- `app/use-project-actions.ts`: error toasts for file ops, promise toasts for exports.
- `app/use-open-file-action.ts`: route import errors through `notifications.error`; drop the local
  `errorMessage` and the `importStatus` plumbing.

Deleted:

- `editor/shell/import-alert.tsx` + `editor/shell/import-alert.css` and their tests/stories.

## Task ordering and dependencies

Tasks 1 to 5 build the subsystem in isolation (no app wiring) and can be reviewed independently.
Task 6 (AppFrame slot) and Task 7 (banner component) are independent of each other. Task 8 mounts
everything. Tasks 9 to 13 wire real call sites and each depends on Task 8. Task 14 is the ADR.

---

### Task 1: Notification model and pure store reducer

**Files:**

- Create: `editor/design-system/notifications/notification.ts`
- Create: `editor/design-system/notifications/notification-store.ts`
- Test: `editor/design-system/notifications/notification-store.test.ts`

**Interfaces:**

- Produces: the `Notification`, `NotificationTier`, `NotificationSeverity`, `NotificationAction`
  types; the `MAX_VISIBLE_TOASTS` and `DEFAULT_TOAST_DURATION_MS` constants; `NotificationState`,
  `StoreAction`, `emptyNotificationState`, and
  `notificationReducer(state: NotificationState, action: StoreAction): NotificationState`.

`notification.ts` content (types and constants only, no logic to test directly):

```ts
export type NotificationTier = 'toast' | 'banner'
export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error'

export interface NotificationAction {
  label: string
  onAction: () => void
}

export interface Notification {
  id: string
  tier: NotificationTier
  severity: NotificationSeverity
  message: string
  actions?: NotificationAction[]
  dismissible?: boolean
  /** Toasts only. Omitted means the toast stays until dismissed (sticky). */
  autoDismissMs?: number
  /** Internal: a promise toast in flight, rendered with an indeterminate spinner. */
  pending?: boolean
}

/** At most this many toasts are visible; a newer toast drops the oldest. Banners are not capped. */
export const MAX_VISIBLE_TOASTS = 3
/** Default lifetime for success and info toasts. Errors omit this and stay until dismissed. */
export const DEFAULT_TOAST_DURATION_MS = 4000
```

- [ ] **Step 1: Write the failing reducer tests**

```ts
// notification-store.test.ts
import { describe, expect, it } from 'vitest'
import { emptyNotificationState, notificationReducer } from './notification-store'
import { MAX_VISIBLE_TOASTS, type Notification } from './notification'

function toast(id: string): Notification {
  return { id, tier: 'toast', severity: 'info', message: id }
}

describe('notificationReducer', () => {
  it('appends a new notification on upsert', () => {
    const state = notificationReducer(emptyNotificationState, {
      type: 'upsert',
      notification: toast('a'),
    })
    expect(state.notifications.map((n) => n.id)).toEqual(['a'])
  })

  it('replaces in place when upserting an existing id', () => {
    const first = notificationReducer(emptyNotificationState, {
      type: 'upsert',
      notification: toast('a'),
    })
    const withB = notificationReducer(first, { type: 'upsert', notification: toast('b') })
    const replaced = notificationReducer(withB, {
      type: 'upsert',
      notification: { ...toast('a'), message: 'updated' },
    })
    expect(replaced.notifications.map((n) => n.id)).toEqual(['a', 'b'])
    expect(replaced.notifications[0]?.message).toBe('updated')
  })

  it('drops the oldest toast past the visible cap', () => {
    let state = emptyNotificationState
    for (const id of ['a', 'b', 'c', 'd']) {
      state = notificationReducer(state, { type: 'upsert', notification: toast(id) })
    }
    expect(state.notifications).toHaveLength(MAX_VISIBLE_TOASTS)
    expect(state.notifications.map((n) => n.id)).toEqual(['b', 'c', 'd'])
  })

  it('does not count or drop banners under the toast cap', () => {
    let state = emptyNotificationState
    state = notificationReducer(state, {
      type: 'upsert',
      notification: { id: 'warn', tier: 'banner', severity: 'warning', message: 'banner' },
    })
    for (const id of ['a', 'b', 'c', 'd']) {
      state = notificationReducer(state, { type: 'upsert', notification: toast(id) })
    }
    expect(state.notifications.filter((n) => n.tier === 'banner')).toHaveLength(1)
    expect(state.notifications.filter((n) => n.tier === 'toast').map((n) => n.id)).toEqual([
      'b',
      'c',
      'd',
    ])
  })

  it('removes a notification by id on dismiss', () => {
    const seeded = notificationReducer(emptyNotificationState, {
      type: 'upsert',
      notification: toast('a'),
    })
    const empty = notificationReducer(seeded, { type: 'dismiss', id: 'a' })
    expect(empty.notifications).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm exec vitest run editor/design-system/notifications/notification-store.test.ts`
Expected: FAIL (cannot resolve `./notification-store`).

- [ ] **Step 3: Commit the RED test**

```bash
git add editor/design-system/notifications/notification.ts editor/design-system/notifications/notification-store.test.ts
git commit -m "test: notification store upsert, dismiss, and toast cap"
```

(`notification.ts` is the type module the test imports; it carries no behavior, so it lands with the
RED test rather than as its own cycle.)

- [ ] **Step 4: Implement the reducer**

```ts
// notification-store.ts
import { MAX_VISIBLE_TOASTS, type Notification } from './notification'

export interface NotificationState {
  notifications: Notification[]
}

export type StoreAction =
  | { type: 'upsert'; notification: Notification }
  | { type: 'dismiss'; id: string }

export const emptyNotificationState: NotificationState = { notifications: [] }

export function notificationReducer(
  state: NotificationState,
  action: StoreAction,
): NotificationState {
  if (action.type === 'dismiss') {
    return { notifications: state.notifications.filter((n) => n.id !== action.id) }
  }
  return { notifications: capToasts(upsert(state.notifications, action.notification)) }
}

function upsert(list: Notification[], next: Notification): Notification[] {
  const index = list.findIndex((n) => n.id === next.id)
  if (index === -1) {
    return [...list, next]
  }
  const copy = [...list]
  copy[index] = next
  return copy
}

// Keep every banner; trim the oldest toasts so no more than MAX_VISIBLE_TOASTS remain. Order is
// preserved, so the oldest toast (lowest index) is the one dropped.
function capToasts(list: Notification[]): Notification[] {
  const toastCount = list.filter((n) => n.tier === 'toast').length
  if (toastCount <= MAX_VISIBLE_TOASTS) {
    return list
  }
  let toDrop = toastCount - MAX_VISIBLE_TOASTS
  return list.filter((n) => {
    if (n.tier === 'toast' && toDrop > 0) {
      toDrop -= 1
      return false
    }
    return true
  })
}
```

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `pnpm exec vitest run editor/design-system/notifications/notification-store.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit GREEN**

```bash
git add editor/design-system/notifications/notification-store.ts
git commit -m "feat: add the notification store reducer"
```

- [ ] **Step 7: BLUE review and refactor**

Dispatch the `clean-code-reviewer` on the diff, then the `refactorer`. If no actionable findings,
land an empty marker commit:

```bash
git commit --allow-empty -m "refactor: notification store (no changes)"
```

---

### Task 2: humanMessage error mapper

**Files:**

- Create: `editor/design-system/notifications/human-message.ts`
- Test: `editor/design-system/notifications/human-message.test.ts`

**Interfaces:**

- Produces: `humanMessage(error: unknown): string`.

This generalizes the `errorMessage` helper currently private to `app/use-open-file-action.ts`
(lines 16 to 18). The original is replaced by this shared helper in Task 12.

- [ ] **Step 1: Write the failing test**

```ts
// human-message.test.ts
import { describe, expect, it } from 'vitest'
import { humanMessage } from './human-message'

describe('humanMessage', () => {
  it('uses an Error message', () => {
    expect(humanMessage(new Error('disk full'))).toBe('disk full')
  })

  it('passes a thrown string through', () => {
    expect(humanMessage('boom')).toBe('boom')
  })

  it('stringifies a thrown non-error value', () => {
    expect(humanMessage({ code: 42 })).toBe('[object Object]')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm exec vitest run editor/design-system/notifications/human-message.test.ts`
Expected: FAIL (cannot resolve `./human-message`).

- [ ] **Step 3: Commit RED**

```bash
git add editor/design-system/notifications/human-message.test.ts
git commit -m "test: humanMessage maps errors, strings, and other values"
```

- [ ] **Step 4: Implement**

```ts
// human-message.ts
/** Map a thrown value to display text. Never returns a stack or an Error object. */
export function humanMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
```

- [ ] **Step 5: Run to confirm pass**

Run: `pnpm exec vitest run editor/design-system/notifications/human-message.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit GREEN**

```bash
git add editor/design-system/notifications/human-message.ts
git commit -m "feat: add the shared humanMessage error mapper"
```

- [ ] **Step 7: BLUE**

Review and refactor; empty marker if nothing actionable:

```bash
git commit --allow-empty -m "refactor: humanMessage (no changes)"
```

---

### Task 3: NotificationProvider and useNotifications (toasts, banner, dismiss, timers)

**Files:**

- Create: `editor/design-system/notifications/use-notifications.tsx`
- Test: `editor/design-system/notifications/use-notifications.test.tsx`

**Interfaces:**

- Consumes: `notificationReducer`, `emptyNotificationState` (Task 1); the types and constants (Task 1).
- Produces: the `NotificationApi` interface, `NotificationProvider`, and `useNotifications`. The
  `promise` method is added in Task 4. Shape produced now:

```ts
export interface ToastOptions {
  id?: string
  actions?: NotificationAction[]
  dismissible?: boolean
  autoDismissMs?: number
}

export interface BannerInput {
  id: string
  severity: NotificationSeverity
  message: string
  actions?: NotificationAction[]
  dismissible?: boolean
}

export interface NotificationApi {
  notifications: Notification[]
  success(message: string, options?: ToastOptions): string
  info(message: string, options?: ToastOptions): string
  warning(message: string, options?: ToastOptions): string
  error(message: string, options?: ToastOptions): string
  banner(input: BannerInput): string
  dismiss(id: string): void
  // promise(...) is added in Task 4.
}
```

- [ ] **Step 1: Write the failing tests**

```tsx
// use-notifications.test.tsx
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationProvider, useNotifications } from './use-notifications'
import { DEFAULT_TOAST_DURATION_MS } from './notification'
import type { ReactNode } from 'react'

function wrapper({ children }: { children: ReactNode }) {
  return <NotificationProvider>{children}</NotificationProvider>
}

describe('useNotifications', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('adds a success toast that auto-dismisses after the default delay', () => {
    const { result } = renderHook(() => useNotifications(), { wrapper })
    act(() => {
      result.current.success('Saved')
    })
    expect(result.current.notifications.map((n) => n.message)).toEqual(['Saved'])
    act(() => {
      vi.advanceTimersByTime(DEFAULT_TOAST_DURATION_MS)
    })
    expect(result.current.notifications).toEqual([])
  })

  it('keeps an error toast until dismissed', () => {
    const { result } = renderHook(() => useNotifications(), { wrapper })
    let id = ''
    act(() => {
      id = result.current.error('Save failed')
    })
    act(() => {
      vi.advanceTimersByTime(DEFAULT_TOAST_DURATION_MS * 10)
    })
    expect(result.current.notifications).toHaveLength(1)
    act(() => {
      result.current.dismiss(id)
    })
    expect(result.current.notifications).toEqual([])
  })

  it('updates a banner in place when re-emitted with the same id', () => {
    const { result } = renderHook(() => useNotifications(), { wrapper })
    act(() => {
      result.current.banner({ id: 'storage-degraded', severity: 'warning', message: 'first' })
    })
    act(() => {
      result.current.banner({ id: 'storage-degraded', severity: 'warning', message: 'second' })
    })
    expect(result.current.notifications).toHaveLength(1)
    expect(result.current.notifications[0]?.message).toBe('second')
  })

  it('throws when used outside a provider', () => {
    expect(() => renderHook(() => useNotifications())).toThrow(/NotificationProvider/)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm exec vitest run editor/design-system/notifications/use-notifications.test.tsx`
Expected: FAIL (cannot resolve `./use-notifications`).

- [ ] **Step 3: Commit RED**

```bash
git add editor/design-system/notifications/use-notifications.test.tsx
git commit -m "test: notification provider toasts, error stickiness, and banner update"
```

- [ ] **Step 4: Implement the provider and hook**

```tsx
// use-notifications.tsx
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react'
import {
  DEFAULT_TOAST_DURATION_MS,
  type Notification,
  type NotificationAction,
  type NotificationSeverity,
} from './notification'
import { emptyNotificationState, notificationReducer } from './notification-store'

export interface ToastOptions {
  id?: string
  actions?: NotificationAction[]
  dismissible?: boolean
  autoDismissMs?: number
}

export interface BannerInput {
  id: string
  severity: NotificationSeverity
  message: string
  actions?: NotificationAction[]
  dismissible?: boolean
}

export interface NotificationApi {
  notifications: Notification[]
  success(message: string, options?: ToastOptions): string
  info(message: string, options?: ToastOptions): string
  warning(message: string, options?: ToastOptions): string
  error(message: string, options?: ToastOptions): string
  banner(input: BannerInput): string
  dismiss(id: string): void
}

const NotificationContext = createContext<NotificationApi | null>(null)

export function NotificationProvider({ children }: { children: ReactNode }) {
  const api = useNotificationApi()
  return <NotificationContext.Provider value={api}>{children}</NotificationContext.Provider>
}

export function useNotifications(): NotificationApi {
  const api = useContext(NotificationContext)
  if (api === null) {
    throw new Error('useNotifications must be used within a NotificationProvider')
  }
  return api
}

// Severity drives the default lifetime: errors are sticky (no timer), others fade.
function defaultDuration(severity: NotificationSeverity): number | undefined {
  return severity === 'error' ? undefined : DEFAULT_TOAST_DURATION_MS
}

function useNotificationApi(): NotificationApi {
  const [state, dispatch] = useReducer(notificationReducer, emptyNotificationState)
  const counter = useRef(0)
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const clearTimer = useCallback((id: string) => {
    const timer = timers.current.get(id)
    if (timer !== undefined) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id)
      dispatch({ type: 'dismiss', id })
    },
    [clearTimer],
  )

  const emit = useCallback(
    (notification: Notification) => {
      clearTimer(notification.id)
      dispatch({ type: 'upsert', notification })
      if (notification.autoDismissMs !== undefined) {
        timers.current.set(
          notification.id,
          setTimeout(() => dismiss(notification.id), notification.autoDismissMs),
        )
      }
      return notification.id
    },
    [clearTimer, dismiss],
  )

  const nextId = useCallback(() => {
    counter.current += 1
    return `notification-${counter.current}`
  }, [])

  const toast = useCallback(
    (severity: NotificationSeverity, message: string, options?: ToastOptions) =>
      emit({
        id: options?.id ?? nextId(),
        tier: 'toast',
        severity,
        message,
        dismissible: options?.dismissible ?? true,
        autoDismissMs: options?.autoDismissMs ?? defaultDuration(severity),
        ...(options?.actions ? { actions: options.actions } : {}),
      }),
    [emit, nextId],
  )

  return useMemo<NotificationApi>(
    () => ({
      notifications: state.notifications,
      success: (message, options) => toast('success', message, options),
      info: (message, options) => toast('info', message, options),
      warning: (message, options) => toast('warning', message, options),
      error: (message, options) => toast('error', message, options),
      banner: (input) => emit({ tier: 'banner', dismissible: input.dismissible ?? true, ...input }),
      dismiss,
    }),
    [state.notifications, toast, emit, dismiss],
  )
}
```

Note: `useMemo` here depends on `state.notifications`, so the API identity changes when the list
changes; that is intended, since `notifications` is part of the API. The emitter callbacks are
stable.

- [ ] **Step 5: Run to confirm pass**

Run: `pnpm exec vitest run editor/design-system/notifications/use-notifications.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit GREEN**

```bash
git add editor/design-system/notifications/use-notifications.tsx
git commit -m "feat: add the notification provider and useNotifications hook"
```

- [ ] **Step 7: BLUE**

Review and refactor. Watch `max-lines-per-function`: `useNotificationApi` is near the limit, so the
refactorer may extract helpers. Empty marker if nothing actionable.

---

### Task 4: The promise wrapper

**Files:**

- Modify: `editor/design-system/notifications/use-notifications.tsx`
- Modify: `editor/design-system/notifications/notification.ts` (add the `PromiseMessages` type)
- Test: `editor/design-system/notifications/use-notifications-promise.test.tsx`

**Interfaces:**

- Consumes: the provider and `emit`/`nextId` internals (Task 3).
- Produces: `promise<T>(task, messages): Promise<T>` on `NotificationApi`, plus the public types:

```ts
// add to notification.ts
export type PromiseMessage = string | { message: string; actions?: NotificationAction[] }
export interface PromiseMessages<T> {
  pending: PromiseMessage
  success: (value: T) => PromiseMessage
  error: (error: unknown) => PromiseMessage
}
```

- [ ] **Step 1: Write the failing tests**

```tsx
// use-notifications-promise.test.tsx
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NotificationProvider, useNotifications } from './use-notifications'
import type { ReactNode } from 'react'

function wrapper({ children }: { children: ReactNode }) {
  return <NotificationProvider>{children}</NotificationProvider>
}

describe('useNotifications.promise', () => {
  it('shows a pending toast that resolves to success in place', async () => {
    const { result } = renderHook(() => useNotifications(), { wrapper })
    let resolve!: (value: string) => void
    const task = new Promise<string>((r) => {
      resolve = r
    })
    let returned!: Promise<string>
    act(() => {
      returned = result.current.promise(task, {
        pending: 'Exporting...',
        success: (value) => `Exported ${value}`,
        error: () => 'Export failed',
      })
    })
    expect(result.current.notifications).toHaveLength(1)
    expect(result.current.notifications[0]?.pending).toBe(true)
    await act(async () => {
      resolve('plan.pdf')
      await returned
    })
    await waitFor(() => expect(result.current.notifications[0]?.message).toBe('Exported plan.pdf'))
    expect(result.current.notifications).toHaveLength(1)
    expect(result.current.notifications[0]?.severity).toBe('success')
  })

  it('mutates the same toast to an error and rethrows', async () => {
    const { result } = renderHook(() => useNotifications(), { wrapper })
    const task = Promise.reject(new Error('disk full'))
    let returned!: Promise<unknown>
    act(() => {
      returned = result.current.promise(task, {
        pending: 'Exporting...',
        success: () => 'done',
        error: (e) => ({ message: `Export failed: ${(e as Error).message}` }),
      })
    })
    await act(async () => {
      await returned.catch(() => undefined)
    })
    await waitFor(() => expect(result.current.notifications[0]?.severity).toBe('error'))
    expect(result.current.notifications).toHaveLength(1)
    expect(result.current.notifications[0]?.message).toBe('Export failed: disk full')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm exec vitest run editor/design-system/notifications/use-notifications-promise.test.tsx`
Expected: FAIL (`result.current.promise` is not a function).

- [ ] **Step 3: Commit RED**

```bash
git add editor/design-system/notifications/use-notifications-promise.test.tsx editor/design-system/notifications/notification.ts
git commit -m "test: notification promise wrapper resolves and rejects in place"
```

- [ ] **Step 4: Implement `promise`**

Add inside `useNotificationApi`, then expose it on the returned API. A small helper normalizes the
string-or-object message form:

```tsx
function resolveMessage(message: PromiseMessage): {
  message: string
  actions?: NotificationAction[]
} {
  return typeof message === 'string' ? { message } : message
}
```

```tsx
// inside useNotificationApi, before the returned useMemo:
const promise = useCallback(
  <T,>(task: Promise<T>, messages: PromiseMessages<T>): Promise<T> => {
    const id = nextId()
    const pending = resolveMessage(messages.pending)
    emit({
      id,
      tier: 'toast',
      severity: 'info',
      message: pending.message,
      pending: true,
      dismissible: false,
    })
    task.then(
      (value) => {
        const resolved = resolveMessage(messages.success(value))
        emit({
          id,
          tier: 'toast',
          severity: 'success',
          message: resolved.message,
          dismissible: true,
          autoDismissMs: DEFAULT_TOAST_DURATION_MS,
          ...(resolved.actions ? { actions: resolved.actions } : {}),
        })
      },
      (error: unknown) => {
        const failed = resolveMessage(messages.error(error))
        emit({
          id,
          tier: 'toast',
          severity: 'error',
          message: failed.message,
          dismissible: true,
          ...(failed.actions ? { actions: failed.actions } : {}),
        })
      },
    )
    return task
  },
  [emit, nextId],
)
```

Add `promise` to the `NotificationApi` interface and to the returned `useMemo` object, with `promise`
added to that memo's dependency array. Import `PromiseMessage` and `PromiseMessages` from `./notification`.

- [ ] **Step 5: Run to confirm pass**

Run: `pnpm exec vitest run editor/design-system/notifications/use-notifications-promise.test.tsx`
Expected: PASS (2 tests). Also re-run Task 3's test to confirm no regression.

- [ ] **Step 6: Commit GREEN**

```bash
git add editor/design-system/notifications/use-notifications.tsx
git commit -m "feat: add the notification promise wrapper"
```

- [ ] **Step 7: BLUE**

Review and refactor; empty marker if nothing actionable.

---

### Task 5: Toast and ToastRegion components

**Files:**

- Create: `editor/design-system/notifications/toast.tsx`
- Create: `editor/design-system/notifications/toast.css`
- Create: `editor/design-system/notifications/toast.stories.tsx`
- Test: `editor/design-system/notifications/toast.test.tsx`

**Interfaces:**

- Consumes: `Notification`, `NotificationAction` (Task 1); `useNotifications` (Task 3, for `ToastRegion`).
- Produces: `Toast` (presentational, one notification + `onDismiss`) and `ToastRegion` (reads the
  list, renders the toasts).

```tsx
export interface ToastProps {
  notification: Notification
  onDismiss: (id: string) => void
}
export function Toast(props: ToastProps): JSX.Element
export function ToastRegion(): JSX.Element
```

- [ ] **Step 1: Write the failing tests**

```tsx
// toast.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Toast } from './toast'
import type { Notification } from './notification'

function base(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'a',
    tier: 'toast',
    severity: 'info',
    message: 'Hello',
    dismissible: true,
    ...overrides,
  }
}

describe('Toast', () => {
  it('renders the message', () => {
    render(<Toast notification={base()} onDismiss={() => {}} />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('uses role alert for errors and role status otherwise', () => {
    const { rerender } = render(
      <Toast notification={base({ severity: 'error' })} onDismiss={() => {}} />,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    rerender(<Toast notification={base({ severity: 'success' })} onDismiss={() => {}} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('calls onDismiss with the id when the dismiss button is clicked', async () => {
    const onDismiss = vi.fn()
    render(<Toast notification={base()} onDismiss={onDismiss} />)
    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(onDismiss).toHaveBeenCalledWith('a')
  })

  it('invokes an action handler', async () => {
    const onAction = vi.fn()
    render(
      <Toast
        notification={base({ actions: [{ label: 'Retry', onAction }] })}
        onDismiss={() => {}}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onAction).toHaveBeenCalledOnce()
  })

  it('omits the dismiss button when not dismissible', () => {
    render(<Toast notification={base({ dismissible: false })} onDismiss={() => {}} />)
    expect(screen.queryByRole('button', { name: /dismiss/i })).toBeNull()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm exec vitest run editor/design-system/notifications/toast.test.tsx`
Expected: FAIL (cannot resolve `./toast`).

- [ ] **Step 3: Commit RED**

```bash
git add editor/design-system/notifications/toast.test.tsx
git commit -m "test: Toast renders message, role, dismiss, and actions"
```

- [ ] **Step 4: Implement `Toast` and `ToastRegion`**

```tsx
// toast.tsx
import { useNotifications } from './use-notifications'
import type { Notification } from './notification'
import './toast.css'

export interface ToastProps {
  notification: Notification
  onDismiss: (id: string) => void
}

export function Toast({ notification, onDismiss }: ToastProps) {
  const role = notification.severity === 'error' ? 'alert' : 'status'
  return (
    <div className="ds-toast" data-severity={notification.severity} role={role}>
      {notification.pending ? <span className="ds-toast__spinner" aria-hidden="true" /> : null}
      <span className="ds-toast__message">{notification.message}</span>
      {(notification.actions ?? []).map((action) => (
        <button
          key={action.label}
          type="button"
          className="ds-toast__action"
          onClick={action.onAction}
        >
          {action.label}
        </button>
      ))}
      {notification.dismissible ? (
        <button
          type="button"
          className="ds-toast__dismiss"
          aria-label="Dismiss notification"
          onClick={() => onDismiss(notification.id)}
        >
          ×
        </button>
      ) : null}
    </div>
  )
}

// The anchored toast stack. The container is always mounted with aria-live so toasts inserted into
// it announce; error toasts carry role="alert" for assertive announcement.
export function ToastRegion() {
  const { notifications, dismiss } = useNotifications()
  const toasts = notifications.filter((n) => n.tier === 'toast')
  return (
    <div className="ds-toast-region" aria-live="polite" aria-relevant="additions">
      {toasts.map((notification) => (
        <Toast key={notification.id} notification={notification} onDismiss={dismiss} />
      ))}
    </div>
  )
}
```

```css
/* toast.css */
.ds-toast-region {
  position: fixed;
  right: var(--space-3);
  bottom: var(--space-6);
  z-index: 10;
  display: flex;
  flex-direction: column-reverse;
  gap: var(--space-2);
  max-width: 22rem;
  pointer-events: none;
}

.ds-toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface-panel);
  border: 1px solid var(--color-border);
  border-left: 4px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--elevation-overlay);
  color: var(--color-text);
  font-size: var(--font-size-sm);
  animation: ds-toast-in var(--motion-duration) ease-out;
}

.ds-toast[data-severity='success'] {
  border-left-color: var(--color-positive, var(--color-accent));
}
.ds-toast[data-severity='warning'] {
  border-left-color: var(--color-warning, var(--color-accent));
}
.ds-toast[data-severity='error'] {
  border-left-color: var(--color-danger, var(--color-accent));
}

.ds-toast__message {
  flex: 1 1 auto;
}

.ds-toast__action,
.ds-toast__dismiss {
  flex: 0 0 auto;
  min-height: var(--size-target-min);
  min-width: var(--size-target-min);
  background: transparent;
  border: none;
  color: var(--color-accent);
  cursor: pointer;
  font: inherit;
}

.ds-toast__dismiss {
  color: var(--color-text-muted);
}

.ds-toast__spinner {
  flex: 0 0 auto;
  width: var(--size-control-icon);
  height: var(--size-control-icon);
  border: 2px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: var(--radius-pill);
  animation: ds-toast-spin 0.8s linear infinite;
}

@keyframes ds-toast-in {
  from {
    opacity: 0;
    transform: translateY(var(--space-2));
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes ds-toast-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ds-toast {
    animation: none;
  }
  .ds-toast__spinner {
    animation-duration: 2s;
  }
}
```

If a token referenced above (for example `--color-danger` or `--color-positive`) is absent from
`tokens.css`, the `var(..., fallback)` keeps a valid color; confirm against
`editor/design-system/tokens.css` and add tokens there only if the design wants distinct severity
colors. Do that token addition as part of this task's GREEN step if needed.

- [ ] **Step 5: Run to confirm pass**

Run: `pnpm exec vitest run editor/design-system/notifications/toast.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 6: Add the CSF3 story with a play test**

```tsx
// toast.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { expect, within } from '@storybook/test'
import { Toast } from './toast'

const meta = {
  title: 'Notifications/Toast',
  component: Toast,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Toast>
export default meta
type Story = StoryObj<typeof meta>

export const Error: Story = {
  args: {
    notification: {
      id: 'a',
      tier: 'toast',
      severity: 'error',
      message: 'Save failed: disk full',
      dismissible: true,
      actions: [{ label: 'Retry', onAction: () => {} }],
    },
    onDismiss: () => {},
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  },
}

export const Success: Story = {
  args: {
    notification: {
      id: 'b',
      tier: 'toast',
      severity: 'success',
      message: 'Exported plan.pdf',
      dismissible: true,
    },
    onDismiss: () => {},
  },
}
```

- [ ] **Step 7: Run the story play tests**

Run: `pnpm storybook:test` (or the project's story-test command). Confirm the Toast stories pass.

- [ ] **Step 8: Commit GREEN (component + story)**

```bash
git add editor/design-system/notifications/toast.tsx editor/design-system/notifications/toast.css editor/design-system/notifications/toast.stories.tsx
git commit -m "feat: add the Toast and ToastRegion components"
```

- [ ] **Step 9: Regenerate the arm64 visual baseline**

Start the arm64 container (`colima start --cpu 6 --memory 12`), regenerate with the project's
story-baseline command rendered `--platform linux/arm64`, then `colima stop`. Commit the new
baseline PNGs:

```bash
git add tests/ # the baseline path the story-visual gate uses
git commit -m "test(visual): add Toast story baselines"
```

(`test(visual)` glue follows the project's baseline-commit convention; see the storybook-visual
regression setup. This commit is part of the same cycle and is rgb-audit exempt as a visual baseline.)

- [ ] **Step 10: BLUE**

Review and refactor; empty marker if nothing actionable.

---

### Task 6: AppFrame banner slot

**Files:**

- Modify: `editor/design-system/app-frame.tsx`
- Modify: `editor/design-system/app-frame.css`
- Test: `editor/design-system/app-frame.test.tsx` (add a case; create the file if absent)

**Interfaces:**

- Produces: `AppFrameProps` gains `banner?: ReactNode`, rendered in a full-width row directly under
  the header. The banner row only takes layout space when the banner has content.

- [ ] **Step 1: Write the failing test**

```tsx
// app-frame.test.tsx (add this case)
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AppFrame } from './app-frame'

describe('AppFrame banner slot', () => {
  it('renders banner content under the header when provided', () => {
    render(
      <AppFrame
        header={<div>header</div>}
        banner={<div>degraded storage</div>}
        rail={<div>rail</div>}
        railLabel="Rail"
        main={<div>main</div>}
        mainLabel="Main"
        inspector={<div>inspector</div>}
        inspectorLabel="Inspector"
      />,
    )
    expect(screen.getByText('degraded storage')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm exec vitest run editor/design-system/app-frame.test.tsx`
Expected: FAIL (`banner` is not an accepted prop / content not found). If a typecheck error blocks the
run, that counts as the RED signal; capture it.

- [ ] **Step 3: Commit RED**

```bash
git add editor/design-system/app-frame.test.tsx
git commit -m "test: AppFrame renders an optional banner slot under the header"
```

- [ ] **Step 4: Implement the slot**

In `app-frame.tsx`, add `banner?: ReactNode` to `AppFrameProps`, destructure it, and render it right
after the `<header>`:

```tsx
<header className="ds-app-frame__header" role="banner">
  {header}
</header>
<div className="ds-app-frame__banner">{banner}</div>
```

In `app-frame.css`, add the banner area and the conditional grid rows. The default templates are
unchanged; the banner row is inserted only when the banner div has content, so an absent or
render-nothing banner adds no row and no gap:

```css
.ds-app-frame__banner {
  grid-area: banner;
}

.ds-app-frame:has(.ds-app-frame__banner:not(:empty)) {
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  grid-template-areas:
    'header header header'
    'banner banner banner'
    'rail main inspector'
    'statusbar statusbar statusbar';
}

.ds-app-frame[data-breakpoint='medium']:has(.ds-app-frame__banner:not(:empty)) {
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  grid-template-areas:
    'header header'
    'banner banner'
    'main inspector'
    'statusbar statusbar';
}

.ds-app-frame[data-breakpoint='narrow']:has(.ds-app-frame__banner:not(:empty)) {
  grid-template-rows: auto auto minmax(0, 1fr) auto auto;
  grid-template-areas:
    'header'
    'banner'
    'main'
    'inspector'
    'statusbar';
}
```

The `:empty` selector is true when `BannerRegion` renders `null` (no banners), so the row collapses
out entirely; it becomes false the moment a banner appears.

- [ ] **Step 5: Run to confirm pass**

Run: `pnpm exec vitest run editor/design-system/app-frame.test.tsx`
Expected: PASS. Re-run the full design-system test folder to confirm no layout test regressed.

- [ ] **Step 6: Commit GREEN**

```bash
git add editor/design-system/app-frame.tsx editor/design-system/app-frame.css
git commit -m "feat: add an optional banner slot to AppFrame"
```

- [ ] **Step 7: BLUE**

Review and refactor; empty marker if nothing actionable.

---

### Task 7: Banner and BannerRegion components

**Files:**

- Create: `editor/design-system/notifications/banner.tsx`
- Create: `editor/design-system/notifications/banner.css`
- Create: `editor/design-system/notifications/banner.stories.tsx`
- Test: `editor/design-system/notifications/banner.test.tsx`

**Interfaces:**

- Consumes: `Notification` (Task 1), `useNotifications` (Task 3).
- Produces: `Banner` (presentational) and `BannerRegion` (renders banner-tier notifications, or
  `null` when there are none, so the AppFrame banner row collapses).

```tsx
export interface BannerProps {
  notification: Notification
  onDismiss: (id: string) => void
}
export function Banner(props: BannerProps): JSX.Element
export function BannerRegion(): JSX.Element | null
```

- [ ] **Step 1: Write the failing tests**

```tsx
// banner.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Banner, BannerRegion } from './banner'
import { NotificationProvider, useNotifications } from './use-notifications'
import type { Notification } from './notification'
import { useEffect } from 'react'

function base(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'storage-degraded',
    tier: 'banner',
    severity: 'warning',
    message: 'Storage is degraded',
    dismissible: true,
    ...overrides,
  }
}

describe('Banner', () => {
  it('uses role alert for warning and error', () => {
    render(<Banner notification={base({ severity: 'warning' })} onDismiss={() => {}} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('calls onDismiss with the id', async () => {
    const onDismiss = vi.fn()
    render(<Banner notification={base()} onDismiss={onDismiss} />)
    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(onDismiss).toHaveBeenCalledWith('storage-degraded')
  })
})

describe('BannerRegion', () => {
  it('renders nothing when there are no banners', () => {
    const { container } = render(
      <NotificationProvider>
        <BannerRegion />
      </NotificationProvider>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders an emitted banner', () => {
    function Emit() {
      const { banner } = useNotifications()
      useEffect(() => {
        banner({ id: 'storage-degraded', severity: 'warning', message: 'Storage is degraded' })
      }, [banner])
      return <BannerRegion />
    }
    render(
      <NotificationProvider>
        <Emit />
      </NotificationProvider>,
    )
    expect(screen.getByText('Storage is degraded')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm exec vitest run editor/design-system/notifications/banner.test.tsx`
Expected: FAIL (cannot resolve `./banner`).

- [ ] **Step 3: Commit RED**

```bash
git add editor/design-system/notifications/banner.test.tsx
git commit -m "test: Banner role mapping and BannerRegion empty and populated states"
```

- [ ] **Step 4: Implement `Banner` and `BannerRegion`**

```tsx
// banner.tsx
import { useNotifications } from './use-notifications'
import type { Notification } from './notification'
import './banner.css'

export interface BannerProps {
  notification: Notification
  onDismiss: (id: string) => void
}

export function Banner({ notification, onDismiss }: BannerProps) {
  const role =
    notification.severity === 'warning' || notification.severity === 'error' ? 'alert' : 'status'
  return (
    <div className="ds-banner" data-severity={notification.severity} role={role}>
      <span className="ds-banner__message">{notification.message}</span>
      {(notification.actions ?? []).map((action) => (
        <button
          key={action.label}
          type="button"
          className="ds-banner__action"
          onClick={action.onAction}
        >
          {action.label}
        </button>
      ))}
      {notification.dismissible ? (
        <button
          type="button"
          className="ds-banner__dismiss"
          aria-label="Dismiss notification"
          onClick={() => onDismiss(notification.id)}
        >
          ×
        </button>
      ) : null}
    </div>
  )
}

// Returns null when there are no banners, so the AppFrame banner row collapses. Banners are rare and
// persistent; their role="alert"/"status" surfaces them to assistive technology.
export function BannerRegion() {
  const { notifications, dismiss } = useNotifications()
  const banners = notifications.filter((n) => n.tier === 'banner')
  if (banners.length === 0) {
    return null
  }
  return (
    <div className="ds-banner-region">
      {banners.map((notification) => (
        <Banner key={notification.id} notification={notification} onDismiss={dismiss} />
      ))}
    </div>
  )
}
```

```css
/* banner.css */
.ds-banner-region {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.ds-banner {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  box-sizing: border-box;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-panel);
  color: var(--color-text);
  font-size: var(--font-size-sm);
}

.ds-banner[data-severity='warning'] {
  border-color: var(--color-warning, var(--color-border));
}
.ds-banner[data-severity='error'] {
  border-color: var(--color-danger, var(--color-border));
}

.ds-banner__message {
  flex: 1 1 auto;
}

.ds-banner__action,
.ds-banner__dismiss {
  flex: 0 0 auto;
  min-height: var(--size-target-min);
  min-width: var(--size-target-min);
  background: transparent;
  border: none;
  color: var(--color-accent);
  cursor: pointer;
  font: inherit;
}

.ds-banner__dismiss {
  color: var(--color-text-muted);
}
```

- [ ] **Step 5: Run to confirm pass**

Run: `pnpm exec vitest run editor/design-system/notifications/banner.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Add the story and play test**

```tsx
// banner.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { expect, within } from '@storybook/test'
import { Banner } from './banner'

const meta = {
  title: 'Notifications/Banner',
  component: Banner,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Banner>
export default meta
type Story = StoryObj<typeof meta>

export const DegradedStorage: Story = {
  args: {
    notification: {
      id: 'storage-degraded',
      tier: 'banner',
      severity: 'warning',
      message: 'Storage is unavailable. Your work will not be saved between sessions.',
      dismissible: true,
    },
    onDismiss: () => {},
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('alert')).toBeInTheDocument()
  },
}
```

- [ ] **Step 7: Run story play tests, then commit GREEN**

Run: `pnpm storybook:test`. Then:

```bash
git add editor/design-system/notifications/banner.tsx editor/design-system/notifications/banner.css editor/design-system/notifications/banner.stories.tsx
git commit -m "feat: add the Banner and BannerRegion components"
```

- [ ] **Step 8: Regenerate the arm64 baseline and commit**

As in Task 5, Step 9:

```bash
git add tests/
git commit -m "test(visual): add Banner story baselines"
```

- [ ] **Step 9: BLUE**

Review and refactor; empty marker if nothing actionable.

---

### Task 8: Mount the provider and regions

**Files:**

- Create: `editor/design-system/notifications/index.ts`
- Modify: `editor/design-system/index.ts`
- Modify: `app/app.tsx` (wrap `AppWorkspace` in `NotificationProvider`)
- Modify: `editor/shell/editor-shell.tsx` (render `ToastRegion`; pass `BannerRegion` to `AppFrame`)
- Test: `editor/shell/editor-shell.test.tsx` (add a mount assertion) or a focused new test

**Interfaces:**

- Consumes: `NotificationProvider`, `ToastRegion`, `BannerRegion`, `useNotifications`.
- Produces: the running wiring. After this task `useNotifications()` works anywhere in the editor tree.

This task is mostly glue, so the implementation commit carries an `Infrastructure:` trailer, but it
still lands behind a test that proves a notification reaches the screen.

- [ ] **Step 1: Create the barrel and re-export**

```ts
// editor/design-system/notifications/index.ts
export { humanMessage } from './human-message'
export {
  NotificationProvider,
  useNotifications,
  type NotificationApi,
  type BannerInput,
  type ToastOptions,
} from './use-notifications'
export { Toast, ToastRegion } from './toast'
export { Banner, BannerRegion } from './banner'
export type {
  Notification,
  NotificationSeverity,
  NotificationAction,
  PromiseMessages,
} from './notification'
```

Add to `editor/design-system/index.ts`:

```ts
export * from './notifications'
```

- [ ] **Step 2: Write the failing integration test**

A small test that renders an editor surface, emits a notification via the hook, and asserts it shows.
The lightest version mounts the provider plus `ToastRegion` and a button that emits, proving the wiring
contract the shell relies on:

```tsx
// editor/design-system/notifications/wiring.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { NotificationProvider, ToastRegion, useNotifications } from './index'

function EmitButton() {
  const { error } = useNotifications()
  return (
    <button type="button" onClick={() => error('Save failed')}>
      break
    </button>
  )
}

describe('notification wiring', () => {
  it('shows an emitted error toast in the region', async () => {
    render(
      <NotificationProvider>
        <EmitButton />
        <ToastRegion />
      </NotificationProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'break' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Save failed')
  })
})
```

- [ ] **Step 3: Run to confirm failure, commit RED**

Run: `pnpm exec vitest run editor/design-system/notifications/wiring.test.tsx`
Expected: FAIL until the barrel exists (cannot resolve `./index`).

```bash
git add editor/design-system/notifications/wiring.test.tsx
git commit -m "test: an emitted toast renders through the region barrel"
```

- [ ] **Step 4: Implement the barrel and the mounts**

Create the barrel (Step 1). In `app/app.tsx`, import `NotificationProvider` from
`../editor/design-system` and wrap the real-app branch:

```tsx
// app.tsx, in App()
return (
  <NotificationProvider>
    <AppWorkspace {...props} />
  </NotificationProvider>
)
```

In `editor/shell/editor-shell.tsx`, import `ToastRegion`, `BannerRegion` from `../design-system`.
Render `<ToastRegion />` once inside the shell (next to `<CommandPalette />`), and pass the banner
into `AppFrame`:

```tsx
<AppFrame
  header={<ShellHeader saveStatus={saveStatus} projectControls={projectControls} />}
  banner={<BannerRegion />}
  railLabel="Tool rail"
  ...
/>
```

and add `<ToastRegion />` alongside `<CommandPalette />`:

```tsx
<KeybindingLayer />
<CommandPalette />
<ToastRegion />
```

- [ ] **Step 5: Run to confirm pass**

Run: `pnpm exec vitest run editor/design-system/notifications/wiring.test.tsx`
Expected: PASS. Then run the shell test folder and `pnpm typecheck` to confirm the mounts compile.

- [ ] **Step 6: Commit GREEN (glue)**

```bash
git add editor/design-system/notifications/index.ts editor/design-system/index.ts app/app.tsx editor/shell/editor-shell.tsx
git commit -m "feat: mount the notification provider and regions

Infrastructure: wiring only, behavior covered by the region barrel test"
```

- [ ] **Step 7: BLUE**

Review and refactor; empty marker if nothing actionable.

---

### Task 9: Wire file-operation error toasts (#233)

**Files:**

- Modify: `app/use-project-actions.ts` (add `notifications` to the context; emit on save/open/reopen failure)
- Modify: `app/use-workspace-state.ts` (pass `notifications: useNotifications()` into `useProjectActions`)
- Test: `app/use-project-actions.test.ts` (the existing hook tests; add error-toast cases and the
  `notifications` fixture)

**Interfaces:**

- Consumes: `NotificationApi` (Task 3), `humanMessage` (Task 2).
- Produces: `ProjectActionsContext` gains `notifications: NotificationApi`. The save, open-folder,
  open-recent, and reopen-folder handlers emit an error toast with a Retry action on failure.

The three async export actions are handled in Task 10 (they get promise toasts, which subsume their
error handling), so this task covers the four non-export catch sites.

Because the action hooks now read `context.notifications`, every existing test that builds a
`ProjectActionsContext` must add a fake. The `test-author` owns those edits. A reusable fake:

```ts
function fakeNotifications(): NotificationApi {
  return {
    notifications: [],
    success: vi.fn(() => 'id'),
    info: vi.fn(() => 'id'),
    warning: vi.fn(() => 'id'),
    error: vi.fn(() => 'id'),
    banner: vi.fn(() => 'id'),
    promise: vi.fn((task) => task),
    dismiss: vi.fn(),
  }
}
```

- [ ] **Step 1: Write the failing test (save failure emits an error toast)**

Add to the existing hook test (following its established render/context pattern):

```ts
it('emits an error toast with Retry when save fails', async () => {
  const notifications = fakeNotifications()
  const store = {
    save: vi.fn().mockRejectedValue(new Error('disk full')) /* plus the rest the context needs */,
  }
  const context = buildContext({ store, notifications }) // the test's existing context builder, plus notifications
  const { result } = renderHook(() => useProjectActions(context))
  await act(async () => {
    result.current.onSave()
    await Promise.resolve()
  })
  expect(notifications.error).toHaveBeenCalledWith(
    'disk full',
    expect.objectContaining({
      actions: [expect.objectContaining({ label: 'Retry' })],
    }),
  )
})
```

Match the existing test file's helpers for building the context and stubbing `commitProject`/the store.
If the existing tests stub `commitProject` via module mock, reuse that mock and make it reject for this case.

- [ ] **Step 2: Run to confirm failure, commit RED**

Run: `pnpm exec vitest run app/use-project-actions.test.ts`
Expected: FAIL (no error toast emitted; `notifications.error` not called). The same commit updates the
other existing context builders to include the `notifications` fake so the suite still typechecks.

```bash
git add app/use-project-actions.test.ts
git commit -m "test: save failure emits an error toast with retry"
```

- [ ] **Step 3: Implement**

Add `notifications: NotificationApi` to `ProjectActionsContext` (import the type from
`../editor/design-system`). In `useSaveAction`, replace the `.catch(console.error)` with an emit, and
add a Retry that re-runs the save. Use a nested `attempt` so Retry re-invokes the same operation
without a self-referential `useCallback`:

```ts
function useSaveAction(context: ProjectActionsContext): () => void {
  const {
    session,
    store,
    projectId,
    snapshots,
    recentProjects,
    capabilities,
    markSaved,
    notifications,
  } = context
  const backend = defaultStoreBackend(capabilities)
  return useCallback(() => {
    const attempt = () => {
      const project = session.getProject()
      void commitProject({ store, projectId, project, ...(snapshots ? { snapshots } : {}) })
        .then(() => {
          if (backend !== null) {
            recordRecent(recentProjects, { id: projectId, name: project.meta.name, backend })
          }
          markSaved?.()
        })
        .catch((error: unknown) => {
          notifications.error(humanMessage(error), {
            actions: [{ label: 'Retry', onAction: attempt }],
          })
        })
    }
    attempt()
  }, [session, store, projectId, snapshots, recentProjects, backend, markSaved, notifications])
}
```

Apply the same `attempt` plus `notifications.error(humanMessage(error), { actions: [{ label: 'Retry', onAction: attempt }] })`
replacement to `useOpenFolderAction`, `useOpenRecentAction` (the `store.load` catch), and
`openFolderRecent`. For `openFolderRecent`, thread `notifications` in through its context object
(`OpenFolderRecentContext` gains `notifications: NotificationApi`), and Retry re-invokes
`openFolderRecent(context)`.

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm exec vitest run app/use-project-actions.test.ts`
Expected: PASS, including the existing tests (now carrying the fake).

- [ ] **Step 5: Wire the workspace injection**

In `app/use-workspace-state.ts`, import `useNotifications` and pass it through:

```ts
import { useNotifications } from '../editor/design-system'
// ...
const notifications = useNotifications()
const actions = useProjectActions({
  ...props,
  recentEntries,
  isDirty,
  confirmDiscard,
  markSaved,
  notifications,
})
```

Run `pnpm typecheck` to confirm the context is satisfied at the call site.

- [ ] **Step 6: Commit GREEN**

```bash
git add app/use-project-actions.ts app/use-workspace-state.ts
git commit -m "feat: surface file-operation failures as error toasts with retry"
```

- [ ] **Step 7: BLUE**

Review and refactor. The four handlers now share a shape; the refactorer may extract a small
`withErrorToast(notifications, run)` helper. Keep it if it reduces duplication without obscuring the
call sites. Empty marker if nothing actionable.

---

### Task 10: Wire export progress toasts (#267)

**Files:**

- Modify: `app/use-project-actions.ts` (the four export actions)
- Test: `app/use-project-actions.test.ts`

**Interfaces:**

- Consumes: `notifications.promise` (Task 4), `humanMessage` (Task 2).
- Produces: the three async exports show a promise toast; the synchronous export shows a plain toast.

- [ ] **Step 1: Write the failing tests**

```ts
it('shows a promise toast for a bundle export', () => {
  const notifications = fakeNotifications()
  const context = buildContext({ notifications })
  const { result } = renderHook(() => useProjectActions(context))
  act(() => {
    result.current.onExportBundle()
  })
  expect(notifications.promise).toHaveBeenCalledWith(
    expect.any(Promise),
    expect.objectContaining({ pending: expect.stringMatching(/Exporting/) }),
  )
})

it('shows a success toast for the synchronous plan export', () => {
  const notifications = fakeNotifications()
  const context = buildContext({ notifications })
  const { result } = renderHook(() => useProjectActions(context))
  act(() => {
    result.current.onExportPlan()
  })
  expect(notifications.success).toHaveBeenCalledWith(expect.stringMatching(/Exported/))
})
```

- [ ] **Step 2: Run to confirm failure, commit RED**

Run: `pnpm exec vitest run app/use-project-actions.test.ts`
Expected: FAIL (`notifications.promise` / `notifications.success` not called).

```bash
git add app/use-project-actions.test.ts
git commit -m "test: exports show promise and success toasts"
```

- [ ] **Step 3: Implement**

For `useExportBundleAction`, wrap the existing promise chain:

```ts
function useExportBundleAction(context: ProjectActionsContext): () => void {
  const { session, projectId, assets, notifications } = context
  return useCallback(() => {
    const project = session.getProject()
    const name = bundleFilename(project.meta.name)
    const attempt = () =>
      notifications.promise(
        exportProjectBundle(projectId, project, assets).then((bytes) => downloadBytes(bytes, name)),
        {
          pending: `Exporting ${name}...`,
          success: () => `Exported ${name}`,
          error: (e) => ({
            message: `Export failed: ${humanMessage(e)}`,
            actions: [{ label: 'Retry', onAction: attempt }],
          }),
        },
      )
    void attempt()
  }, [session, projectId, assets, notifications])
}
```

Apply the same shape to `useExportImageAction` and `useExportPdfAction` (each wrapping its existing
`rasterizeSvgToPng(...).then(...)` / `svgPlanToPdf(...).then(...)` chain). For the synchronous
`useExportPlanAction`, wrap the `downloadText` call in a try/catch and emit a plain toast:

```ts
function useExportPlanAction(context: ProjectActionsContext): () => void {
  const { session, notifications } = context
  return useCallback(() => {
    const project = session.getProject()
    const name = svgPlanFilename(project.meta.name)
    try {
      const { content } = new SvgPlanExporter().export(project)
      downloadText(content, name, 'image/svg+xml')
      notifications.success(`Exported ${name}`)
    } catch (error) {
      notifications.error(`Export failed: ${humanMessage(error)}`)
    }
  }, [session, notifications])
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm exec vitest run app/use-project-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit GREEN**

```bash
git add app/use-project-actions.ts
git commit -m "feat: show export progress as promise and success toasts"
```

- [ ] **Step 6: BLUE**

Review and refactor; empty marker if nothing actionable.

---

### Task 11: Wire the degraded-storage banner (#262)

**Files:**

- Modify: `app/app.tsx` (raise the banner from `AppWorkspace` when storage is degraded)
- Test: `app/app.test.tsx` or a focused `app/use-degraded-storage-banner.test.tsx`

**Interfaces:**

- Consumes: `useNotifications` (Task 3), `isStorageDegraded`, `summarizeStorageCapabilities` (storage).
- Produces: a `useDegradedStorageBanner(capabilities)` hook called in `AppWorkspace`, which raises a
  dismissible `storage-degraded` banner when the resolved capabilities are degraded.

`AppWorkspace` is under the provider (Task 8 mounts it in `App`), so emitting from here is valid.

- [ ] **Step 1: Write the failing test**

```tsx
// use-degraded-storage-banner.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NotificationProvider, BannerRegion } from '../editor/design-system'
import { useDegradedStorageBanner } from './use-degraded-storage-banner'
import type { StorageCapabilities } from '../storage'

const degraded: StorageCapabilities = { opfs: false, indexedDb: false, fileSystemAccess: false }

function Harness({ capabilities }: { capabilities: StorageCapabilities | null }) {
  useDegradedStorageBanner(capabilities)
  return <BannerRegion />
}

describe('useDegradedStorageBanner', () => {
  it('raises a dismissible storage-degraded banner when degraded', () => {
    render(
      <NotificationProvider>
        <Harness capabilities={degraded} />
      </NotificationProvider>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/storage/i)
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument()
  })

  it('raises nothing while capabilities are still resolving', () => {
    const { container } = render(
      <NotificationProvider>
        <Harness capabilities={null} />
      </NotificationProvider>,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
```

Confirm the exact `StorageCapabilities` shape against `storage/storage-capabilities.ts` when writing
the fixture.

- [ ] **Step 2: Run to confirm failure, commit RED**

Run: `pnpm exec vitest run app/use-degraded-storage-banner.test.tsx`
Expected: FAIL (cannot resolve the hook).

```bash
git add app/use-degraded-storage-banner.test.tsx
git commit -m "test: degraded storage raises a dismissible banner"
```

- [ ] **Step 3: Implement the hook and call it**

```ts
// app/use-degraded-storage-banner.ts
import { useEffect } from 'react'
import { useNotifications } from '../editor/design-system'
import {
  isStorageDegraded,
  summarizeStorageCapabilities,
  type StorageCapabilities,
} from '../storage'

// Raise the storage-degraded banner once capabilities resolve and report no durable backend. The
// stable id keeps re-renders idempotent.
export function useDegradedStorageBanner(capabilities: StorageCapabilities | null): void {
  const { banner } = useNotifications()
  useEffect(() => {
    if (capabilities !== null && isStorageDegraded(capabilities)) {
      banner({
        id: 'storage-degraded',
        severity: 'warning',
        message: summarizeStorageCapabilities(capabilities),
        dismissible: true,
      })
    }
  }, [capabilities, banner])
}
```

In `app/app.tsx`, call it from `AppWorkspace` with the resolved capabilities, and drop the
`console.warn` from `useStorageCapabilities` (the banner replaces it):

```tsx
const capabilities = useStorageCapabilities()
useDegradedStorageBanner(capabilities)
```

Remove the `if (isStorageDegraded(probed)) { console.warn(...) }` block from `useStorageCapabilities`
and drop the now-unused imports if they are no longer referenced there.

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm exec vitest run app/use-degraded-storage-banner.test.tsx`
Expected: PASS. Re-run `app/app.test.tsx` to confirm the boot path still passes.

- [ ] **Step 5: Commit GREEN**

```bash
git add app/use-degraded-storage-banner.ts app/app.tsx
git commit -m "feat: warn about degraded storage with a banner"
```

- [ ] **Step 6: BLUE**

Review and refactor; empty marker if nothing actionable.

---

### Task 12: Migrate the import-error alert

**Files:**

- Modify: `app/use-open-file-action.ts` (emit `notifications.error`; drop `errorMessage` and `importStatus`)
- Modify: `app/use-project-actions.ts` (drop `importStatus` / `dismissImportStatus` from the returned shape)
- Modify: `editor/shell/editor-shell.tsx` (remove the `ImportAlert` mount and its props)
- Modify: `app/app.tsx` (remove the `onDismissImportStatus` spread to `EditorShell`)
- Delete: `editor/shell/import-alert.tsx`, `editor/shell/import-alert.css`, and the ImportAlert
  test/story if present
- Test: `app/use-open-file-action.test.ts`

**Interfaces:**

- Consumes: `notifications.error` (Task 3), `humanMessage` (Task 2).
- Produces: import failures raise an error toast naming the file. The `ImportStatus` type, the
  `importStatus`/`dismissImportStatus` fields, and the `ImportAlert` component are removed.

- [ ] **Step 1: Write the failing test**

```ts
it('emits an error toast naming the file when import fails', async () => {
  const notifications = fakeNotifications()
  const context = buildContext({ notifications }) // include notifications in the open-file context
  const { result } = renderHook(() => useOpenFileAction(context))
  const file = new File(['not a project'], 'broken.building')
  await act(async () => {
    await result.current.onImportDroppedFile(file)
  })
  expect(notifications.error).toHaveBeenCalledWith(expect.stringContaining('broken.building'))
})
```

Remove or update any existing test that asserted on `importStatus` (those move to the toast assertion).

- [ ] **Step 2: Run to confirm failure, commit RED**

Run: `pnpm exec vitest run app/use-open-file-action.test.ts`
Expected: FAIL (`notifications.error` not called).

```bash
git add app/use-open-file-action.test.ts
git commit -m "test: import failure raises an error toast"
```

- [ ] **Step 3: Implement the migration**

In `app/use-open-file-action.ts`: import `humanMessage` from `../editor/design-system`, read
`notifications` from the context, and in the catch emit a toast instead of setting status. Remove the
local `errorMessage`, the `ImportStatus` state, and the `importStatus`/`dismissImportStatus` returns:

```ts
} catch (error) {
  notifications.error(`Couldn't open ${file.name}: ${humanMessage(error)}`)
}
```

The hook's return narrows to `{ onImportDroppedFile, onOpenFile }`. Update
`app/use-project-actions.ts`: drop `ImportStatus`, the `importStatus`/`dismissImportStatus` members of
`ProjectActions`, and the `export type { ImportStatus }`. In `editor/shell/editor-shell.tsx`, remove
the `import { ImportAlert }` line and the `<ImportAlert .../>` block, and drop `onDismissImportStatus`
from `EditorShellProps` if it is declared there. In `app/app.tsx`, remove the
`onDismissImportStatus={ws.actions.dismissImportStatus}` prop. Delete `import-alert.tsx` and
`import-alert.css`.

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm exec vitest run app/use-open-file-action.test.ts`
Then `pnpm typecheck` to catch every dangling reference to the removed fields. Fix each until clean.

- [ ] **Step 5: Commit GREEN**

```bash
git add -A
git commit -m "feat: route import errors through the notification system"
```

- [ ] **Step 6: BLUE**

Review and refactor; empty marker if nothing actionable.

---

### Task 13: Autosave failure tie-in

**Files:**

- Modify: `editor/shell/editor-shell.tsx` (raise an error toast when the save status reaches `error`)
- Test: `editor/shell/editor-shell.test.tsx` or a focused `editor/shell/use-save-failure-toast.test.tsx`

**Interfaces:**

- Consumes: `useNotifications` (Task 3), `AutosaveStatus` (bridge).
- Produces: a `useSaveFailureToast(saveStatus)` hook that raises one error toast when the status
  transitions into `error`. The header readout is unchanged.

- [ ] **Step 1: Write the failing test**

```tsx
// use-save-failure-toast.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NotificationProvider, ToastRegion } from '../design-system'
import { useSaveFailureToast } from './use-save-failure-toast'
import type { AutosaveStatus } from '../../bridge'

function Harness({ status }: { status: AutosaveStatus }) {
  useSaveFailureToast(status)
  return <ToastRegion />
}

describe('useSaveFailureToast', () => {
  it('raises an error toast when the status becomes error', () => {
    const { rerender } = render(
      <NotificationProvider>
        <Harness status="pending" />
      </NotificationProvider>,
    )
    expect(screen.queryByRole('alert')).toBeNull()
    rerender(
      <NotificationProvider>
        <Harness status="error" />
      </NotificationProvider>,
    )
    // Note: re-rendering a fresh provider resets state; in the real shell the provider is stable.
    // Prefer a single stable provider with a state setter in the harness; see implementation note.
    expect(screen.getByRole('alert')).toHaveTextContent(/save failed/i)
  })
})
```

Implementation note for the test author: keep the `NotificationProvider` stable across the rerender
(lift it outside `Harness`, drive `status` through a state setter) so the toast survives the status
change. The assertion is that an error toast appears once the status is `error`.

- [ ] **Step 2: Run to confirm failure, commit RED**

Run: `pnpm exec vitest run editor/shell/use-save-failure-toast.test.tsx`
Expected: FAIL (cannot resolve the hook).

```bash
git add editor/shell/use-save-failure-toast.test.tsx
git commit -m "test: a failed save raises an error toast"
```

- [ ] **Step 3: Implement**

```ts
// editor/shell/use-save-failure-toast.ts
import { useEffect, useRef } from 'react'
import { useNotifications } from '../design-system'
import type { AutosaveStatus } from '../../bridge'

// Raise one error toast on the transition into the error status. A ref tracks the previous status so
// re-renders that keep the status at error do not stack duplicate toasts.
export function useSaveFailureToast(status: AutosaveStatus): void {
  const { error } = useNotifications()
  const previous = useRef<AutosaveStatus>(status)
  useEffect(() => {
    if (status === 'error' && previous.current !== 'error') {
      error('Save failed. Your latest changes are not saved yet.')
    }
    previous.current = status
  }, [status, error])
}
```

Call it from `EditorShell`, passing the `saveStatus` prop. Do not change the header readout.

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm exec vitest run editor/shell/use-save-failure-toast.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit GREEN**

```bash
git add editor/shell/use-save-failure-toast.ts editor/shell/editor-shell.tsx
git commit -m "feat: raise an error toast when autosave fails"
```

- [ ] **Step 6: BLUE**

Review and refactor; empty marker if nothing actionable.

---

### Task 14: Architecture Decision Record

**Files:**

- Create: `docs/knowledge/decisions/ADR-0118-notification-subsystem.md` (verify 0118 is the next free
  number under `docs/knowledge/decisions/` at write time; bump if taken)

**Interfaces:** none (documentation).

- [ ] **Step 1: Scaffold the ADR**

Run the project ADR scaffold: `/adr notification-subsystem "Notification subsystem"` (or copy the ADR
template). Fill in:

- **Context:** the editor had no shared feedback channel; failures were swallowed to `console.error`,
  degraded storage only warned, and the import alert was a one-off component.
- **Decision:** a React context-and-hook notification system with two tiers (toast, banner), emitted
  from the React boundary, held outside `dispatch(command)` and undo history. One pure reducer owns
  the list. A promise wrapper drives indeterminate export progress. The framework-agnostic event bus
  was rejected as premature (every emit site is in React; `core/` must not emit).
- **Consequences:** file-operation failures, export progress, degraded storage, and import errors now
  surface uniformly. Determinate progress (#320), a notification history, and routing the autosave
  readout or the crash-recovery prompt (#232) stay out of scope.

Reference the spec (`docs/specs/2026-06-21-notification-subsystem.md`). No em-dashes in the prose.

- [ ] **Step 2: Run the humanizer on the ADR prose**

The ADR is human-read, so it passes through the `humanizer` skill before committing (project rule 17).

- [ ] **Step 3: Commit**

```bash
git add docs/knowledge/decisions/ADR-0118-notification-subsystem.md
git commit -m "docs: record the notification subsystem decision (ADR-0118)"
```

- [ ] **Step 4: Regenerate the local knowledge index (optional, gitignored)**

Run `pnpm knowledge:index` if useful. The generated index is local-only and not committed.

---

## Final verification before the PR

- [ ] `pnpm rgb:audit origin/main..HEAD` passes (every behavior is test then feat then refactor;
      glue carries `Infrastructure:`; visual-baseline and e2e commits are exempt).
- [ ] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm integration:audit && pnpm build`.
- [ ] `pnpm storybook:test` passes, including the new Toast and Banner stories.
- [ ] `pnpm exec playwright test --project=chromium` passes (no double-announce regression in the
      existing plan-overlay and scene-proxy live regions).
- [ ] Manual smoke: force a save failure and an import failure (error toasts with Retry), run an
      export (promise toast resolves), and simulate degraded storage (dismissible banner under the header).
- [ ] Open the PR; let CI run (now unblocked); merge through the merge queue. Never push to `main`.

## Self-review against the spec

- Two-tier model (toast, banner), one record: Tasks 1, 5, 7.
- Stable id updates in place; toast cap; error stickiness: Tasks 1, 3.
- Ergonomic API including the promise wrapper: Tasks 3, 4.
- humanMessage shared mapper: Task 2 (adopted in Tasks 9 to 12).
- Real call sites: #233 (Task 9), #267 (Task 10), #262 (Task 11), ImportAlert migration (Task 12),
  autosave tie-in (Task 13).
- Accessibility (aria-live region, role alert for errors, distinct from canvas live-regions,
  prefers-reduced-motion): Tasks 5, 7, plus the Playwright check.
- Outside the command system: confirmed by construction (no `dispatch` involvement anywhere).
- ADR: Task 14.

Spec items intentionally not built (named as out of scope in the spec): determinate progress (#320),
notification history or center, routing the crash-recovery prompt (#232) or the autosave readout
through the system, per-call positioning.
