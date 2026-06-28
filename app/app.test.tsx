import { useState } from 'react'
import { describe, it, expect, afterEach, vi, type Mock } from 'vitest'
import { render, screen, cleanup, waitFor, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App, EditorWorkspace, type EditorWorkspaceProps } from './app'
import {
  InMemoryAssetCache,
  InMemoryProjectStore,
  InMemoryRecentProjectStore,
  type StorageCapabilities,
} from '../storage'
import { createEditorSession } from '../bridge'
import { addFloor, createEmptyProject, createFloor, createWall, type Project } from '../core'
import { NotificationProvider } from '../editor/design-system'

function stubCapableStorage() {
  vi.stubGlobal('navigator', { storage: { getDirectory: () => Promise.resolve({}) } })
  vi.stubGlobal('indexedDB', {})
}

interface SnapshotsFake {
  writeSnapshot: Mock<(project: Project) => Promise<void>>
  prune: Mock<() => Promise<void>>
  isRecoverable: Mock<() => Promise<boolean>>
  restore: Mock<() => Promise<Project | undefined>>
}

// A SnapshotStore-shaped stand-in: the four methods the app depends on, each a spy.
function makeSnapshots(
  overrides: { isRecoverable?: boolean; restore?: Project } = {},
): SnapshotsFake {
  const recoverable = overrides.isRecoverable ?? false
  const restored = overrides.restore
  return {
    writeSnapshot: vi.fn<(project: Project) => Promise<void>>(async () => {}),
    prune: vi.fn<() => Promise<void>>(async () => {}),
    isRecoverable: vi.fn<() => Promise<boolean>>(async () => recoverable),
    restore: vi.fn<() => Promise<Project | undefined>>(async () => restored),
  }
}

function projectWithWalls(name: string, wallCount: number): Project {
  const walls = Array.from({ length: wallCount }, (_unused, index) =>
    createWall({ x: index, y: 0 }, { x: index + 1, y: 0 }),
  )
  const base = createEmptyProject({
    name,
    units: 'imperial',
    period: 'modern',
    appVersion: '0.0.0-test',
  })
  return { ...base, floors: [createFloor('Ground', { walls })] }
}

