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
      {(notification.actions ?? []).map((action, index) => (
        <button
          key={`${action.label}-${index}`}
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

// Returns null when there are no banners, so the AppFrame banner row collapses. Each banner
// announces via its own role (alert for warning/error, status otherwise); there is no wrapping
// aria-live that would override those per-banner politenesses.
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
