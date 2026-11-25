import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act, cleanup, waitFor } from '@testing-library/react'
import { addFloor } from '../core'
import { NotificationProvider, useNotifications } from '../editor/design-system'
import type { DocumentHandle, FlowResult } from '../session'
import {
  createTestPorts,
  handleOf,
  openOrThrow,
  workspaceRequest,
  type TestPorts,
} from '../session/handle/handle-test-kit'
import type { EditorWorkspaceProps } from './app'
import { namedProject, projectWithWalls, workspaceProps } from './app-test-support'
import type { RunFlow } from './use-open-project'
import { useWorkspaceState } from './use-workspace-state'

const CURRENT_ID = 'current'
const OTHER_ID = 'other'
const RECOVERED_NAME = 'Recovered'
const SNAPSHOT_FAILURE = 'The snapshot store failed'

/** Every handle that a case opened, closed after it. */
const handles: DocumentHandle[] = []

afterEach(async () => {
  cleanup()
  await act(async () => {
    await Promise.all(handles.splice(0).map((handle) => handle.close()))
  })
  vi.restoreAllMocks()
})

/** Stores a project named `name` under `id` and opens it. */
async function openProject(ports: TestPorts, id: string, name: string): Promise<DocumentHandle> {
  await ports.workspace.save(id, namedProject(name))
  const handle = await openOrThrow(ports, workspaceRequest(id))
  handles.push(handle)
  return handle
}

/** Writes a recovered copy into the snapshots of the project `id`. */
function plantRecoveredWork(ports: TestPorts, id: string): Promise<void> {
  return ports.workspace.snapshots(id).writeSnapshot(projectWithWalls(RECOVERED_NAME, 1))
}

interface TestOwner {
  readonly runFlow: RunFlow
  /** How many flows were started. */
  started(): number
  /** The results of the flows that ended, in their order. */
  readonly results: FlowResult<unknown>[]
}

/** An owner that hands every flow the ports and `current`, and records what each flow gives. */
function ownerHanding(ports: TestPorts, current: DocumentHandle): TestOwner {
  const results: FlowResult<unknown>[] = []
  let started = 0
  const runFlow: RunFlow = async (flow) => {
    started += 1
    const result = await flow(ports, current)
    results.push(result)
    if (result.ok) handles.push(result.handle)
    return result
  }
  return { runFlow, started: () => started, results }
}

/** Waits until exactly one flow has ended, and gives its result. */
function theOnlyResult(owner: TestOwner): Promise<FlowResult<unknown>> {
  return waitFor(() => {
    const [result, ...others] = owner.results
    if (result === undefined || others.length > 0) throw new Error('Expected one flow result')
    return result
  })
}

interface RecoverableProject {
  readonly handle: DocumentHandle
  readonly owner: TestOwner
  readonly props: EditorWorkspaceProps
}

/** An open project with recovered work in its snapshots, and an owner that hands its handle. */
async function recoverableProject(): Promise<RecoverableProject> {
  const ports = createTestPorts()
  const handle = await openProject(ports, CURRENT_ID, 'Drafthouse')
  await plantRecoveredWork(ports, CURRENT_ID)
  const owner = ownerHanding(ports, handle)
  return { handle, owner, props: workspaceProps(handle, { runFlow: owner.runFlow }) }
}

function renderWorkspaceState(props: EditorWorkspaceProps) {
  return renderHook((current: EditorWorkspaceProps) => useWorkspaceState(current), {
    initialProps: props,
    wrapper: NotificationProvider,
  })
}

/** Renders the workspace state and, beside it, the notifications that show. */
function renderWithNotifications(props: EditorWorkspaceProps) {
  return renderHook(
    () => ({ state: useWorkspaceState(props), shown: useNotifications().notifications }),
    { wrapper: NotificationProvider },
  )
}

/** One edit through the dispatch boundary, the only way to change the project. */
async function addASecondFloor(handle: DocumentHandle): Promise<void> {
  await act(async () => {
    handle.session.dispatch(addFloor('Second floor'))
  })
}

