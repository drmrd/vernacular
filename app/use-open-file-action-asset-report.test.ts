import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { AssetReference } from '../core'
import { NotificationProvider, useNotifications } from '../editor/design-system'
import type { DocumentHandle } from '../session'
import { ARCHIVE_LIMITS } from '../storage'
import { createTestPorts } from '../session/handle/handle-test-kit'
import {
  actionsContext,
  closeOpenedHandles,
  openStoredProject,
  packListing,
  projectFileReferring,
  READ_FAILURE,
  settleTheAction,
  shownMessages,
  shownWarnings,
  STORED_PROJECT_ID,
  STORED_PROJECT_NAME,
  unreadableFile,
  waitForOtherProject,
} from './action-test-support'
import { runNothing } from './app-test-support'
import { importMissingAssetsText } from './asset-report-text'
import { renderOpenFileAction, TOO_LARGE_SENTENCE } from './open-file-action-test-support'
import { useOpenFileAction } from './use-open-file-action'
import type { RunFlow } from './use-open-project'

const USER_REFERENCE: AssetReference = { scope: 'user', contentHash: 'a'.repeat(64) }
const PACK_REFERENCE: AssetReference = {
  scope: 'pack:vernacular-starter@1.0.0',
  contentHash: 'd'.repeat(64),
}
const OTHER_PACK_REFERENCE: AssetReference = {
  scope: 'pack:vernacular-starter@1.0.0',
  contentHash: 'e'.repeat(64),
}

/** The handles that an owner of a case opened by a flow, closed after the case. */
const importedHandles: DocumentHandle[] = []

afterEach(async () => {
  cleanup()
  await closeOpenedHandles()
  await act(async () => {
    await Promise.all(importedHandles.splice(0).map((handle) => handle.close()))
  })
  vi.restoreAllMocks()
})

/** A library that lists nothing, and how often its listing was asked for. */
function countedListing() {
  const list = vi.fn(() => Promise.resolve([]))
  return { packs: { list }, listed: () => list.mock.calls.length }
}

