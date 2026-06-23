import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createAutosave, commitProject } from './create-autosave'
import { createEditorSession } from '../session/editor-session'
import { InMemoryProjectStore } from '../../storage'
import { addFloor, createEmptyProject, type Project } from '../../core'

function emptyProject(): Project {
  return createEmptyProject({
    name: 'Test',
    units: 'metric',
    period: 'modern',
    appVersion: '0.0.0',
  })
}

describe('createAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('saves the project after the debounce window and reports status', async () => {
    const session = createEditorSession(emptyProject())
    const store = new InMemoryProjectStore()
    const statuses: string[] = []
    const autosave = createAutosave({
      session,
      store,
      projectId: 'current',
      delayMs: 500,
      onStatusChange: (status) => statuses.push(status),
    })

    session.dispatch(addFloor('Ground'))
    expect(statuses).toEqual(['pending'])

    await vi.advanceTimersByTimeAsync(500)
    expect(statuses).toEqual(['pending', 'saved'])
    expect((await store.load('current')).floors).toHaveLength(1)

    autosave.dispose()
  })

  it('coalesces rapid edits into a single save', async () => {
    const session = createEditorSession(emptyProject())
    const store = new InMemoryProjectStore()
    const saveSpy = vi.spyOn(store, 'save')
    const autosave = createAutosave({ session, store, projectId: 'current', delayMs: 500 })

    session.dispatch(addFloor('Ground'))
    await vi.advanceTimersByTimeAsync(200)
    session.dispatch(addFloor('Upper'))
    await vi.advanceTimersByTimeAsync(500)

    expect(saveSpy).toHaveBeenCalledTimes(1)
    expect((await store.load('current')).floors).toHaveLength(2)

    autosave.dispose()
  })

  it('stops saving after dispose', async () => {
    const session = createEditorSession(emptyProject())
    const store = new InMemoryProjectStore()
    const saveSpy = vi.spyOn(store, 'save')
    const autosave = createAutosave({ session, store, projectId: 'current', delayMs: 500 })

    autosave.dispose()
    session.dispatch(addFloor('Ground'))
    await vi.advanceTimersByTimeAsync(500)

    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('reports no status after dispose', async () => {
    const session = createEditorSession(emptyProject())
    const store = new InMemoryProjectStore()
    const statuses: string[] = []
    const autosave = createAutosave({
      session,
      store,
      projectId: 'current',
      delayMs: 500,
      onStatusChange: (status) => statuses.push(status),
    })

    autosave.dispose()
    session.dispatch(addFloor('Ground'))
    await vi.advanceTimersByTimeAsync(500)

    expect(statuses).toEqual([])
  })

  it('writes ahead to a snapshot, then saves canonically, then prunes in order', async () => {
    const session = createEditorSession(emptyProject())
    const store = new InMemoryProjectStore()
    const order: string[] = []
    const writeSnapshot = vi.fn().mockImplementation(async () => {
      order.push('writeSnapshot')
    })
    const prune = vi.fn().mockImplementation(async () => {
      order.push('prune')
    })
    const saveSpy = vi.spyOn(store, 'save').mockImplementation(async () => {
      order.push('save')
    })
    const snapshots = { writeSnapshot, prune }
    const statuses: string[] = []
    const autosave = createAutosave({
      session,
      store,
      projectId: 'current',
      delayMs: 500,
      snapshots,
      onStatusChange: (status) => statuses.push(status),
    })

    session.dispatch(addFloor('Ground'))
    expect(statuses).toEqual(['pending'])

    await vi.advanceTimersByTimeAsync(500)

    expect(writeSnapshot).toHaveBeenCalledTimes(1)
    expect(writeSnapshot).toHaveBeenCalledWith(session.getProject())
    expect(saveSpy).toHaveBeenCalledTimes(1)
    expect(saveSpy).toHaveBeenCalledWith('current', session.getProject())
    expect(prune).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['writeSnapshot', 'save', 'prune'])
    expect(statuses).toEqual(['pending', 'saved'])

    autosave.dispose()
  })

  it('leaves the latest edit in the canonical store after a write-ahead cycle', async () => {
    const session = createEditorSession(emptyProject())
    const store = new InMemoryProjectStore()
    const writeSnapshot = vi.fn().mockResolvedValue(undefined)
    const prune = vi.fn().mockResolvedValue(undefined)
    const snapshots = { writeSnapshot, prune }
    const autosave = createAutosave({
      session,
      store,
      projectId: 'current',
      delayMs: 500,
      snapshots,
    })

    session.dispatch(addFloor('Ground'))
    await vi.advanceTimersByTimeAsync(500)

    expect((await store.load('current')).floors).toHaveLength(1)

    autosave.dispose()
  })

  it('keeps the snapshot without pruning and reports error when the canonical save fails', async () => {
    const session = createEditorSession(emptyProject())
    const store = new InMemoryProjectStore()
    const order: string[] = []
    const writeSnapshot = vi.fn().mockImplementation(async () => {
      order.push('writeSnapshot')
    })
    const prune = vi.fn().mockImplementation(async () => {
      order.push('prune')
    })
    const saveSpy = vi.spyOn(store, 'save').mockImplementation(async () => {
      order.push('save')
      throw new Error('disk full')
    })
    const snapshots = { writeSnapshot, prune }
    const statuses: string[] = []
    const autosave = createAutosave({
      session,
      store,
      projectId: 'current',
      delayMs: 500,
      snapshots,
      onStatusChange: (status) => statuses.push(status),
    })

    session.dispatch(addFloor('Ground'))
    await vi.advanceTimersByTimeAsync(500)

    expect(writeSnapshot).toHaveBeenCalledTimes(1)
    expect(saveSpy).toHaveBeenCalledTimes(1)
    expect(prune).not.toHaveBeenCalled()
    expect(order).toEqual(['writeSnapshot', 'save'])
    expect(statuses).toEqual(['pending', 'error'])

    autosave.dispose()
  })

  it('reports the saved revision once after a successful save', async () => {
    const session = createEditorSession(emptyProject())
    const store = new InMemoryProjectStore()
    const onSaved = vi.fn()
    const autosave = createAutosave({
      session,
      store,
      projectId: 'current',
      delayMs: 500,
      revision: () => 7,
      onSaved,
    })

    session.dispatch(addFloor('Ground'))
    await vi.advanceTimersByTimeAsync(500)

    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(onSaved).toHaveBeenCalledWith(7)

    autosave.dispose()
  })

  it('reports the revision captured at persist start, not one bumped during the write', async () => {
    const session = createEditorSession(emptyProject())
    const store = new InMemoryProjectStore()
    const onSaved = vi.fn()
    let rev = 1
    vi.spyOn(store, 'save').mockImplementation(async () => {
      rev = 2
    })
    const autosave = createAutosave({
      session,
      store,
      projectId: 'current',
      delayMs: 500,
      revision: () => rev,
      onSaved,
    })

    session.dispatch(addFloor('Ground'))
    await vi.advanceTimersByTimeAsync(500)

    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(onSaved).toHaveBeenCalledWith(1)

    autosave.dispose()
  })

  it('does not report a saved revision when the canonical save fails', async () => {
    const session = createEditorSession(emptyProject())
    const store = new InMemoryProjectStore()
    const onSaved = vi.fn()
    vi.spyOn(store, 'save').mockImplementation(async () => {
      throw new Error('disk full')
    })
    const statuses: string[] = []
    const autosave = createAutosave({
      session,
      store,
      projectId: 'current',
      delayMs: 500,
      revision: () => 3,
      onSaved,
      onStatusChange: (status) => statuses.push(status),
    })

    session.dispatch(addFloor('Ground'))
    await vi.advanceTimersByTimeAsync(500)

    expect(onSaved).not.toHaveBeenCalled()
    expect(statuses).toEqual(['pending', 'error'])

    autosave.dispose()
  })

  it('saves normally when revision and onSaved are omitted', async () => {
    const session = createEditorSession(emptyProject())
    const store = new InMemoryProjectStore()
    const autosave = createAutosave({ session, store, projectId: 'current', delayMs: 500 })

    session.dispatch(addFloor('Ground'))
    await vi.advanceTimersByTimeAsync(500)

    expect((await store.load('current')).floors).toHaveLength(1)

    autosave.dispose()
  })
})

describe('commitProject', () => {
  it('saves the canonical project and then prunes snapshots in order', async () => {
    const project = emptyProject()
    const store = new InMemoryProjectStore()
    const order: string[] = []
    const saveSpy = vi.spyOn(store, 'save').mockImplementation(async () => {
      order.push('save')
    })
    const prune = vi.fn().mockImplementation(async () => {
      order.push('prune')
    })

    await commitProject({ store, projectId: 'current', project, snapshots: { prune } })

    expect(saveSpy).toHaveBeenCalledWith('current', project)
    expect(prune).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['save', 'prune'])
  })

  it('saves without pruning when no snapshots are provided', async () => {
    const project = emptyProject()
    const store = new InMemoryProjectStore()
    const saveSpy = vi.spyOn(store, 'save')

    await expect(commitProject({ store, projectId: 'current', project })).resolves.toBeUndefined()

    expect(saveSpy).toHaveBeenCalledWith('current', project)
  })
})
