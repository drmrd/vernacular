import type { ReactNode } from 'react'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addFloor, type AssetReference } from '../core'
import {
  NotificationProvider,
  useNotifications,
  type Notification,
  type NotificationApi,
} from '../editor/design-system'
import type { DocumentHandle } from '../session'
import { createTestPorts } from '../session/handle/handle-test-kit'
import {
  actionsContext,
  closeOpenedHandles,
  openStoredProject,
  packListing,
  READ_FAILURE,
  renderActions,
  settleTheAction,
  shownMessages,
  shownWarnings,
  waitForOtherProject,
} from './action-test-support'
import { fakeNotifications, plantProject } from './app-test-support'
import { closeReferringHandles, openProjectReferring } from './export-report-test-kit'
import type { LibraryLister } from './pack-supplies'
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
const WARNING = 'warning'
const ONE_LEFT_OUT_SENTENCE =
  'The export does not include 1 asset, because this browser does not have it.'
const USER_REFERENCE: AssetReference = { scope: 'user', contentHash: 'a'.repeat(64) }
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

/** The bundle export on `handle`, with the toasts that show, and a log that the warning writes to. */
function renderBundleExport(handle: DocumentHandle, steps: string[], packs?: LibraryLister) {
  return renderHook(
    () => {
      const real = useNotifications()
      const notifications: NotificationApi = {
        ...real,
        warning: (message, options) => {
          steps.push(WARNING)
          return real.warning(message, options)
        },
      }
      const context = {
        ...actionsContext(handle, notifications),
        ...(packs === undefined ? {} : { packs }),
      }
      return { run: useExportBundleAction(context), shown: real.notifications }
    },
    { wrapper },
  )
}

interface ExportCase {
  /** The assets that the project places. */
  readonly references: readonly AssetReference[]
  /** The assets whose bytes the pool of the project holds. */
  readonly held?: readonly AssetReference[]
  /** The library that tells which pack assets an installed pack brings. */
  readonly packs?: LibraryLister
}

/** Exports the project of `exportCase` as a bundle, waits for the success toast, and reports what showed. */
async function exportBundle({ references, held, packs }: ExportCase) {
  const ports = createTestPorts()
  const handle = await openProjectReferring(ports, { id: CURRENT_ID, references, held })
  const steps: string[] = []
  URL.createObjectURL = vi.fn(() => {
    steps.push(DOWNLOAD)
    return 'blob:test'
  })
  const { result } = renderBundleExport(handle, steps, packs)
  act(() => {
    result.current.run()
  })
  await waitFor(() => expect(exportedToasts(result)).toHaveLength(1))
  await settleTheAction()
  return { steps, warnings: shownWarnings(result), exported: exportedToasts(result) }
}

/** The success toasts of an export that show now. */
function exportedToasts(result: { readonly current: { readonly shown: readonly Notification[] } }) {
  return shownMessages(result).filter((message) => message.startsWith('Exported '))
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
    await closeReferringHandles()
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
