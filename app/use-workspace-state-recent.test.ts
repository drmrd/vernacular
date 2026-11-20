import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act, cleanup, waitFor } from '@testing-library/react'
import { NotificationProvider } from '../editor/design-system'
import { reconcileIndex, type DocumentHandle, type ProjectIndex } from '../session'
import {
  createTestPorts,
  openOrThrow,
  placeDocument,
  workspaceRequest,
  type TestPorts,
} from '../session/handle/handle-test-kit'
import { failingIndex } from '../storage/project-index/project-record-test-kit'
import { recordUnhandledRejections } from './action-test-support'
import type { EditorWorkspaceProps } from './app'
import { namedProject, plantProject, usedLast, workspaceProps } from './app-test-support'
import { useWorkspaceState } from './use-workspace-state'

const CURRENT_ID = 'current'
const CURRENT_NAME = 'Drafthouse'
const FIRST_ID = 'first'
const FIRST_NAME = 'First House'
const SECOND_ID = 'second'
const SECOND_NAME = 'Second House'
const NAMELESS_ID = 'nameless'

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

function renderWorkspaceState(props: EditorWorkspaceProps) {
  return renderHook((current: EditorWorkspaceProps) => useWorkspaceState(current), {
    initialProps: props,
    wrapper: NotificationProvider,
  })
}

/** The first `all` of `index` stays pending until `release` runs; later calls run at once. */
function holdFirstAll(index: ProjectIndex): {
  started: () => number
  release: () => Promise<void>
} {
  const realAll = index.all.bind(index)
  let started = 0
  let letGo: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    letGo = resolve
  })
  let ended: Promise<unknown> = Promise.resolve()
  index.all = () => {
    started += 1
    if (started > 1) return realAll()
    ended = gate.then(realAll)
    return ended as ReturnType<typeof realAll>
  }
  return {
    started: () => started,
    release: async () => {
      letGo()
      await ended
    },
  }
}

describe('useWorkspaceState the recent entries', () => {
  it('lists the stored projects that were used last, without the open one', async () => {
    const ports = createTestPorts()
    const handle = await openProject(ports, CURRENT_ID, CURRENT_NAME)
    await plantProject(ports, FIRST_ID, FIRST_NAME)
    await plantProject(ports, SECOND_ID, SECOND_NAME)
    await reconcileIndex(ports)
    await usedLast(ports, FIRST_ID)
    await usedLast(ports, SECOND_ID)

    const { result } = renderWorkspaceState(workspaceProps(handle, { ports }))

    await waitFor(() =>
      expect(result.current.recentEntries).toEqual([
        { id: SECOND_ID, name: SECOND_NAME },
        { id: FIRST_ID, name: FIRST_NAME },
      ]),
    )
  })

  it('reads the list again when another project opens', async () => {
    const ports = createTestPorts()
    const current = await openProject(ports, CURRENT_ID, CURRENT_NAME)
    const props = workspaceProps(current, { ports })
    const { result, rerender } = renderWorkspaceState(props)
    await waitFor(() => expect(result.current.recentEntries).toEqual([]))

    const other = await openProject(ports, FIRST_ID, FIRST_NAME)
    rerender({ ...props, handle: other })

    await waitFor(() =>
      expect(result.current.recentEntries).toEqual([{ id: CURRENT_ID, name: CURRENT_NAME }]),
    )
  })

  it('a read that ends after another project opened does not replace the list of that project', async () => {
    const ports = createTestPorts()
    const current = await openProject(ports, CURRENT_ID, CURRENT_NAME)
    const other = await openProject(ports, FIRST_ID, FIRST_NAME)
    const firstRead = holdFirstAll(ports.index)
    const shown: string[][] = []
    const props = workspaceProps(current, { ports })
    const { result, rerender } = renderHook(
      (each: EditorWorkspaceProps) => {
        const state = useWorkspaceState(each)
        shown.push(state.recentEntries.map((entry) => entry.id))
        return state
      },
      { initialProps: props, wrapper: NotificationProvider },
    )
    await waitFor(() => expect(firstRead.started()).toBe(1))

    rerender({ ...props, handle: other })
    await act(async () => {
      await firstRead.release()
    })

    await waitFor(() =>
      expect(result.current.recentEntries).toEqual([{ id: CURRENT_ID, name: CURRENT_NAME }]),
    )
    expect(shown.flat()).not.toContain(FIRST_ID)
  })

  it('reads the list again for new ports', async () => {
    const firstPorts = createTestPorts()
    const handle = await openProject(firstPorts, CURRENT_ID, CURRENT_NAME)
    await plantProject(firstPorts, FIRST_ID, FIRST_NAME)
    const secondPorts = createTestPorts()
    await plantProject(secondPorts, SECOND_ID, SECOND_NAME)
    const props = workspaceProps(handle, { ports: firstPorts })
    const { result, rerender } = renderWorkspaceState(props)
    await waitFor(() =>
      expect(result.current.recentEntries).toEqual([{ id: FIRST_ID, name: FIRST_NAME }]),
    )

    rerender({ ...props, ports: secondPorts })

    await waitFor(() =>
      expect(result.current.recentEntries).toEqual([{ id: SECOND_ID, name: SECOND_NAME }]),
    )
  })

  it('a record with no name shows as Unnamed project', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const ports = createTestPorts()
    const handle = await openProject(ports, CURRENT_ID, CURRENT_NAME)
    await placeDocument(ports, NAMELESS_ID, new TextEncoder().encode('not a project'))

    const { result } = renderWorkspaceState(workspaceProps(handle, { ports }))

    await waitFor(() =>
      expect(result.current.recentEntries).toEqual([{ id: NAMELESS_ID, name: 'Unnamed project' }]),
    )
  })

  it('an index that rejects its calls gives a list rebuilt from the store and leaves nothing unhandled', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const unhandled = recordUnhandledRejections()
    const ports = createTestPorts({ index: failingIndex() })
    try {
      const handle = await openProject(ports, CURRENT_ID, CURRENT_NAME)
      await plantProject(ports, FIRST_ID, FIRST_NAME)

      const { result } = renderWorkspaceState(workspaceProps(handle, { ports }))

      await waitFor(() =>
        expect(result.current.recentEntries).toEqual([{ id: FIRST_ID, name: FIRST_NAME }]),
      )
      expect(await unhandled.read()).toEqual([])
    } finally {
      unhandled.stop()
    }
  })
})
