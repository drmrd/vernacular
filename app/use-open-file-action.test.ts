import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, cleanup, waitFor } from '@testing-library/react'
import { encodeDocument, type Project } from '../core'
import { DocumentDecodeError, InMemoryRecentProjectStore } from '../storage'
import { createTestPorts, storedName } from '../session/handle/handle-test-kit'
import {
  closeOpenedHandles,
  openStoredProject,
  recordUnhandledRejections,
  renderActions,
  settleTheAction,
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

afterEach(async () => {
  cleanup()
  await closeOpenedHandles()
  vi.restoreAllMocks()
})

/** In-memory ports with the project `current` stored and open, and the open file action on it. */
async function renderOpenFileAction() {
  const ports = createTestPorts()
  const handle = await openStoredProject(ports, CURRENT_ID, DRAFT_NAME)
  const recentProjects = new InMemoryRecentProjectStore()
  const { result } = renderActions({ ports, handle, recentProjects }, useOpenFileAction)
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