describe('App boot and storage warnings', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('boots from the store and renders the editor shell with a ground floor', async () => {
    stubCapableStorage()

    render(<App store={new InMemoryProjectStore()} />)

    expect(
      await screen.findByRole('heading', { level: 1, name: /vernacular/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('main', { name: /viewport/i })).toBeInTheDocument()
  })

  it('shows a recoverable error when the project fails to load', async () => {
    stubCapableStorage()
    const store = new InMemoryProjectStore()
    vi.spyOn(store, 'load').mockRejectedValue(new Error('disk fault'))

    render(<App store={store} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not open the project/i)
  })

  it('raises a banner when booting into a storage-degraded environment', async () => {
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('indexedDB', undefined)

    render(<App store={new InMemoryProjectStore()} />)

    await screen.findByRole('heading', { level: 1, name: /vernacular/i })
    expect(await screen.findByRole('alert')).toHaveTextContent(/storage/i)
  })

  it('stays silent when storage is healthy', async () => {
    stubCapableStorage()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    render(<App store={new InMemoryProjectStore()} />)

    await screen.findByRole('heading', { level: 1, name: /vernacular/i })
    // Flush the storage-probe microtask chain so the negative assertion is deterministic.
    await act(async () => {})

    expect(warn).not.toHaveBeenCalled()
  })

  it('renders the editor inside a themed container', async () => {
    stubCapableStorage()

    render(<App store={new InMemoryProjectStore()} />)

    await screen.findByRole('heading', { level: 1, name: /vernacular/i })
    expect(document.querySelector('[data-theme]')).not.toBeNull()
  })
})

describe('App async store resolution', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('boots into the shell when a store is injected', async () => {
    stubCapableStorage()

    render(<App store={new InMemoryProjectStore()} />)

    expect(
      await screen.findByRole('heading', { level: 1, name: /vernacular/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('main', { name: /viewport/i })).toBeInTheDocument()
  })

  it('resolves a store asynchronously and boots into the shell when none is injected', async () => {
    stubCapableStorage()
    const resolveStore = vi.fn(() => Promise.resolve(new InMemoryProjectStore()))

    render(<App resolveStore={resolveStore} />)

    expect(
      await screen.findByRole('heading', { level: 1, name: /vernacular/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('main', { name: /viewport/i })).toBeInTheDocument()
    expect(resolveStore).toHaveBeenCalledTimes(1)
  })

  it('renders the error state when async store resolution rejects', async () => {
    stubCapableStorage()
    const resolveStore = vi.fn(() => Promise.reject(new Error('no storage backend')))

    render(<App resolveStore={resolveStore} />)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(resolveStore).toHaveBeenCalledTimes(1)
  })
})

describe('App project actions', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('saves the current project through the store when Save is clicked', async () => {
    stubCapableStorage()
    const store = new InMemoryProjectStore()
    const save = vi.spyOn(store, 'save')
    const snapshots = makeSnapshots({ isRecoverable: false })

    render(<App store={store} projectId="current" snapshots={snapshots} />)

    await screen.findByRole('heading', { level: 1, name: /vernacular/i })
    save.mockClear()

    // Save now lives in the project menu rather than a header button.
    await userEvent.click(await screen.findByRole('button', { name: /project/i }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /save/i }))

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        'current',
        expect.objectContaining({ floors: expect.any(Array) }),
      ),
    )
    await waitFor(() => expect(snapshots.prune).toHaveBeenCalled())
  })

  it('lists a recent project and opens it into the session when clicked', async () => {
    stubCapableStorage()
    const store = new InMemoryProjectStore()
    await store.save('current', projectWithWalls('Current', 0))
    await store.save('house', projectWithWalls('My House', 1))
    const recentProjects = new InMemoryRecentProjectStore()
    await recentProjects.record({ id: 'house', name: 'My House', backend: 'opfs', lastOpened: 1 })

    render(
      <App
        store={store}
        projectId="current"
        recentProjects={recentProjects}
        snapshots={makeSnapshots({ isRecoverable: false })}
      />,
    )

    await screen.findByRole('heading', { level: 1, name: /vernacular/i })

    await userEvent.click(await screen.findByRole('button', { name: /project/i }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'My House' }))

    expect(
      await screen.findByText('My House', { selector: '.editor-shell__breadcrumb-active' }),
    ).toBeInTheDocument()
  })

  it('offers a recovery prompt that restores recovered work into the session', async () => {
    stubCapableStorage()
    const store = new InMemoryProjectStore()
    await store.save('current', projectWithWalls('Current', 0))
    const snapshots = makeSnapshots({
      isRecoverable: true,
      restore: projectWithWalls('Recovered', 1),
    })

    render(<App store={store} projectId="current" snapshots={snapshots} />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/recovered/i)

    await userEvent.click(screen.getByRole('button', { name: /restore/i }))

    expect(
      await screen.findByText('Recovered', { selector: '.editor-shell__breadcrumb-active' }),
    ).toBeInTheDocument()
  })

  it('offers the same recovery prompt when snapshots are resolved asynchronously', async () => {
    stubCapableStorage()
    const store = new InMemoryProjectStore()
    await store.save('current', projectWithWalls('Current', 0))
    const snapshots = makeSnapshots({
      isRecoverable: true,
      restore: projectWithWalls('Recovered', 1),
    })

    render(
      <App store={store} projectId="current" resolveSnapshots={() => Promise.resolve(snapshots)} />,
    )

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/recovered/i)
  })

  it('discards recovered work and dismisses the prompt when Discard is clicked', async () => {
    stubCapableStorage()
    const store = new InMemoryProjectStore()
    await store.save('current', projectWithWalls('Current', 0))
    const snapshots = makeSnapshots({
      isRecoverable: true,
      restore: projectWithWalls('Recovered', 1),
    })

    render(<App store={store} projectId="current" snapshots={snapshots} />)

    // Clicking Discard on the recovery prompt opens the discard confirmation
    // dialog rather than pruning immediately: discarding recovered work is
    // destructive (prune deletes every autosave file), so it routes through the
    // same confirm seam as New/Open/Import (ADR-0104).
    const alert = await screen.findByRole('alert')
    await userEvent.click(within(alert).getByRole('button', { name: /discard/i }))

    // Confirm the dialog the same way the New/Open/Import discard tests do.
    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /discard/i }))

    // Only after the confirmation does pruning happen and the prompt dismiss.
    await waitFor(() => expect(snapshots.prune).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('shows no recovery prompt when nothing is recoverable', async () => {
    stubCapableStorage()
    const store = new InMemoryProjectStore()
    await store.save('current', projectWithWalls('Current', 0))
    const snapshots = makeSnapshots({ isRecoverable: false })

    render(<App store={store} projectId="current" snapshots={snapshots} />)

    await screen.findByRole('heading', { level: 1, name: /vernacular/i })
    await act(async () => {})

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows no recovery prompt when no snapshots port is provided', async () => {
    stubCapableStorage()
    const store = new InMemoryProjectStore()
    await store.save('current', projectWithWalls('Current', 0))

    render(<App store={store} projectId="current" />)

    await screen.findByRole('heading', { level: 1, name: /vernacular/i })
    await act(async () => {})

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

function capableCapabilities(): StorageCapabilities {
  return {
    opfs: true,
    indexedDb: true,
    fileSystemAccess: false,
    persisted: true,
    estimatedQuotaBytes: null,
  }
}

describe('App unsaved-changes guard', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('prompts to discard a dirty project before New swaps it, and Cancel preserves the project', async () => {
    stubCapableStorage()
    const store = new InMemoryProjectStore()
    const session = createEditorSession(projectWithWalls('Drafthouse', 0))
    const onSession = vi.fn()

    render(
      <NotificationProvider>
        <EditorWorkspace
          session={session}
          store={store}
          assets={new InMemoryAssetCache()}
          projectId="current"
          recentProjects={new InMemoryRecentProjectStore()}
          capabilities={capableCapabilities()}
          snapshots={undefined}
          onSession={onSession}
        />
      </NotificationProvider>,
    )

    await screen.findByRole('heading', { level: 1, name: /vernacular/i })

    // Dirty the live session by dispatching a real mutating command through the
    // dispatch boundary (the only mutation channel), wrapped in act so the guard
    // re-renders against the dirty state.
    await act(async () => {
      session.dispatch(addFloor('Second floor'))
    })

    // Trigger New through the UI: open the project menu and select New project.
    await userEvent.click(await screen.findByRole('button', { name: /project/i }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /new project/i }))

    // A discard confirmation names the dirty project and offers Cancel.
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(/discard unsaved changes to drafthouse/i)

    await userEvent.click(within(dialog).getByRole('button', { name: /cancel/i }))

    // Cancel cancels the swap (no new session) and dismisses the dialog.
    expect(onSession).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(
      screen.getByText('Drafthouse', { selector: '.editor-shell__breadcrumb-active' }),
    ).toBeInTheDocument()
  })

  it('arms the beforeunload guard while dirty and disarms it after an explicit Save', async () => {
    stubCapableStorage()
    const store = new InMemoryProjectStore()
    const session = createEditorSession(projectWithWalls('Drafthouse', 0))

    render(
      <NotificationProvider>
        <EditorWorkspace
          session={session}
          store={store}
          assets={new InMemoryAssetCache()}
          projectId="current"
          recentProjects={new InMemoryRecentProjectStore()}
          capabilities={capableCapabilities()}
          snapshots={undefined}
          onSession={vi.fn()}
        />
      </NotificationProvider>,
    )

    await screen.findByRole('heading', { level: 1, name: /vernacular/i })

    // Dirty the live session through the dispatch boundary (the only mutation
    // channel), wrapped in act so the guard re-renders against the dirty state.
    await act(async () => {
      session.dispatch(addFloor('Second floor'))
    })

    // While dirty, the native beforeunload guard is armed: a cancelable
    // beforeunload event gets vetoed (defaultPrevented) so the browser shows its
    // "you have unsaved changes" warning. Dispatch inside act so any pending
    // effect that registered the listener has flushed first.
    await act(async () => {
      const dirtyEvent = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(dirtyEvent)
      expect(dirtyEvent.defaultPrevented).toBe(true)
    })

    // An explicit Save commits the project and clears the dirty baseline.
    // Save now lives in the project menu rather than a header button.
    await userEvent.click(await screen.findByRole('button', { name: /project/i }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /save/i }))

    // Once the async save settles and the effect cleanup removes the listener,
    // a fresh beforeunload is no longer vetoed: the guard has disarmed.
    await waitFor(() => {
      const cleanEvent = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(cleanEvent)
      expect(cleanEvent.defaultPrevented).toBe(false)
    })
  })

  it('disarms the beforeunload guard after autosave persists the change', async () => {
    stubCapableStorage()
    const store = new InMemoryProjectStore()
    const session = createEditorSession(projectWithWalls('Drafthouse', 0))

    render(
      <NotificationProvider>
        <EditorWorkspace
          session={session}
          store={store}
          assets={new InMemoryAssetCache()}
          projectId="current"
          recentProjects={new InMemoryRecentProjectStore()}
          capabilities={capableCapabilities()}
          snapshots={undefined}
          onSession={vi.fn()}
        />
      </NotificationProvider>,
    )

    await screen.findByRole('heading', { level: 1, name: /vernacular/i })

    // Dirty the live session through the dispatch boundary (the only mutation
    // channel), wrapped in act so the guard re-renders against the dirty state.
    await act(async () => {
      session.dispatch(addFloor('Second floor'))
    })

    // While dirty the native beforeunload guard is armed: a cancelable
    // beforeunload event gets vetoed (defaultPrevented).
    await act(async () => {
      const dirtyEvent = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(dirtyEvent)
      expect(dirtyEvent.defaultPrevented).toBe(true)
    })

    // Without any explicit save, autosave persists the change and clears the
    // dirty baseline. Autosave debounces (~500ms), so allow a generous timeout
    // for a fresh beforeunload to stop being vetoed: the guard has disarmed.
    await waitFor(
      () => {
        const cleanEvent = new Event('beforeunload', { cancelable: true })
        window.dispatchEvent(cleanEvent)
        expect(cleanEvent.defaultPrevented).toBe(false)
      },
      { timeout: 2000 },
    )
  })
})

