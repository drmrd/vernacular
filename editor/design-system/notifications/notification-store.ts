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
