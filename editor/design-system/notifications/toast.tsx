import type { ReactNode } from 'react'
import { useNotifications } from './use-notifications'
import type { Notification } from './notification'
import './toast.css'

export interface ToastProps {
  notification: Notification
  onDismiss: (id: string) => void
}

// A pending toast shows a determinate bar when it carries a progress fraction and an
// indeterminate spinner otherwise; a settled toast shows neither.
const PERCENT = 100

function pendingIndicator(notification: Notification): ReactNode {
  if (!notification.pending) {
    return null
  }
  if (notification.fraction === undefined) {
    return <span className="ds-toast__spinner" aria-hidden="true" />
  }
  return (
    <div
      className="ds-toast__progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={notification.fraction}
    >
      <span
        className="ds-toast__progress-fill"
        style={{ width: `${notification.fraction * PERCENT}%` }}
      />
    </div>
  )
}

export function Toast({ notification, onDismiss }: ToastProps) {
  const role = notification.severity === 'error' ? 'alert' : 'status'
  return (
    <div className="ds-toast" data-severity={notification.severity} role={role}>
      {pendingIndicator(notification)}
      <span className="ds-toast__message">{notification.message}</span>
      {(notification.actions ?? []).map((action, index) => (
        <button
          key={`${action.label}-${index}`}
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

// The anchored toast stack. Each toast announces itself via its own role (role="alert" is
// assertive for errors, role="status" is polite otherwise). The region is a positioning
// container only, with no wrapping aria-live that would override those per-toast politenesses.
export function ToastRegion() {
  const { notifications, dismiss } = useNotifications()
  const toasts = notifications.filter((n) => n.tier === 'toast')
  return (
    <div className="ds-toast-region">
      {toasts.map((notification) => (
        <Toast key={notification.id} notification={notification} onDismiss={dismiss} />
      ))}
    </div>
  )
}
