import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, cleanup, waitFor } from '@testing-library/react'
import { encodeDocument, type AssetReference, type Project } from '../core'
import { ARCHIVE_LIMITS, DocumentDecodeError, InMemoryRecentProjectStore } from '../storage'
import { createTestPorts, storedName } from '../session/handle/handle-test-kit'
import {
  closeOpenedHandles,
  openStoredProject,
  packListing,
  projectFileReferring,
  recordUnhandledRejections,
  renderActions,
  settleTheAction,
  type PackListing,
  shownMessages,
  waitForOtherProject,
  waitForRecentEntry,
} from './action-test-support'
import { namedProject } from './app-test-support'
import { useOpenFileAction } from './use-open-file-action'

const CURRENT_ID = 'current'
const DRAFT_NAME = 'Drafthouse'
const HOUSE_NAME = 'My House'
const READ_FAILURE = 'The file could not be read.'
const TWO_MISSING_SENTENCE =
  'The file did not include 2 of the assets this project uses. They show as missing.'
const TOO_LARGE_SENTENCE = 'Open failed: The file is larger than 512 MB.'
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

/** In-memory ports with the project `current` stored and open, and the open file action on it. */
async function renderOpenFileAction(packs?: PackListing) {
  const ports = createTestPorts()
  const handle = await openStoredProject(ports, CURRENT_ID, DRAFT_NAME)
  const recentProjects = new InMemoryRecentProjectStore()
  const rig = { ports, handle, recentProjects, ...(packs === undefined ? {} : { packs }) }
  const { result } = renderActions(rig, useOpenFileAction)
  return { ports, handle, recentProjects, result }
}

/** A `.json` project file of `project`, as the application writes one. */
function projectFile(project: Project): File {
  const { bytes } = encodeDocument(project, undefined)
  return new File([bytes.buffer as ArrayBuffer], 'house.json')
}

/** A project file whose every way to read its bytes fails with `READ_FAILURE`. */
function unreadableFile(): File {
  const file = new File(['{}'], 'house.json')
  const failRead = () => Promise.reject(new Error(READ_FAILURE))
  const failStream = () => {
    throw new Error(READ_FAILURE)
  }
  Object.defineProperties(file, {
    arrayBuffer: { value: failRead },
    bytes: { value: failRead },
    text: { value: failRead },
    stream: { value: failStream },
  })
  return file
}

/** A file that claims `size` bytes and fails every read, and how often a read was tried. */
function fileClaiming(size: number): { file: File; reads: () => number } {
  let reads = 0
  const file = new File(['{}'], 'house.json')
  const failRead = () => {
    reads += 1
    return Promise.reject(new Error(READ_FAILURE))
  }
  const failStream = () => {
    reads += 1
    throw new Error(READ_FAILURE)
  }
  Object.defineProperties(file, {
    size: { value: size },
    arrayBuffer: { value: failRead },
    bytes: { value: failRead },
    text: { value: failRead },
    stream: { value: failStream },
  })
  return { file, reads: () => reads }
}

/** The texts of the warnings that show now. */
function shownWarnings(result: Parameters<typeof shownMessages>[0]): string[] {
  return result.current.shown
    .filter((shown) => shown.severity === 'warning')
    .map((shown) => shown.message)
}

describe('useOpenFileAction on a dropped file', () => {
  it('activates, persists, and records a dropped project file, under a new id', async () => {
    const { ports, handle, recentProjects, result } = await renderOpenFileAction()

    await act(async () => {
      await result.current.actions.onImportDroppedFile(projectFile(namedProject(HOUSE_NAME)))
    })

    const opened = await waitForOtherProject(result, handle)
    expect(opened.id).not.toBe(CURRENT_ID)
    expect(await storedName(ports.workspace, opened.id)).toBe(HOUSE_NAME)
    expect(await storedName(ports.workspace, CURRENT_ID)).toBe(DRAFT_NAME)
    expect(await waitForRecentEntry(recentProjects, opened.id)).toMatchObject({ name: HOUSE_NAME })
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
        await result.current.actions.onImportDroppedFile(unreadableFile())
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
      await result.current.actions.onImportDroppedFile(projectFile(namedProject(HOUSE_NAME)))
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
    const { handle, result } = await renderOpenFileAction(packListing(PACK_REFERENCE))

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
    const { file, reads } = fileClaiming(ARCHIVE_LIMITS.archiveBytes + 1)

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
    const { file, reads } = fileClaiming(ARCHIVE_LIMITS.archiveBytes)

    await act(async () => {
      await result.current.actions.onImportDroppedFile(file)
    })
    await settleTheAction()

    expect(shownMessages(result)).toEqual([`Open failed: ${READ_FAILURE}`])
    expect(reads()).toBeGreaterThan(0)
  })
})
