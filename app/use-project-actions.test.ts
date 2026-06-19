import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useProjectActions, type ProjectActionsContext } from './use-project-actions'
import { createEditorSession } from '../bridge'
import { createEmptyProject } from '../core'
import { serializeProjectJson } from '../storage/folder/project-json'
import {
  InMemoryAssetCache,
  InMemoryProjectStore,
  InMemoryRecentProjectStore,
  type StorageCapabilities,
} from '../storage'

function sampleProject() {
  return createEmptyProject({
    name: 'My House',
    units: 'imperial',
    period: 'modern',
    appVersion: '0.0.0-test',
  })
}

const capableStorage: StorageCapabilities = {
  opfs: true,
  indexedDb: true,
  fileSystemAccess: false,
  persisted: false,
  estimatedQuotaBytes: null,
}

function jsonFileFor(project: ReturnType<typeof sampleProject>): File {
  const bytes = serializeProjectJson(project)
  return new File([bytes.buffer as ArrayBuffer], 'house.json')
}

interface GuardedContextOverrides {
  onSession: ProjectActionsContext['onSession']
  isDirty: boolean
  confirmDiscard: () => boolean | Promise<boolean>
}

describe('useProjectActions new-project action', () => {
  function newProjectContext(overrides: GuardedContextOverrides): ProjectActionsContext {
    const { onSession, isDirty, confirmDiscard } = overrides
    return {
      session: createEditorSession(sampleProject()),
      store: new InMemoryProjectStore(),
      assets: new InMemoryAssetCache(),
      projectId: 'current',
      snapshots: undefined,
      recentProjects: new InMemoryRecentProjectStore(),
      capabilities: capableStorage,
      recentEntries: [],
      onSession,
      isDirty,
      confirmDiscard,
    } as ProjectActionsContext
  }

  it('does not swap the project when a dirty session is not confirmed', async () => {
    const onSession = vi.fn()
    const confirmDiscard = vi.fn(() => false)

    const context = newProjectContext({ onSession, isDirty: true, confirmDiscard })

    const { result } = renderHook(() => useProjectActions(context))

    await act(async () => {
      await (result.current as { onNewProject: () => Promise<void> | void }).onNewProject()
    })

    expect(onSession).not.toHaveBeenCalled()
    expect(confirmDiscard).toHaveBeenCalledOnce()
  })

  it('swaps in a fresh initial project when the dirty session is confirmed', async () => {
    const onSession = vi.fn()
    const confirmDiscard = vi.fn(() => true)

    const context = newProjectContext({ onSession, isDirty: true, confirmDiscard })

    const { result } = renderHook(() => useProjectActions(context))

    await act(async () => {
      await (result.current as { onNewProject: () => Promise<void> | void }).onNewProject()
    })

    expect(confirmDiscard).toHaveBeenCalledOnce()
    expect(onSession).toHaveBeenCalledOnce()
  })
})

describe('useProjectActions import action', () => {
  it('activates, persists, and records a dropped project file', async () => {
    const project = sampleProject()
    const jsonFile = jsonFileFor(project)

    const store = new InMemoryProjectStore()
    const recentProjects = new InMemoryRecentProjectStore()
    const save = vi.spyOn(store, 'save')
    const record = vi.spyOn(recentProjects, 'record')
    const onSession = vi.fn()

    const context: ProjectActionsContext = {
      session: createEditorSession(project),
      store,
      assets: new InMemoryAssetCache(),
      projectId: 'current',
      snapshots: undefined,
      recentProjects,
      capabilities: capableStorage,
      recentEntries: [],
      onSession,
    }

    const { result } = renderHook(() => useProjectActions(context))

    await act(async () => {
      await (
        result.current as { onImportDroppedFile: (file: File) => Promise<void> | void }
      ).onImportDroppedFile(jsonFile)
    })

    expect(onSession).toHaveBeenCalledOnce()
    expect(save).toHaveBeenCalledWith(
      'current',
      expect.objectContaining({ meta: expect.objectContaining({ name: 'My House' }) }),
    )
    expect(record).toHaveBeenCalled()
  })

  it('surfaces an import status when the router rejects a file and clears it on dismiss', async () => {
    const context: ProjectActionsContext = {
      session: createEditorSession(sampleProject()),
      store: new InMemoryProjectStore(),
      assets: new InMemoryAssetCache(),
      projectId: 'current',
      snapshots: undefined,
      recentProjects: new InMemoryRecentProjectStore(),
      capabilities: capableStorage,
      recentEntries: [],
      onSession: vi.fn(),
    }

    const { result } = renderHook(() => useProjectActions(context))
    const actions = () =>
      result.current as {
        onImportDroppedFile: (file: File) => Promise<void> | void
        importStatus: { fileName: string; reason: string } | null
        dismissImportStatus: () => void
      }

    const textFile = new File([new Uint8Array()], 'notes.txt')
    await act(async () => {
      await expect(
        Promise.resolve(actions().onImportDroppedFile(textFile)),
      ).resolves.toBeUndefined()
    })

    expect(actions().importStatus).toEqual({
      fileName: 'notes.txt',
      reason: expect.any(String),
    })
    expect((actions().importStatus as { reason: string }).reason.length).toBeGreaterThan(0)

    act(() => {
      actions().dismissImportStatus()
    })

    expect(actions().importStatus).toBeNull()
  })

  it('leaves the import status null after a successful import', async () => {
    const context: ProjectActionsContext = {
      session: createEditorSession(sampleProject()),
      store: new InMemoryProjectStore(),
      assets: new InMemoryAssetCache(),
      projectId: 'current',
      snapshots: undefined,
      recentProjects: new InMemoryRecentProjectStore(),
      capabilities: capableStorage,
      recentEntries: [],
      onSession: vi.fn(),
    }

    const { result } = renderHook(() => useProjectActions(context))
    const actions = () =>
      result.current as {
        onImportDroppedFile: (file: File) => Promise<void> | void
        importStatus: { fileName: string; reason: string } | null
      }

    await act(async () => {
      await actions().onImportDroppedFile(jsonFileFor(sampleProject()))
    })

    expect(actions().importStatus).toBeNull()
  })
})
