import type { ReactNode } from 'react'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addFloor } from '../core'
import {
  NotificationProvider,
  useNotifications,
  type NotificationApi,
} from '../editor/design-system'
import { createTestPorts } from '../session/handle/handle-test-kit'
import {
  actionsContext,
  closeOpenedHandles,
  openStoredProject,
  renderActions,
  waitForOtherProject,
} from './action-test-support'
import { fakeNotifications, plantProject } from './app-test-support'
import {
  runExportWithToast,
  useExportBundleAction,
  useExportPlanAction,
} from './use-export-actions'
import { useProjectActions } from './use-project-actions'

const CURRENT_ID = 'current'
const OTHER_ID = 'other'
const HOUSE_NAME = 'My House'
const OTHER_NAME = 'Other house'
const DOWNLOAD = 'download'

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

/** Lets the export task that the spy notifications received run to its end. */
async function settleTheExport(notifications: NotificationApi): Promise<void> {
  const task: unknown = vi.mocked(notifications.promise).mock.results[0]?.value
  await act(async () => {
    await Promise.resolve(task).catch(() => undefined)
  })
}

describe('the export actions on an open project', () => {
  // jsdom does not implement URL.createObjectURL/revokeObjectURL. The download helpers
  // call them, so stub both; otherwise the export throws and lands in its error branch.
  const originalCreateObjectUrl = URL.createObjectURL
  const originalRevokeObjectUrl = URL.revokeObjectURL

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:test')
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(async () => {
    cleanup()
    await closeOpenedHandles()
    vi.restoreAllMocks()
    URL.createObjectURL = originalCreateObjectUrl
    URL.revokeObjectURL = originalRevokeObjectUrl
  })

  it('shows a promise toast for a bundle export', async () => {
    const handle = await openStoredProject(createTestPorts(), CURRENT_ID, HOUSE_NAME)
    const notifications = fakeNotifications()
    const { result } = renderHook(() =>
      useExportBundleAction(actionsContext(handle, notifications)),
    )

    act(() => {
      result.current()
    })

    expect(notifications.promise).toHaveBeenCalledWith(
      expect.any(Promise),
      expect.objectContaining({ pending: expect.stringMatching(/Exporting/) }),
      expect.any(Function),
    )
    await settleTheExport(notifications)
  })

  it('shows a success toast for the synchronous plan export', async () => {
    const handle = await openStoredProject(createTestPorts(), CURRENT_ID, HOUSE_NAME)
    const notifications = fakeNotifications()
    const { result } = renderHook(() => useExportPlanAction(actionsContext(handle, notifications)))

    act(() => {
      result.current()
    })

    expect(notifications.success).toHaveBeenCalledWith(expect.stringMatching(/Exported/))
  })

  it('the bundle export writes a pending change before it downloads', async () => {
    const ports = createTestPorts()
    const handle = await openStoredProject(ports, CURRENT_ID, HOUSE_NAME)
    await plantProject(ports, OTHER_ID, OTHER_NAME)
    const { result } = renderActions({ ports, handle }, useProjectActions)
    await act(async () => {
      result.current.actions.onOpenRecent(OTHER_ID)
    })
    const opened = await waitForOtherProject(result, handle)
    const steps: string[] = []
    const realSave = ports.workspace.save.bind(ports.workspace)
    vi.spyOn(ports.workspace, 'save').mockImplementation((id, project) => {
      steps.push(`save:${id}`)
      return realSave(id, project)
    })
    URL.createObjectURL = vi.fn(() => {
      steps.push(DOWNLOAD)
      return 'blob:test'
    })
    await act(async () => {
      opened.session.dispatch(addFloor('Second floor'))
    })

    await act(async () => {
      result.current.actions.onExportBundle()
    })

    await waitFor(() => expect(steps).toContain(DOWNLOAD))
    expect(steps).toEqual([`save:${OTHER_ID}`, DOWNLOAD])
  })
})