describe('the warning for a file that lacks assets, when the library is not known', () => {
  it('shows no warning for a pack asset, and opens the file, when the listing of the library fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const failing = { list: () => Promise.reject(new Error(READ_FAILURE)) }
    const { handle, result } = await renderOpenFileAction(failing)

    await act(async () => {
      await result.current.actions.onImportDroppedFile(projectFileReferring(PACK_REFERENCE))
    })
    await waitForOtherProject(result, handle)
    await settleTheAction()

    expect(shownWarnings(result)).toEqual([])
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('counts a pack asset as lacking when the application has no library', async () => {
    const { handle, result } = await renderOpenFileAction()

    await act(async () => {
      await result.current.actions.onImportDroppedFile(projectFileReferring(PACK_REFERENCE))
    })
    await waitForOtherProject(result, handle)
    await settleTheAction()

    expect(shownWarnings(result)).toEqual([importMissingAssetsText(1)])
  })
})

describe('the warning for a file that lacks assets, when the library lists some', () => {
  it('counts only the asset that the library does not list, in the singular', async () => {
    const { result } = await renderOpenFileAction(packListing(PACK_REFERENCE))

    await act(async () => {
      await result.current.actions.onImportDroppedFile(
        projectFileReferring(PACK_REFERENCE, USER_REFERENCE),
      )
    })

    await waitFor(() => expect(shownWarnings(result)).toEqual([importMissingAssetsText(1)]))
  })

  it('asks the library for its listing one time for an import that refers to many assets', async () => {
    const { packs, listed } = countedListing()
    const { handle, result } = await renderOpenFileAction(packs)

    await act(async () => {
      await result.current.actions.onImportDroppedFile(
        projectFileReferring(PACK_REFERENCE, OTHER_PACK_REFERENCE, USER_REFERENCE),
      )
    })
    await waitForOtherProject(result, handle)
    await settleTheAction()

    expect(listed()).toBe(1)
  })
})

/** The ports and the open project of a case that runs its own owner. */
async function openedProject() {
  const ports = createTestPorts()
  const handle = await openStoredProject(ports, STORED_PROJECT_ID, STORED_PROJECT_NAME)
  return { ports, handle }
}

/** The open file action behind the owner `runFlow`, with the notifications that show beside it. */
function renderBehindOwner(handle: DocumentHandle, runFlow: RunFlow) {
  return renderHook(
    () => {
      const notifications = useNotifications()
      const actions = useOpenFileAction({ ...actionsContext(handle), notifications, runFlow })
      return { actions, shown: notifications.notifications }
    },
    { wrapper: NotificationProvider },
  )
}

describe('the warning for a file that is not opened', () => {
  it('shows no warning when the owner starts no flow, as when the unsaved edits are kept', async () => {
    const { handle } = await openedProject()
    const { result } = renderBehindOwner(handle, runNothing)

    await act(async () => {
      await result.current.actions.onImportDroppedFile(projectFileReferring(USER_REFERENCE))
    })
    await settleTheAction()

    expect(shownMessages(result)).toEqual([])
  })

  it('shows one warning for two files dropped together while the owner runs the first', async () => {
    const { ports, handle } = await openedProject()
    let openGate = () => {}
    const gate = new Promise<void>((resolve) => {
      openGate = resolve
    })
    const started = vi.fn()
    const runFlow: RunFlow = async (flow) => {
      if (started.mock.calls.length > 0) return undefined
      started()
      await gate
      const flowResult = await flow(ports, handle)
      if (flowResult.ok) importedHandles.push(flowResult.handle)
      return flowResult
    }
    const { result } = renderBehindOwner(handle, runFlow)

    await act(async () => {
      const drops = [USER_REFERENCE, USER_REFERENCE].map((reference) =>
        result.current.actions.onImportDroppedFile(projectFileReferring(reference)),
      )
      await settleTheAction()
      openGate()
      await Promise.all(drops)
    })
    await settleTheAction()

    expect(started).toHaveBeenCalledTimes(1)
    expect(shownWarnings(result)).toEqual([importMissingAssetsText(1)])
  })

  it('does not ask the library for its listing about a file that cannot be read', async () => {
    const { packs, listed } = countedListing()
    const { result } = await renderOpenFileAction(packs)

    await act(async () => {
      await result.current.actions.onImportDroppedFile(unreadableFile().file)
    })
    await settleTheAction()

    expect(shownMessages(result)).toEqual([`Open failed: ${READ_FAILURE}`])
    expect(listed()).toBe(0)
  })

  it('does not ask the library for its listing about a file above the size limit', async () => {
    const { packs, listed } = countedListing()
    const { result } = await renderOpenFileAction(packs)
    const { file } = unreadableFile({ size: ARCHIVE_LIMITS.archiveBytes + 1 })

    await act(async () => {
      await result.current.actions.onImportDroppedFile(file)
    })
    await settleTheAction()

    expect(shownMessages(result)).toEqual([TOO_LARGE_SENTENCE])
    expect(listed()).toBe(0)
  })
})

describe('the size limit on a dropped file', () => {
  it('refuses a .building file above the limit before it reads any of its bytes', async () => {
    const { result } = await renderOpenFileAction()
    const { file, reads } = unreadableFile({
      size: ARCHIVE_LIMITS.archiveBytes + 1,
      name: 'house.building',
    })

    await act(async () => {
      await result.current.actions.onImportDroppedFile(file)
    })
    await settleTheAction()

    expect(shownMessages(result)).toEqual([TOO_LARGE_SENTENCE])
    expect(reads()).toBe(0)
    expect(result.current.flowsStarted()).toBe(0)
  })

  it('tells a file of another kind above the limit that it is too large', async () => {
    const { result } = await renderOpenFileAction()
    const { file } = unreadableFile({ size: ARCHIVE_LIMITS.archiveBytes + 1, name: 'plan.pdf' })

    await act(async () => {
      await result.current.actions.onImportDroppedFile(file)
    })
    await settleTheAction()

    expect(shownMessages(result)).toEqual([TOO_LARGE_SENTENCE])
  })
})
