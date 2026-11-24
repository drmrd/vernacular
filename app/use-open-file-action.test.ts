import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, cleanup, waitFor } from '@testing-library/react'
import type { AssetReference } from '../core'
import { ARCHIVE_LIMITS, DocumentDecodeError } from '../storage'
import { failSaves, storedName } from '../session/handle/handle-test-kit'
import {
  closeOpenedHandles,
  packCatalogOf,
  projectFileOf,
  projectFileReferring,
  READ_FAILURE,
  recentIds,
  recordUnhandledRejections,
  settleTheAction,
  shownMessages,
  shownWarnings,
  STORED_PROJECT_ID,
  STORED_PROJECT_NAME,
  unreadableFile,
  waitForOtherProject,
  waitForRecord,
} from './action-test-support'
import { namedProject } from './app-test-support'
import { renderOpenFileAction, TOO_LARGE_SENTENCE } from './open-file-action-test-support'

const CURRENT_ID = STORED_PROJECT_ID
const DRAFT_NAME = STORED_PROJECT_NAME
const HOUSE_NAME = 'My House'
const TWO_MISSING_SENTENCE =
  'The file did not include 2 of the assets this project uses. They show as missing.'
const FIRST_HASH = 'a'.repeat(64)
const SECOND_HASH = 'b'.repeat(64)
const PACK_REFERENCE: AssetReference = {
  scope: 'pack:vernacular-starter@1.0.0',
  contentHash: 'd'.repeat(64),
}

afterEach(async () => {
  cleanup()
  await closeOpenedHandles()
  vi.restoreAllMocks()
})

describe('useOpenFileAction on a dropped file', () => {
  it('activates, persists, and records a dropped project file, under a new id, and its record is in the index', async () => {
    const { ports, handle, result } = await renderOpenFileAction()

    await act(async () => {
      await result.current.actions.onImportDroppedFile(projectFileOf(namedProject(HOUSE_NAME)))
    })

    const opened = await waitForOtherProject(result, handle)
    expect(opened.id).not.toBe(CURRENT_ID)
    expect(await storedName(ports.workspace, opened.id)).toBe(HOUSE_NAME)
    expect(await storedName(ports.workspace, CURRENT_ID)).toBe(DRAFT_NAME)
    expect(await waitForRecord(ports, opened.id)).toMatchObject({ name: HOUSE_NAME })
  })

  it('an import whose first save fails leaves no entry in the recent list', async () => {
    const { ports, handle, result } = await renderOpenFileAction()
    failSaves(ports.workspace)

    await act(async () => {
      await result.current.actions.onImportDroppedFile(projectFileOf(namedProject(HOUSE_NAME)))
    })

    const opened = await waitForOtherProject(result, handle)
    await waitFor(() => expect(opened.saveStatus()).toBe('error'))
    await settleTheAction()
    expect(await recentIds(ports, CURRENT_ID)).not.toContain(opened.id)
    expect(await recentIds(ports, opened.id)).toEqual([CURRENT_ID])
  })

  it('emits an error toast naming the file when import fails', async () => {
    const { handle, result } = await renderOpenFileAction()
    const reason = new DocumentDecodeError({ kind: 'not-a-project' }).message

    await act(async () => {
      await result.current.actions.onImportDroppedFile(
        new File(['not a project'], 'broken.building'),
      )
    })

    await waitFor(() => expect(shownMessages(result)).toEqual([`Open failed: ${reason}`]))
    // The import ran as a flow of the owner, and the open project stays.
    expect(result.current.flowsStarted()).toBe(1)
    expect(result.current.handle).toBe(handle)
  })

  it('a file of another kind shows "Open failed: Unsupported project file: " and the name', async () => {
    const { result } = await renderOpenFileAction()

    await act(async () => {
      await result.current.actions.onImportDroppedFile(new File(['%PDF'], 'plan.pdf'))
    })

    await waitFor(() =>
      expect(shownMessages(result)).toEqual(['Open failed: Unsupported project file: plan.pdf']),
    )
    expect(result.current.flowsStarted()).toBe(1)
  })

  it('a file that cannot be read shows "Open failed: " with the error and runs no flow', async () => {
    const unhandled = recordUnhandledRejections()
    const { handle, result } = await renderOpenFileAction()

    try {
      await act(async () => {
        await result.current.actions.onImportDroppedFile(unreadableFile().file)
      })
      await settleTheAction()

      expect(shownMessages(result)).toEqual([`Open failed: ${READ_FAILURE}`])
      expect(result.current.flowsStarted()).toBe(0)
      expect(result.current.handle).toBe(handle)
      expect(await unhandled.read()).toEqual([])
    } finally {
      unhandled.stop()
    }
  })
})

describe('useOpenFileAction on a file that lacks assets', () => {
  it('shows one warning that says how many assets the file lacked', async () => {
    const { result } = await renderOpenFileAction()
    const file = projectFileReferring(
      { scope: 'user', contentHash: FIRST_HASH },
      { scope: 'user', contentHash: SECOND_HASH },
    )

    await act(async () => {
      await result.current.actions.onImportDroppedFile(file)
    })

    await waitFor(() => expect(shownWarnings(result)).toEqual([TWO_MISSING_SENTENCE]))
    await settleTheAction()
    expect(shownWarnings(result)).toEqual([TWO_MISSING_SENTENCE])
  })

  it('shows no warning when the file lacks nothing', async () => {
    const { handle, result } = await renderOpenFileAction()

    await act(async () => {
      await result.current.actions.onImportDroppedFile(projectFileOf(namedProject(HOUSE_NAME)))
    })
    await waitForOtherProject(result, handle)
    await settleTheAction()

    expect(shownWarnings(result)).toEqual([])
  })

  it('shows no warning when the import fails', async () => {
    const { result } = await renderOpenFileAction()

    await act(async () => {
      await result.current.actions.onImportDroppedFile(new File(['not a project'], 'broken.json'))
    })
    await waitFor(() => expect(shownMessages(result)).toHaveLength(1))
    await settleTheAction()

    expect(shownWarnings(result)).toEqual([])
  })

  it('shows no warning for a pack asset that the library lists', async () => {
    const { handle, result } = await renderOpenFileAction(packCatalogOf(PACK_REFERENCE))

    await act(async () => {
      await result.current.actions.onImportDroppedFile(projectFileReferring(PACK_REFERENCE))
    })
    await waitForOtherProject(result, handle)
    await settleTheAction()

    expect(shownWarnings(result)).toEqual([])
  })
})

describe('useOpenFileAction on a file at the size limit of an archive', () => {
  it('refuses a file above the limit before it reads any of its bytes, and runs no flow', async () => {
    const { handle, result } = await renderOpenFileAction()
    const { file, reads } = unreadableFile({ size: ARCHIVE_LIMITS.archiveBytes + 1 })

    await act(async () => {
      await result.current.actions.onImportDroppedFile(file)
    })
    await settleTheAction()

    expect(shownMessages(result)).toEqual([TOO_LARGE_SENTENCE])
    expect(reads()).toBe(0)
    expect(result.current.flowsStarted()).toBe(0)
    expect(result.current.handle).toBe(handle)
  })

  it('reads a file that is exactly at the limit', async () => {
    const { result } = await renderOpenFileAction()
    const { file, reads } = unreadableFile({ size: ARCHIVE_LIMITS.archiveBytes })

    await act(async () => {
      await result.current.actions.onImportDroppedFile(file)
    })
    await settleTheAction()

    expect(shownMessages(result)).toEqual([`Open failed: ${READ_FAILURE}`])
    expect(reads()).toBeGreaterThan(0)
  })
})
