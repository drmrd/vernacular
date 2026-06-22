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
  type PromiseMessage,
  type PromiseMessages,
} from './notification'
import { emptyNotificationState, notificationReducer, type StoreAction } from './notification-store'

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
  promise<T>(task: Promise<T>, messages: PromiseMessages<T>): Promise<T>
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

// Build a toast notification, omitting optional keys we have no value for so the shape stays
// assignable under exactOptionalPropertyTypes. The caller resolves options.id before calling.
function buildToast(
  severity: NotificationSeverity,
  message: string,
  options: ToastOptions & { id: string },
): Notification {
  const autoDismissMs = options.autoDismissMs ?? defaultDuration(severity)
  return {
    id: options.id,
    tier: 'toast',
    severity,
    message,
    dismissible: options.dismissible ?? true,
    ...(autoDismissMs !== undefined ? { autoDismissMs } : {}),
    ...(options.actions ? { actions: options.actions } : {}),
  }
}

// A promise message is either plain text or text plus actions; normalize to the object form.
function resolveMessage(message: PromiseMessage): {
  message: string
  actions?: NotificationAction[]
} {
  return typeof message === 'string' ? { message } : message
}

// The pending toast is sticky (no auto-dismiss) and not dismissible while the task is in flight.
function pendingToast(id: string, message: PromiseMessage): Notification {
  return {
    id,
    tier: 'toast',
    severity: 'info',
    // Actions are intentionally omitted: a non-dismissible, in-flight pending toast has no surface
    // for action buttons, so any actions on the pending message would be unreachable.
    message: resolveMessage(message).message,
    pending: true,
    dismissible: false,
  }
}

// The settled toast re-emits the same id; success fades on a timer, error stays until dismissed.
function settledToast(
  id: string,
  outcome: { severity: NotificationSeverity; message: PromiseMessage; autoDismissMs?: number },
): Notification {
  const resolved = resolveMessage(outcome.message)
  return {
    id,
    tier: 'toast',
    severity: outcome.severity,
    message: resolved.message,
    dismissible: true,
    ...(outcome.autoDismissMs !== undefined ? { autoDismissMs: outcome.autoDismissMs } : {}),
    ...(resolved.actions ? { actions: resolved.actions } : {}),
  }
}

// Wires a promise to a single toast: pending while in flight, then success or error on settle.
function usePromise(emit: (notification: Notification) => string, nextId: () => string) {
  return useCallback(
    <T,>(task: Promise<T>, messages: PromiseMessages<T>): Promise<T> => {
      const id = nextId()
      emit(pendingToast(id, messages.pending))
      // This .then only subscribes the toast to the task's settlement (a side-effect); we still
      // return the original task so the caller receives the resolved value type T and can handle
      // the rejection itself. Returning task.then(...) would change the resolved type to void and
      // swallow the rejection from the caller.
      task.then(
        (value) => {
          const message = messages.success(value)
          emit(
            settledToast(id, {
              severity: 'success',
              message,
              autoDismissMs: DEFAULT_TOAST_DURATION_MS,
            }),
          )
        },
        (error: unknown) => {
          emit(settledToast(id, { severity: 'error', message: messages.error(error) }))
        },
      )
      return task
    },
    [emit, nextId],
  )
}

type Dispatch = (action: StoreAction) => void

// Owns the auto-dismiss timers and translates emit/dismiss into reducer dispatches, so the reducer
// stays a pure value store.
function useEmitter(dispatch: Dispatch) {
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
    [clearTimer, dispatch],
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
    [clearTimer, dispatch, dismiss],
  )

  return { emit, dismiss }
}

// Holds the stable callbacks the emitter API wraps. Bundled into one object so the consuming hook
// stays within the max-params limit.
interface ApiCallbacks {
  toast: (severity: NotificationSeverity, message: string, options?: ToastOptions) => string
  emit: (notification: Notification) => string
  promise: <T>(task: Promise<T>, messages: PromiseMessages<T>) => Promise<T>
  dismiss: (id: string) => void
}

// Memoizes the emitter methods over only the stable callbacks, so each method reference stays
// constant across renders. A consumer can list a method in a useEffect dependency array without the
// effect re-firing whenever the notification list changes.
function useApiMethods({ toast, emit, promise, dismiss }: ApiCallbacks) {
  return useMemo(
    () => ({
      success: (message: string, options?: ToastOptions) => toast('success', message, options),
      info: (message: string, options?: ToastOptions) => toast('info', message, options),
      warning: (message: string, options?: ToastOptions) => toast('warning', message, options),
      error: (message: string, options?: ToastOptions) => toast('error', message, options),
      banner: (input: BannerInput) =>
        emit({ ...input, tier: 'banner', dismissible: input.dismissible ?? true }),
      promise,
      dismiss,
    }),
    [toast, emit, promise, dismiss],
  )
}

function useNotificationApi(): NotificationApi {
  const [state, dispatch] = useReducer(notificationReducer, emptyNotificationState)
  const counter = useRef(0)
  const { emit, dismiss } = useEmitter(dispatch)
  const nextId = useCallback(() => `notification-${(counter.current += 1)}`, [])

  const toast = useCallback(
    (severity: NotificationSeverity, message: string, options: ToastOptions = {}) => {
      const id = options.id ?? nextId()
      return emit(buildToast(severity, message, { ...options, id }))
    },
    [emit, nextId],
  )

  const promise = usePromise(emit, nextId)
  const methods = useApiMethods({ toast, emit, promise, dismiss })

  return useMemo<NotificationApi>(
    () => ({ notifications: state.notifications, ...methods }),
    [state.notifications, methods],
  )
}
