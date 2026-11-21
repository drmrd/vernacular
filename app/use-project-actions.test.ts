import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, cleanup, waitFor } from '@testing-library/react'
import { InMemoryDirectory } from '../storage'
import { failingIndex } from '../storage/project-index/project-record-test-kit'
import {
  DOCUMENT_FILE,
  createTestPorts,
  failSaves,
  holdNextRead,
  pickFolder,
  recordOf,
} from '../session/handle/handle-test-kit'
import {
  closeOpenedHandles,
  openStoredProject,
  recentIds,
  recordUnhandledRejections,
  renderActions,
  settleTheAction,
  shownMessages,
  waitForOtherProject,
  waitForRecord,
} from './action-test-support'
import {
  NEW_PROJECT_NAME,
  capableCapabilities,
  documentBytes,
  namedProject,
  plantProject,
  storedIds,
} from './app-test-support'
import { NOT_STORED } from './open-failure-text'
import { useProjectActions } from './use-project-actions'

const CURRENT_ID = 'current'
const OTHER_ID = 'other'
const DRAFT_NAME = 'Drafthouse'
const OTHER_NAME = 'Other house'
const FOLDER_PROJECT_NAME = 'Folder house'
const PICKED_FOLDER_NAME = 'Old house'
const INDEX_FAILURE = 'The index cannot be reached.'

afterEach(async () => {
  cleanup()
  await closeOpenedHandles()
  vi.restoreAllMocks()
})

/** In-memory ports with the project `current` stored and open. */
async function openDrafthouse() {
  const ports = createTestPorts()
  const handle = await openStoredProject(ports, CURRENT_ID, DRAFT_NAME)
  return { ports, handle }
}

describe('useProjectActions Save', () => {
  it('Save stores the project, and its record is in the index', async () => {
    const { ports, handle } = await openDrafthouse()
    const save = vi.spyOn(ports.workspace, 'save')
    const { result } = renderActions({ ports, handle }, useProjectActions)

    await act(async () => {
      result.current.actions.onSave()
    })

    const record = await waitForRecord(ports, CURRENT_ID)
    expect(record).toMatchObject({ name: DRAFT_NAME, location: { kind: 'workspace' } })
    expect(save).toHaveBeenCalledWith(
      CURRENT_ID,
      expect.objectContaining({ meta: expect.objectContaining({ name: DRAFT_NAME }) }),
    )
  })

  it('a Save that fails raises no toast of its own and leaves the status error', async () => {
    const { ports, handle } = await openDrafthouse()
    failSaves(ports.workspace)
    const { result } = renderActions({ ports, handle }, useProjectActions)

    await act(async () => {
      result.current.actions.onSave()
    })

    await waitFor(() => expect(handle.saveStatus()).toBe('error'))
    await settleTheAction()
    expect(shownMessages(result)).toEqual([])
  })
})

