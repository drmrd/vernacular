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

  it('writes a snapshot instead of saving when snapshots are provided', async () => {
    const session = createEditorSession(emptyProject())
    const store = new InMemoryProjectStore()
    const saveSpy = vi.spyOn(store, 'save')
    const writeSnapshot = vi.fn().mockResolvedValue(undefined)
    const statuses: string[] = []
    const autosave = createAutosave({
      session,
      store,
      projectId: 'current',
      delayMs: 500,
      snapshots: { writeSnapshot },
      onStatusChange: (status) => statuses.push(status),
    })

    session.dispatch(addFloor('Ground'))
    expect(statuses).toEqual(['pending'])

    await vi.advanceTimersByTimeAsync(500)

    expect(writeSnapshot).toHaveBeenCalledTimes(1)
    expect(writeSnapshot).toHaveBeenCalledWith(session.getProject())
    expect(saveSpy).not.toHaveBeenCalled()
    expect(statuses).toEqual(['pending', 'saved'])

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