describe('useWorkspaceState crash recovery', () => {
  it('raises the discard confirmation before restoring over a project with unsaved work', async () => {
    const { handle, owner, props } = await recoverableProject()
    const restore = vi.spyOn(handle.snapshots, 'restore')
    const { result } = renderWorkspaceState(props)
    await waitFor(() => expect(result.current.recovery).not.toBeNull())
    await addASecondFloor(handle)

    await act(async () => {
      void result.current.recovery?.onRestore()
    })

    expect(result.current.discardRequest).not.toBeNull()

    // Cancelling the dialog leaves the live project and the recovered snapshots alone.
    await act(async () => {
      result.current.resolveDiscard(false)
    })

    expect(restore).not.toHaveBeenCalled()
    expect(owner.started()).toBe(0)
  })

  it('a restore that fails keeps the prompt and shows Restore failed with the reason', async () => {
    const { handle, props } = await recoverableProject()
    vi.spyOn(handle.snapshots, 'restore').mockRejectedValue(new Error(SNAPSHOT_FAILURE))
    const { result } = renderWithNotifications(props)
    await waitFor(() => expect(result.current.state.recovery).not.toBeNull())

    await act(async () => {
      await result.current.state.recovery?.onRestore()
    })

    await waitFor(() =>
      expect(result.current.shown.map((shown) => shown.message)).toContain(
        `Restore failed: ${SNAPSHOT_FAILURE}`,
      ),
    )
    expect(result.current.state.recovery).not.toBeNull()
  })

  it('the restore uses the handle that the owner hands it', async () => {
    const ports = createTestPorts()
    const shown = await openProject(ports, CURRENT_ID, 'Drafthouse')
    const handed = await openProject(ports, OTHER_ID, 'Other house')
    await plantRecoveredWork(ports, CURRENT_ID)
    await plantRecoveredWork(ports, OTHER_ID)
    const owner = ownerHanding(ports, handed)
    const { result } = renderWorkspaceState(workspaceProps(shown, { runFlow: owner.runFlow }))
    await waitFor(() => expect(result.current.recovery).not.toBeNull())

    await act(async () => {
      await result.current.recovery?.onRestore()
    })

    expect(handleOf(await theOnlyResult(owner)).id).toBe(OTHER_ID)
  })
})

describe('useWorkspaceState on a new handle', () => {
  // A New or an Open replaces the project with one whose ids the old selection does not
  // know, so the inspector would otherwise report a selection that is not there any more.
  it('drops the selection when a new handle replaces the project', async () => {
    const ports = createTestPorts()
    const props = workspaceProps(await openProject(ports, CURRENT_ID, 'Drafthouse'))
    const fresh = await openProject(ports, OTHER_ID, 'Fresh')
    const { result, rerender } = renderWorkspaceState(props)

    act(() => {
      result.current.selection.select('wall-from-the-old-project')
    })
    expect(result.current.selection.getSelectedIds().size).toBe(1)

    rerender({ ...props, handle: fresh })

    expect(result.current.selection.getSelectedIds().size).toBe(0)
  })
})

describe('useWorkspaceState save status', () => {
  it('the save status follows the handle', async () => {
    const handle = await openProject(createTestPorts({ durable: true }), CURRENT_ID, 'Drafthouse')
    const { result } = renderWorkspaceState(workspaceProps(handle))

    await addASecondFloor(handle)
    expect(result.current.saveStatus).toBe('pending')

    await act(async () => {
      await handle.save()
    })
    expect(result.current.saveStatus).toBe('saved')
  })
})

describe('useWorkspaceState discard confirmation of the recovered copy', () => {
  it('prunes recovered snapshots and clears recovery once discard is confirmed', async () => {
    const { handle, props } = await recoverableProject()
    const prune = vi.spyOn(handle.snapshots, 'prune')
    const { result } = renderWorkspaceState(props)
    await waitFor(() => expect(result.current.recovery).not.toBeNull())

    await act(async () => {
      void result.current.recovery?.onDiscard()
    })
    expect(result.current.discardRequest).not.toBeNull()
    await act(async () => {
      result.current.resolveDiscard(true)
    })

    await waitFor(() => expect(result.current.recovery).toBeNull())
    expect(prune).toHaveBeenCalledOnce()
  })

  it('keeps recovered snapshots and the recovery state when discard is cancelled', async () => {
    const { handle, props } = await recoverableProject()
    const prune = vi.spyOn(handle.snapshots, 'prune')
    const { result } = renderWorkspaceState(props)
    await waitFor(() => expect(result.current.recovery).not.toBeNull())

    await act(async () => {
      void result.current.recovery?.onDiscard()
    })
    await act(async () => {
      result.current.resolveDiscard(false)
    })

    expect(prune).not.toHaveBeenCalled()
    expect(result.current.recovery).not.toBeNull()
  })
})

describe('useWorkspaceState restore over unsaved work', () => {
  // A restore replaces the open project with the recovered one, so it asks as a discard does.
  it('holds a restore of recovered work until a session with unsaved work confirms the discard', async () => {
    const { handle, owner, props } = await recoverableProject()
    const restore = vi.spyOn(handle.snapshots, 'restore')
    const { result } = renderWorkspaceState(props)
    await waitFor(() => expect(result.current.recovery).not.toBeNull())
    await addASecondFloor(handle)

    await act(async () => {
      void result.current.recovery?.onRestore()
    })

    expect(restore).not.toHaveBeenCalled()
    expect(owner.started()).toBe(0)
    await act(async () => {
      result.current.resolveDiscard(false)
    })
  })

  it('restores recovered work once a session with unsaved work confirms the discard', async () => {
    const { handle, owner, props } = await recoverableProject()
    const { result } = renderWorkspaceState(props)
    await waitFor(() => expect(result.current.recovery).not.toBeNull())
    await addASecondFloor(handle)

    await act(async () => {
      void result.current.recovery?.onRestore()
    })
    await act(async () => {
      result.current.resolveDiscard(true)
    })

    const restored = handleOf(await theOnlyResult(owner))
    expect(restored.session.getProject().meta.name).toBe(RECOVERED_NAME)
  })
})
