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
