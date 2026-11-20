import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { addFloor, type AssetReference } from '../core'
import {
  NotificationProvider,
  useNotifications,
  type NotificationApi,
} from '../editor/design-system'
import { createTestPorts } from '../session/handle/handle-test-kit'
import {
  actionsContext,
  openStoredProject,
  packListing,
  READ_FAILURE,
  renderActions,
  settleTheAction,
  shownWarnings,
  waitForOtherProject,
} from './action-test-support'
import { fakeNotifications, plantProject } from './app-test-support'
import {
  DOWNLOAD,
  exportBundle,
  exportedToasts,
  failedToasts,
  prepareBundleExport,
  PROJECT_ID,
  startBundleExport,
  stubTheDownload,
  WARNING,
} from './export-report-test-support'
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
const ONE_LEFT_OUT_SENTENCE =
  'The export does not include 1 asset, because this browser does not have it.'
const USER_REFERENCE: AssetReference = { scope: 'user', contentHash: 'a'.repeat(64) }
const OTHER_USER_REFERENCE: AssetReference = { scope: 'user', contentHash: 'b'.repeat(64) }
const TWO_LEFT_OUT_SENTENCE =
  'The export does not include 2 assets, because this browser does not have them.'
const UNLISTED_PACK_REFERENCE: AssetReference = {
  scope: 'pack:attic-finds@2.0.0',
  contentHash: 'e'.repeat(64),
}
const PACK_REFERENCE: AssetReference = {
  scope: 'pack:vernacular-starter@1.0.0',
  contentHash: 'd'.repeat(64),
}

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
  stubTheDownload()

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
    vi.mocked(URL.createObjectURL).mockImplementation(() => {
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

  it('warns once, after the download, that the export leaves out an asset the pool lacks, and still shows the success toast', async () => {
    const { steps, warnings, exported } = await exportBundle({ references: [USER_REFERENCE] })

    expect(steps).toEqual([DOWNLOAD, WARNING])
    expect(warnings).toEqual([ONE_LEFT_OUT_SENTENCE])
    expect(exported).toHaveLength(1)
  })

  it('shows no warning when the pool holds every asset the project places', async () => {
    const { steps, warnings } = await exportBundle({
      references: [USER_REFERENCE],
      held: [USER_REFERENCE],
    })

    expect(steps).toEqual([DOWNLOAD])
    expect(warnings).toEqual([])
  })

  it('does not count a pack asset that the library of the application lists', async () => {
    const { warnings } = await exportBundle({
      references: [PACK_REFERENCE, USER_REFERENCE],
      packs: packListing(PACK_REFERENCE),
    })

    expect(warnings).toEqual([ONE_LEFT_OUT_SENTENCE])
  })

  it('shows no warning for a pack asset when the listing of the library fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const failing = { list: () => Promise.reject(new Error(READ_FAILURE)) }

    const { warnings, exported } = await exportBundle({
      references: [PACK_REFERENCE],
      packs: failing,
    })

    expect(warnings).toEqual([])
    expect(exported).toHaveLength(1)
  })
})

describe('the edges of the export warning', () => {
  stubTheDownload()

  it('shows no warning when the export fails', async () => {
    const ports = createTestPorts()
    const { steps, result } = await prepareBundleExport(
      { references: [USER_REFERENCE], held: [USER_REFERENCE] },
      ports,
    )
    vi.spyOn(ports.workspace.assets(PROJECT_ID), 'get').mockRejectedValue(new Error('pool down'))

    startBundleExport(result)
    await waitFor(() => expect(failedToasts(result)).toHaveLength(1))
    await settleTheAction()

    expect(shownWarnings(result)).toEqual([])
    expect(exportedToasts(result)).toEqual([])
    expect(steps).toEqual([])
  })

  it('counts every asset the pool lacks', async () => {
    const { warnings } = await exportBundle({
      references: [USER_REFERENCE, OTHER_USER_REFERENCE],
    })

    expect(warnings).toEqual([TWO_LEFT_OUT_SENTENCE])
  })

  it('counts a pack asset that the library of the application does not list', async () => {
    const { warnings } = await exportBundle({
      references: [UNLISTED_PACK_REFERENCE],
      packs: packListing(PACK_REFERENCE),
    })

    expect(warnings).toEqual([ONE_LEFT_OUT_SENTENCE])
  })
})
