import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NotificationProvider, useNotifications } from '../editor/design-system'
import { runExportWithToast } from './use-export-actions'

function wrapper({ children }: { children: ReactNode }) {
  return <NotificationProvider>{children}</NotificationProvider>
}

describe('runExportWithToast', () => {
  it('drives the toast from indeterminate to a determinate fraction as the export reports progress', async () => {
    const { result } = renderHook(() => useNotifications(), { wrapper })
    let report!: (completed: number, total: number) => void
    let resolveTask!: () => void
    const task = new Promise<void>((r) => {
      resolveTask = r
    })

    act(() => {
      runExportWithToast(result.current, 'house.building', (onProgress) => {
        report = onProgress
        return task
      })
    })

    expect(result.current.notifications[0]?.pending).toBe(true)
    expect(result.current.notifications[0]?.fraction).toBeUndefined()

    act(() => {
      report(1, 4)
    })
    expect(result.current.notifications[0]?.fraction).toBe(0.25)

    await act(async () => {
      resolveTask()
      await task
    })
    await waitFor(() => expect(result.current.notifications[0]?.severity).toBe('success'))
  })
})