// A host that owns the session the way AppWorkspace does, so onSession actually
// swaps the live session prop and re-renders EditorWorkspace (rather than a vi.fn
// that drops the new session on the floor). This exercises the real mid-session
// New flow, where a fresh empty project replaces the current one in place.
function SessionHost(props: Omit<EditorWorkspaceProps, 'onSession'>) {
  const [session, setSession] = useState(props.session)
  return (
    <NotificationProvider>
      <EditorWorkspace {...props} session={session} onSession={setSession} />
    </NotificationProvider>
  )
}

describe('App initial tool after a mid-session New', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('re-arms the wall tool when a mid-session New replaces walls with a fresh empty project', async () => {
    stubCapableStorage()

    render(
      <SessionHost
        session={createEditorSession(projectWithWalls('Drafthouse', 1))}
        store={new InMemoryProjectStore()}
        assets={new InMemoryAssetCache()}
        projectId="current"
        recentProjects={new InMemoryRecentProjectStore()}
        capabilities={capableCapabilities()}
        snapshots={undefined}
      />,
    )

    await screen.findByRole('heading', { level: 1, name: /vernacular/i })

    // The starting project has a wall, so #318 leaves the wall tool unarmed.
    expect(screen.getByRole('radio', { name: 'Wall' })).toHaveAttribute('aria-checked', 'false')

    // New replaces the project in place with a fresh empty one (no discard prompt
    // because the starting session is clean).
    await userEvent.click(await screen.findByRole('button', { name: /project/i }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /new project/i }))

    // The fresh empty project re-runs the initial-tool decision: the wall tool is
    // armed again, mirroring a freshly loaded empty project at mount (#318).
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Wall' })).toHaveAttribute('aria-checked', 'true'),
    )
  })
})
