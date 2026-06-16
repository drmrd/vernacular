import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useProjectActions, type ProjectActionsContext } from './use-project-actions'
import { createEditorSession } from '../bridge'
import { createEmptyProject } from '../core'
import { serializeProjectJson } from '../storage/folder/project-json'
import {
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
})
