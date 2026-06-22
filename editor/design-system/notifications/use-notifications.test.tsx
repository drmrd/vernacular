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