describe('useProjectActions New project and Open folder', () => {
  it('New project runs with no prompt and opens a project under a new id', async () => {
    const { ports, handle } = await openDrafthouse()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { result } = renderActions({ ports, handle }, useProjectActions)

    await act(async () => {
      await result.current.actions.onNewProject()
    })

    const opened = await waitForOtherProject(result, handle)
    expect(opened.id).not.toBe(CURRENT_ID)
    expect(opened.session.getProject().meta.name).toBe(NEW_PROJECT_NAME)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('a new project that is left with no edit is not in the recent list', async () => {
    const { ports, handle } = await openDrafthouse()
    await plantProject(ports, OTHER_ID, OTHER_NAME)
    const { result } = renderActions({ ports, handle }, useProjectActions)
    await act(async () => {
      await result.current.actions.onNewProject()
    })
    const fresh = await waitForOtherProject(result, handle)

    await act(async () => {
      result.current.actions.onOpenRecent(OTHER_ID)
    })

    await waitForOtherProject(result, fresh)
    await settleTheAction()
    expect(await recentIds(ports, OTHER_ID)).toEqual([CURRENT_ID])
    expect(await storedIds(ports)).not.toContain(fresh.id)
  })

  it('Open folder opens the picked folder, and its record names the folder', async () => {
    const { ports, handle } = await openDrafthouse()
    const folder = new InMemoryDirectory()
    await folder.writeFile(DOCUMENT_FILE, documentBytes(namedProject(FOLDER_PROJECT_NAME)))
    pickFolder(ports, folder, PICKED_FOLDER_NAME)
    const capabilities = { ...capableCapabilities(), fileSystemAccess: true }
    const rig = { ports, handle, capabilities }
    const { result } = renderActions(rig, useProjectActions)

    await act(async () => {
      result.current.actions.onOpenFolder?.()
    })

    const opened = await waitForOtherProject(result, handle)
    expect(opened.location.kind).toBe('folder')
    expect(await waitForRecord(ports, opened.id)).toMatchObject({
      name: FOLDER_PROJECT_NAME,
      location: { kind: 'folder', folderName: PICKED_FOLDER_NAME },
    })
  })
})

describe('useProjectActions recent list', () => {
  it('a failed recent open shows its reason with a Retry that runs it again', async () => {
    const { ports, handle } = await openDrafthouse()
    const { result } = renderActions({ ports, handle }, useProjectActions)

    await act(async () => {
      result.current.actions.onOpenRecent(OTHER_ID)
    })

    await waitFor(() => expect(shownMessages(result)).toEqual([NOT_STORED]))
    const retry = result.current.shown[0]?.actions?.find((action) => action.label === 'Retry')
    expect(retry).toBeDefined()
    await plantProject(ports, OTHER_ID, OTHER_NAME)
    await act(async () => {
      retry?.onAction()
    })
    expect((await waitForOtherProject(result, handle)).id).toBe(OTHER_ID)
  })

  it('after a flow the project that was left is in the recent list, and the one that opened is not', async () => {
    const { ports, handle } = await openDrafthouse()
    await plantProject(ports, OTHER_ID, OTHER_NAME)
    const { result } = renderActions({ ports, handle }, useProjectActions)

    await act(async () => {
      result.current.actions.onOpenRecent(OTHER_ID)
    })

    const opened = await waitForOtherProject(result, handle)
    await settleTheAction()
    expect(await recentIds(ports, opened.id)).toEqual([CURRENT_ID])
  })
})

describe('useProjectActions while a flow runs and after it', () => {
  it('a second action while one runs does nothing, shows nothing, and writes no record', async () => {
    const { ports, handle } = await openDrafthouse()
    await plantProject(ports, OTHER_ID, OTHER_NAME)
    await recordOf(ports, CURRENT_ID)
    const put = vi.spyOn(ports.index, 'put')
    const { result } = renderActions({ ports, handle }, useProjectActions)
    const letTheFirstEnd = holdNextRead(ports.workspace)
    await act(async () => {
      result.current.actions.onOpenRecent(OTHER_ID)
    })

    await act(async () => {
      await result.current.actions.onNewProject()
    })
    await settleTheAction()

    expect(put).not.toHaveBeenCalled()
    expect(shownMessages(result)).toEqual([])
    letTheFirstEnd()
    expect((await waitForOtherProject(result, handle)).id).toBe(OTHER_ID)
  })

  it('Save after a flow replaced the project saves the new project, not the old one', async () => {
    const { ports, handle } = await openDrafthouse()
    await plantProject(ports, OTHER_ID, OTHER_NAME)
    const { result } = renderActions({ ports, handle }, useProjectActions)
    await act(async () => {
      result.current.actions.onOpenRecent(OTHER_ID)
    })
    await waitForOtherProject(result, handle)
    const save = vi.spyOn(ports.workspace, 'save')

    await act(async () => {
      result.current.actions.onSave()
    })

    await waitFor(() => expect(save).toHaveBeenCalled())
    expect(save.mock.calls.map(([id]) => id)).toEqual([OTHER_ID])
  })

  it('an index that rejects leaves the action resolved and logs nothing unhandled', async () => {
    const unhandled = recordUnhandledRejections()
    const index = failingIndex(new Error(INDEX_FAILURE))
    const ports = createTestPorts({ index })
    const handle = await openStoredProject(ports, CURRENT_ID, DRAFT_NAME)
    await plantProject(ports, OTHER_ID, OTHER_NAME)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { result } = renderActions({ ports, handle }, useProjectActions)

    try {
      await act(async () => {
        result.current.actions.onOpenRecent(OTHER_ID)
      })
      await waitForOtherProject(result, handle)
      await settleTheAction()
      expect(index.calls()).toBeGreaterThan(0)
      expect(await unhandled.read()).toEqual([])
    } finally {
      unhandled.stop()
    }
  })
})
