import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createAutosave } from './create-autosave'
import type { AutosaveConfig } from './create-autosave'
import { gateSaves, settle } from './save-gate-test-kit'
import { createEditorSession } from '../editor-session/editor-session'
import { InMemoryProjectStore } from '../../storage'
import { addFloor, createEmptyProject, type Project } from '../../core'

const DELAY_MS = 500
const PROJECT_ID = 'current'

function emptyProject(): Project {
  return createEmptyProject({
    name: 'Test',
    units: 'metric',
    period: 'modern',
    appVersion: '0.0.0',
  })
}

/** A session on an empty project, an in-memory store, and an autosave over both. */
function setUp(options: Partial<AutosaveConfig> = {}) {
  const session = createEditorSession(emptyProject())
  const store = new InMemoryProjectStore()
  const autosave = createAutosave({
    session,
    store,
    projectId: PROJECT_ID,
    delayMs: DELAY_MS,
    ...options,
  })
  return { session, store, autosave }
}

/** The number of floors of the stored project; throws, naming the failure, when the read fails. */
async function storedFloorCount(store: InMemoryProjectStore): Promise<number> {
  const read = await store.read(PROJECT_ID)
  if (!read.ok) throw new Error(`Expected a stored project: ${JSON.stringify(read.failure)}`)
  return read.value.project.floors.length
}

describe('createAutosave waiting for the delay', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('saves the project after the debounce window and reports status', async () => {
    const statuses: string[] = []
    const { session, store, autosave } = setUp({
      onStatusChange: (status) => statuses.push(status),
    })

    session.dispatch(addFloor('Ground'))
    expect(statuses).toEqual(['pending'])

    await vi.advanceTimersByTimeAsync(DELAY_MS)
    expect(statuses).toEqual(['pending', 'saved'])
    expect(await storedFloorCount(store)).toBe(1)

    autosave.dispose()
  })

  it('coalesces rapid edits into a single save', async () => {
    const { session, store, autosave } = setUp()
    const saveSpy = vi.spyOn(store, 'save')

    session.dispatch(addFloor('Ground'))
    await vi.advanceTimersByTimeAsync(200)
    session.dispatch(addFloor('Upper'))
    await vi.advanceTimersByTimeAsync(DELAY_MS)

    expect(saveSpy).toHaveBeenCalledTimes(1)
    expect(await storedFloorCount(store)).toBe(2)

    autosave.dispose()
  })

  it('stops saving after dispose', async () => {
    const { session, store, autosave } = setUp()
    const saveSpy = vi.spyOn(store, 'save')

    autosave.dispose()
    session.dispatch(addFloor('Ground'))
    await vi.advanceTimersByTimeAsync(DELAY_MS)

    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('reports no status after dispose', async () => {
    const statuses: string[] = []
    const { session, autosave } = setUp({ onStatusChange: (status) => statuses.push(status) })

    autosave.dispose()
    session.dispatch(addFloor('Ground'))
    await vi.advanceTimersByTimeAsync(DELAY_MS)

    expect(statuses).toEqual([])
  })
})

describe('createAutosave asked to save now', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('save() asks for a write at once, with no edit and no delay', async () => {
    const { store, autosave } = setUp()
    const saveSpy = vi.spyOn(store, 'save')

    await autosave.save()

    expect(saveSpy).toHaveBeenCalledTimes(1)
    expect(await storedFloorCount(store)).toBe(0)

    autosave.dispose()
  })

  it('save() cancels the wait, so the end of the delay gives no second write', async () => {
    const { session, store, autosave } = setUp()
    const saveSpy = vi.spyOn(store, 'save')

    session.dispatch(addFloor('Ground'))
    await autosave.save()
    await vi.advanceTimersByTimeAsync(DELAY_MS)

    expect(saveSpy).toHaveBeenCalledTimes(1)
    expect(await storedFloorCount(store)).toBe(1)

    autosave.dispose()
  })

  it('asks for no write at the end of the delay when a waiting write already stored the last edit', async () => {
    const { session, store, autosave } = setUp()
    const gate = gateSaves(store)
    session.dispatch(addFloor('Ground'))
    await vi.advanceTimersByTimeAsync(DELAY_MS)
    session.dispatch(addFloor('Upper'))
    await vi.advanceTimersByTimeAsync(DELAY_MS)
    session.dispatch(addFloor('Attic'))

    gate.endOldestSave()
    await settle()
    gate.endOldestSave()
    await settle()
    await vi.advanceTimersByTimeAsync(DELAY_MS)

    expect(gate.started()).toBe(2)
    expect(await storedFloorCount(store)).toBe(3)

    autosave.dispose()
  })
})
