import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, cleanup, waitFor } from '@testing-library/react'
import { InMemoryDirectory, InMemoryRecentProjectStore } from '../storage'
import {
  DOCUMENT_FILE,
  createTestPorts,
  failSaves,
  holdNextRead,
  pickFolder,
} from '../session/handle/handle-test-kit'
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
const RECENT_FAILURE = 'The recent list cannot be written.'

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
  it('Save stores the project and records it in the recent list', async () => {
    const { ports, handle } = await openDrafthouse()
    const recentProjects = new InMemoryRecentProjectStore()
    const save = vi.spyOn(ports.workspace, 'save')
    const { result } = renderActions({ ports, handle, recentProjects }, useProjectActions)

    await act(async () => {
      result.current.actions.onSave()
    })

    const entry = await waitForRecentEntry(recentProjects, CURRENT_ID)
    expect(entry).toMatchObject({ name: DRAFT_NAME, backend: 'opfs' })
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

  it('New project lists no entry for the project it opened, which is not stored', async () => {
    const { ports, handle } = await openDrafthouse()
    const recentProjects = new InMemoryRecentProjectStore()
    const { result } = renderActions({ ports, handle, recentProjects }, useProjectActions)

    await act(async () => {
      await result.current.actions.onNewProject()
    })

    const opened = await waitForOtherProject(result, handle)
    // The entry of the project that was left proves that the recording ran, so its absence below means something.
    await waitForRecentEntry(recentProjects, CURRENT_ID)
    await settleTheAction()
    const listed = (await recentProjects.list()).map((entry) => entry.id)
    expect(listed).not.toContain(opened.id)
    expect(await storedIds(ports)).not.toContain(opened.id)
  })

  it('Open folder opens the picked folder and records it as a folder project', async () => {
    const { ports, handle } = await openDrafthouse()
    const folder = new InMemoryDirectory()
    await folder.writeFile(DOCUMENT_FILE, await documentBytes(namedProject(FOLDER_PROJECT_NAME)))
    pickFolder(ports, folder, PICKED_FOLDER_NAME)
    const recentProjects = new InMemoryRecentProjectStore()
    const capabilities = { ...capableCapabilities(), fileSystemAccess: true }
    const rig = { ports, handle, recentProjects, capabilities }
    const { result } = renderActions(rig, useProjectActions)

    await act(async () => {
      result.current.actions.onOpenFolder?.()
    })

    const opened = await waitForOtherProject(result, handle)
    expect(opened.location.kind).toBe('folder')
    const entry = await waitForRecentEntry(recentProjects, opened.id)
    expect(entry).toMatchObject({ name: FOLDER_PROJECT_NAME, backend: 'file-system-folder' })
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

  it('a flow that opened records the project that was left', async () => {
    const { ports, handle } = await openDrafthouse()
    await plantProject(ports, OTHER_ID, OTHER_NAME)
    const recentProjects = new InMemoryRecentProjectStore()
    const { result } = renderActions({ ports, handle, recentProjects }, useProjectActions)

    await act(async () => {
      result.current.actions.onOpenRecent(OTHER_ID)
    })

    await waitForOtherProject(result, handle)
    const left = await waitForRecentEntry(recentProjects, CURRENT_ID)
    expect(left).toMatchObject({ name: DRAFT_NAME, backend: 'opfs' })
  })
})

describe('useProjectActions while a flow runs and after it', () => {
  it('a second action while one runs does nothing, shows nothing, and records nothing', async () => {
    const { ports, handle } = await openDrafthouse()
    await plantProject(ports, OTHER_ID, OTHER_NAME)
    const recentProjects = new InMemoryRecentProjectStore()
    const record = vi.spyOn(recentProjects, 'record')
    const { result } = renderActions({ ports, handle, recentProjects }, useProjectActions)
    const letTheFirstEnd = holdNextRead(ports.workspace)
    await act(async () => {
      result.current.actions.onOpenRecent(OTHER_ID)
    })

    await act(async () => {
      await result.current.actions.onNewProject()
    })
    await settleTheAction()

    expect(record).not.toHaveBeenCalled()
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

  it('a recent entry store that rejects leaves the action resolved and logs nothing unhandled', async () => {
    const unhandled = recordUnhandledRejections()
    const { ports, handle } = await openDrafthouse()
    await plantProject(ports, OTHER_ID, OTHER_NAME)
    const recentProjects = new InMemoryRecentProjectStore()
    const record = vi.spyOn(recentProjects, 'record').mockRejectedValue(new Error(RECENT_FAILURE))
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { result } = renderActions({ ports, handle, recentProjects }, useProjectActions)

    try {
      await act(async () => {
        result.current.actions.onOpenRecent(OTHER_ID)
      })
      await waitForOtherProject(result, handle)
      await waitFor(() => expect(record).toHaveBeenCalled())
      expect(await unhandled.read()).toEqual([])
    } finally {
      unhandled.stop()
    }
  })
})
