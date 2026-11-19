import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createAutosave } from './create-autosave'
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
function setUp() {
  const session = createEditorSession(emptyProject())
  const store = new InMemoryProjectStore()
  const autosave = createAutosave({ session, store, projectId: PROJECT_ID, delayMs: DELAY_MS })
  return { session, store, autosave }
}

/** The number of floors of the stored project; throws, naming the failure, when the read fails. */
async function storedFloorCount(store: InMemoryProjectStore): Promise<number> {
  const read = await store.read(PROJECT_ID)
  if (!read.ok) throw new Error(`Expected a stored project: ${JSON.stringify(read.failure)}`)
  return read.value.project.floors.length
}

/** Whether `promise` resolved or rejected, once it has settled. */
function settledAs(promise: Promise<void>): Promise<'resolved' | 'rejected'> {
  return promise.then(
    () => 'resolved',
    () => 'rejected',
  )
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('flush() of createAutosave', () => {
  it('flush() after the last edit was stored asks for no write', async () => {
    const { session, store, autosave } = setUp()
    session.dispatch(addFloor('Ground'))
    await vi.advanceTimersByTimeAsync(DELAY_MS)
    const save = vi.spyOn(store, 'save')

    await autosave.flush()
    await settle()

    expect(save).not.toHaveBeenCalled()
    autosave.dispose()
  })

  it('flush() with an unsaved edit writes at once and cancels the wait', async () => {
    const { session, store, autosave } = setUp()
    const save = vi.spyOn(store, 'save')
    session.dispatch(addFloor('Ground'))

    await autosave.flush()
    expect(await storedFloorCount(store)).toBe(1)

    await vi.advanceTimersByTimeAsync(DELAY_MS)
    expect(save).toHaveBeenCalledTimes(1)
    autosave.dispose()
  })

  it('flush() during a write that already covers the last edit waits for it and starts no second write', async () => {
    const { session, store, autosave } = setUp()
    const gate = gateSaves(store)
    session.dispatch(addFloor('Ground'))
    await vi.advanceTimersByTimeAsync(DELAY_MS)
    let flushed = false
    void autosave.flush().then(() => {
      flushed = true
    })

    await settle()
    expect(flushed).toBe(false)

    gate.endOldestSave()
    await settle()
    expect(flushed).toBe(true)
    expect(gate.started()).toBe(1)
    autosave.dispose()
  })

  it('flush() after dispose() rejects', async () => {
    const { autosave } = setUp()
    autosave.dispose()

    expect(await settledAs(autosave.flush())).toBe('rejected')
  })
})

describe('flush() of createAutosave after a write that failed', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('flush() after a failed save() with no change asks for a write again', async () => {
    const { store, autosave } = setUp()
    const save = vi.spyOn(store, 'save').mockRejectedValueOnce(new Error('disk full'))
    expect(await settledAs(autosave.save())).toBe('rejected')

    const flushed = settledAs(autosave.flush())
    await settle()

    expect(save).toHaveBeenCalledTimes(2)
    expect(await flushed).toBe('resolved')
    autosave.dispose()
  })

  it('flush() resolves when an earlier write fails and the later write it waits for succeeds', async () => {
    const { session, store, autosave } = setUp()
    const gate = gateSaves(store)
    session.dispatch(addFloor('Ground'))
    await vi.advanceTimersByTimeAsync(DELAY_MS)
    session.dispatch(addFloor('Upper'))
    const flushed = settledAs(autosave.flush())

    await settle()
    gate.endOldestSave(new Error('disk full'))
    await settle()
    gate.endOldestSave()

    expect(await flushed).toBe('resolved')
    expect(await storedFloorCount(store)).toBe(2)
    autosave.dispose()
  })
})
