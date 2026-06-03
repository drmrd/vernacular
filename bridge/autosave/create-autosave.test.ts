import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createAutosave } from './create-autosave'
import { createEditorSession } from '../session/editor-session'
import { InMemoryProjectStore } from '../../storage'
import { addFloor, createEmptyProject, type Project } from '../../core'

function emptyProject(): Project {
  return createEmptyProject({ name: 'Test', units: 'metric', era: 'modern', appVersion: '0.0.0' })
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
    const autosave = createAutosave(session, store, 'current', {
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
    const autosave = createAutosave(session, store, 'current', { delayMs: 500 })

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
    const autosave = createAutosave(session, store, 'current', { delayMs: 500 })

    autosave.dispose()
    session.dispatch(addFloor('Ground'))
    await vi.advanceTimersByTimeAsync(500)

    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('reports no status after dispose', async () => {
    const session = createEditorSession(emptyProject())
    const store = new InMemoryProjectStore()
    const statuses: string[] = []
    const autosave = createAutosave(session, store, 'current', {
      delayMs: 500,
      onStatusChange: (status) => statuses.push(status),
    })

    autosave.dispose()
    session.dispatch(addFloor('Ground'))
    await vi.advanceTimersByTimeAsync(500)

    expect(statuses).toEqual([])
  })
})
