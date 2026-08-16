import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { createEditorSession, type EditorSession } from '../bridge'
import { addFloor, createEmptyProject, type Project } from '../core'
import { NotificationProvider } from '../editor/design-system'
import {
  InMemoryAssetCache,
  InMemoryProjectStore,
  InMemoryRecentProjectStore,
  type StorageCapabilities,
} from '../storage'
import type { EditorWorkspaceProps, SnapshotsPort } from './app'
import { useWorkspaceState } from './use-workspace-state'

function sampleProject(name: string): Project {
  return createEmptyProject({
    name,
    units: 'imperial',
    period: 'modern',
    appVersion: '0.0.0-test',
  })
}

const capableStorage: StorageCapabilities = {
  opfs: true,
  indexedDb: true,
  fileSystemAccess: false,
  persisted: true,
  estimatedQuotaBytes: null,
}

function workspaceProps(
  overrides: { session: EditorSession } & Partial<EditorWorkspaceProps>,
): EditorWorkspaceProps {
  return {
    store: new InMemoryProjectStore(),
    assets: new InMemoryAssetCache(),
    projectId: 'current',
    recentProjects: new InMemoryRecentProjectStore(),
    capabilities: capableStorage,
    snapshots: undefined,
    onSession: vi.fn(),
    ...overrides,
  }
}

function recoverableSnapshots(
  restored: Project,
): SnapshotsPort & { restore: ReturnType<typeof vi.fn> } {
  return {
    writeSnapshot: vi.fn(() => Promise.resolve()),
    prune: vi.fn(() => Promise.resolve()),
    isRecoverable: vi.fn(() => Promise.resolve(true)),
    restore: vi.fn(() => Promise.resolve(restored)),
  }
}

describe('useWorkspaceState crash recovery', () => {
  it('raises the discard confirmation before restoring over a dirty project', async () => {
    const session = createEditorSession(sampleProject('Drafthouse'))
    const snapshots = recoverableSnapshots(sampleProject('Recovered'))
    const onSession = vi.fn()
    const props = workspaceProps({ session, snapshots, onSession })

    const { result } = renderHook(() => useWorkspaceState(props), { wrapper: NotificationProvider })

    await waitFor(() => expect(result.current.recovery).not.toBeNull())

    // Dirty the live session through the dispatch boundary, the only mutation channel.
    await act(async () => {
      session.dispatch(addFloor('Second floor'))
    })

    await act(async () => {
      void result.current.recovery?.onRestore()
    })

    expect(result.current.discardRequest).not.toBeNull()

    // Cancelling the dialog leaves the live project and the recovered snapshots alone.
    await act(async () => {
      result.current.resolveDiscard(false)
    })

    expect(snapshots.restore).not.toHaveBeenCalled()
    expect(onSession).not.toHaveBeenCalled()
  })
})

describe('useWorkspaceState session swap', () => {
  // A New or an Open replaces the session with a project the old selection ids know
  // nothing about, so the inspector would otherwise report a selection that is not
  // there any more.
  it('drops the selection when a new session replaces the project', () => {
    const props = workspaceProps({ session: createEditorSession(sampleProject('Drafthouse')) })
    const { result, rerender } = renderHook(
      (current: EditorWorkspaceProps) => useWorkspaceState(current),
      { initialProps: props, wrapper: NotificationProvider },
    )

    act(() => {
      result.current.selection.select('wall-from-the-old-project')
    })
    expect(result.current.selection.getSelectedIds().size).toBe(1)

    rerender({ ...props, session: createEditorSession(sampleProject('Fresh')) })

    expect(result.current.selection.getSelectedIds().size).toBe(0)
  })
})
