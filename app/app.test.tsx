import { describe, it, expect, afterEach, vi, type Mock } from 'vitest'
import { render, screen, cleanup, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './app'
import { InMemoryProjectStore, InMemoryRecentProjectStore } from '../storage'
import { createEmptyProject, createFloor, createWall, type Project } from '../core'

function stubCapableStorage() {
  vi.stubGlobal('navigator', { storage: { getDirectory: () => Promise.resolve({}) } })
  vi.stubGlobal('indexedDB', {})
}

interface SnapshotsFake {
  writeSnapshot: Mock<[Project], Promise<void>>
  prune: Mock<[], Promise<void>>
  isRecoverable: Mock<[], Promise<boolean>>
  restore: Mock<[], Promise<Project | undefined>>
}

// A SnapshotStore-shaped stand-in: the four methods the app depends on, each a spy.
function makeSnapshots(
  overrides: { isRecoverable?: boolean; restore?: Project } = {},
): SnapshotsFake {
  const recoverable = overrides.isRecoverable ?? false
  const restored = overrides.restore
  return {
    writeSnapshot: vi.fn<[Project], Promise<void>>(async () => {}),
    prune: vi.fn<[], Promise<void>>(async () => {}),
    isRecoverable: vi.fn<[], Promise<boolean>>(async () => recoverable),
    restore: vi.fn<[], Promise<Project | undefined>>(async () => restored),
  }
}

function projectWithWalls(name: string, wallCount: number): Project {
  const walls = Array.from({ length: wallCount }, (_unused, index) =>
    createWall({ x: index, y: 0 }, { x: index + 1, y: 0 }),
  )
  const base = createEmptyProject({
    name,
    units: 'imperial',
    era: 'modern',
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
    expect(screen.getByText(/walls: 0/i)).toBeInTheDocument()
  })

  it('shows a recoverable error when the project fails to load', async () => {
    stubCapableStorage()
    const store = new InMemoryProjectStore()
    vi.spyOn(store, 'load').mockRejectedValue(new Error('disk fault'))

    render(<App store={store} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not open the project/i)
  })

  it('warns once when booting into a storage-degraded environment', async () => {
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('indexedDB', undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    render(<App store={new InMemoryProjectStore()} />)

    await screen.findByRole('heading', { level: 1, name: /vernacular/i })
    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Storage capabilities')),
    )
    expect(warn).toHaveBeenCalledTimes(1)
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

    const saveButton = await screen.findByRole('button', { name: /save/i })
    save.mockClear()
    await userEvent.click(saveButton)

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
    expect(screen.getByText(/walls: 0/i)).toBeInTheDocument()

    await userEvent.click(await screen.findByRole('button', { name: 'My House' }))

    expect(await screen.findByText(/walls: 1/i)).toBeInTheDocument()
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

    expect(await screen.findByText(/walls: 1/i)).toBeInTheDocument()
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

    await screen.findByRole('alert')
    await userEvent.click(screen.getByRole('button', { name: /discard/i }))

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
