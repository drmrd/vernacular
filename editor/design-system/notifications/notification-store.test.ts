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
