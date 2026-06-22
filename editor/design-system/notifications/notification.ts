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

export type PromiseMessage = string | { message: string; actions?: NotificationAction[] }
export interface PromiseMessages<T> {
  pending: PromiseMessage
  success: (value: T) => PromiseMessage
  error: (error: unknown) => PromiseMessage
}
