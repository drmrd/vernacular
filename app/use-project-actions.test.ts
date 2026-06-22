import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useProjectActions, type ProjectActionsContext } from './use-project-actions'
import { type NotificationApi } from '../editor/design-system'
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

function fakeNotifications(): NotificationApi {
  return {
    notifications: [],
    success: vi.fn(() => 'id'),
    info: vi.fn(() => 'id'),
    warning: vi.fn(() => 'id'),
    error: vi.fn(() => 'id'),
    banner: vi.fn(() => 'id'),
    promise: vi.fn((task) => task),
    dismiss: vi.fn(),
  }
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
      notifications: fakeNotifications(),
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

describe('useProjectActions save action', () => {
  it('emits an error toast with Retry when save fails', async () => {
    const notifications = fakeNotifications()
    const store = new InMemoryProjectStore()
    vi.spyOn(store, 'save').mockRejectedValue(new Error('disk full'))
    const context: ProjectActionsContext = {
      session: createEditorSession(sampleProject()),
      store,
      assets: new InMemoryAssetCache(),
      projectId: 'current',
      snapshots: undefined,
      recentProjects: new InMemoryRecentProjectStore(),
      capabilities: capableStorage,
      recentEntries: [],
      onSession: vi.fn(),
      notifications,
    }
    const { result } = renderHook(() => useProjectActions(context))
    act(() => {
      result.current.onSave()
    })
    await waitFor(() => expect(notifications.error).toHaveBeenCalled())
    expect(notifications.error).toHaveBeenCalledWith(
      'disk full',
      expect.objectContaining({
        actions: [expect.objectContaining({ label: 'Retry' })],
      }),
    )
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
      notifications: fakeNotifications(),
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

  it('emits an error toast naming the file when import fails', async () => {
    const notifications = fakeNotifications()
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
      notifications,
    }

    const { result } = renderHook(() => useProjectActions(context))

    await act(async () => {
      await (
        result.current as { onImportDroppedFile: (file: File) => Promise<void> | void }
      ).onImportDroppedFile(new File(['not a project'], 'broken.building'))
    })

    expect(notifications.error).toHaveBeenCalledWith(expect.stringContaining('broken.building'))
  })
})

describe('useProjectActions import action discard guard', () => {
  function guardedImportContext(
    overrides: GuardedContextOverrides & { store: InMemoryProjectStore },
  ): ProjectActionsContext {
    const { onSession, isDirty, confirmDiscard, store } = overrides
    return {
      session: createEditorSession(sampleProject()),
      store,
      assets: new InMemoryAssetCache(),
      projectId: 'current',
      snapshots: undefined,
      recentProjects: new InMemoryRecentProjectStore(),
      capabilities: capableStorage,
      recentEntries: [],
      onSession,
      isDirty,
      confirmDiscard,
      notifications: fakeNotifications(),
    }
  }

  async function importDroppedFile(context: ProjectActionsContext, file: File): Promise<void> {
    const { result } = renderHook(() => useProjectActions(context))
    await act(async () => {
      await (
        result.current as { onImportDroppedFile: (file: File) => Promise<void> | void }
      ).onImportDroppedFile(file)
    })
  }

  // onImportDroppedFile (file drop) and onOpenFile (menu open / picker) share the
  // same importAndActivate path, so guarding the dropped-file route guards both.
  it('does not swap or persist a dropped project when a dirty session is not confirmed', async () => {
    const store = new InMemoryProjectStore()
    const save = vi.spyOn(store, 'save')
    const onSession = vi.fn()
    const confirmDiscard = vi.fn(() => false)

    const context = guardedImportContext({ onSession, isDirty: true, confirmDiscard, store })

    await importDroppedFile(context, jsonFileFor(sampleProject()))

    expect(onSession).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
    expect(confirmDiscard).toHaveBeenCalledOnce()
  })

  it('activates and persists a dropped project when the dirty session is confirmed', async () => {
    const store = new InMemoryProjectStore()
    const save = vi.spyOn(store, 'save')
    const onSession = vi.fn()
    const confirmDiscard = vi.fn(() => true)

    const context = guardedImportContext({ onSession, isDirty: true, confirmDiscard, store })

    await importDroppedFile(context, jsonFileFor(sampleProject()))

    expect(confirmDiscard).toHaveBeenCalledOnce()
    expect(onSession).toHaveBeenCalledOnce()
    expect(save).toHaveBeenCalledWith(
      'current',
      expect.objectContaining({ meta: expect.objectContaining({ name: 'My House' }) }),
    )
  })
})

describe('useProjectActions export actions', () => {
  // jsdom does not implement URL.createObjectURL/revokeObjectURL. The download helpers
  // (downloadText/downloadBytes) call them, so stub both; otherwise the sync plan export
  // throws and lands in its error branch instead of calling notifications.success.
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:test')
    URL.revokeObjectURL = vi.fn()
  })

  function exportContext(notifications: NotificationApi): ProjectActionsContext {
    return {
      session: createEditorSession(sampleProject()),
      store: new InMemoryProjectStore(),
      assets: new InMemoryAssetCache(),
      projectId: 'current',
      snapshots: undefined,
      recentProjects: new InMemoryRecentProjectStore(),
      capabilities: capableStorage,
      recentEntries: [],
      onSession: vi.fn(),
      notifications,
    }
  }

  it('shows a promise toast for a bundle export', () => {
    const notifications = fakeNotifications()
    const { result } = renderHook(() => useProjectActions(exportContext(notifications)))
    act(() => {
      result.current.onExportBundle()
    })
    expect(notifications.promise).toHaveBeenCalledWith(
      expect.any(Promise),
      expect.objectContaining({ pending: expect.stringMatching(/Exporting/) }),
    )
  })

  it('shows a success toast for the synchronous plan export', () => {
    const notifications = fakeNotifications()
    const { result } = renderHook(() => useProjectActions(exportContext(notifications)))
    act(() => {
      result.current.onExportPlan()
    })
    expect(notifications.success).toHaveBeenCalledWith(expect.stringMatching(/Exported/))
  })
})
