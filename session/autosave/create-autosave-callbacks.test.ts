import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createAutosave } from './create-autosave'
import type { AutosaveConfig, AutosaveStatus } from './create-autosave'
import { gateSaves, settle } from './save-gate-test-kit'
import { createEditorSession } from '../editor-session/editor-session'
import { InMemoryProjectStore } from '../../storage'
import { addFloor, createEmptyProject, type Project } from '../../core'

const DELAY_MS = 500
const PROJECT_ID = 'current'
const REVISION = 7

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

/** A callback that throws `error` when it gets `trigger`, and does nothing for another status. */
function throwingOn(trigger: AutosaveStatus, error: Error): (status: AutosaveStatus) => void {
  return (status) => {
    if (status === trigger) throw error
  }
}

/** A revision reader that throws `error` on its first call and gives a number after that. */
function revisionThrowingOnce(error: Error): () => number {
  let calls = 0
  return () => {
    calls += 1
    if (calls === 1) throw error
    return REVISION
  }
}

let consoleError: ReturnType<typeof vi.spyOn>

/** Every value that was passed to `console.error`, in one list. */
function loggedValues(): unknown[] {
  return consoleError.mock.calls.flat()
}

beforeEach(() => {
  vi.useFakeTimers()
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('createAutosave with an onSaved callback that throws', () => {
  it('save() resolves with the project stored, and the error is reported once to console.error', async () => {
    const failure = new Error('onSaved failed')
    const { session, store, autosave } = setUp({
      onSaved: () => {
        throw failure
      },
    })
    session.dispatch(addFloor('Ground'))

    await expect(autosave.save()).resolves.toBeUndefined()

    expect(await storedFloorCount(store)).toBe(1)
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(loggedValues()).toContain(failure)
    autosave.dispose()
  })
})

describe('createAutosave with an onStatusChange callback that throws', () => {
  it('a throw on saved does not stop onSaved from hearing of the write', async () => {
    const onSaved = vi.fn()
    const { session, autosave } = setUp({
      revision: () => REVISION,
      onSaved,
      onStatusChange: throwingOn('saved', new Error('status callback failed')),
    })

    session.dispatch(addFloor('Ground'))
    await vi.advanceTimersByTimeAsync(DELAY_MS)

    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(onSaved).toHaveBeenCalledWith(REVISION)
    autosave.dispose()
  })

  it('a throw on saved is reported once to console.error', async () => {
    const failure = new Error('status callback failed')
    const { session, autosave } = setUp({ onStatusChange: throwingOn('saved', failure) })

    session.dispatch(addFloor('Ground'))
    await vi.advanceTimersByTimeAsync(DELAY_MS)

    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(loggedValues()).toContain(failure)
    autosave.dispose()
  })

  it('a throw on pending does not stop the edit or the write', async () => {
    const { session, store, autosave } = setUp({
      onStatusChange: throwingOn('pending', new Error('status callback failed')),
    })

    expect(() => session.dispatch(addFloor('Ground'))).not.toThrow()
    expect(session.getProject().floors).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(DELAY_MS)
    expect(await storedFloorCount(store)).toBe(1)
    autosave.dispose()
  })
})

describe('createAutosave when the start of a write throws', () => {
  it('save() rejects and the status is error, and the next save stores and reports saved', async () => {
    const failure = new Error('the revision cannot be read')
    const statuses: AutosaveStatus[] = []
    const { session, store, autosave } = setUp({
      revision: revisionThrowingOnce(failure),
      onStatusChange: (status) => statuses.push(status),
    })
    session.dispatch(addFloor('Ground'))
    statuses.length = 0

    await expect(autosave.save()).rejects.toBe(failure)
    expect(statuses).toEqual(['error'])

    await autosave.save()
    expect(statuses).toEqual(['error', 'saved'])
    expect(await storedFloorCount(store)).toBe(1)
    autosave.dispose()
  })
})

describe('createAutosave after a failed save and after dispose', () => {
  it('the end of the delay starts no write after a save() whose write failed', async () => {
    const { session, store, autosave } = setUp()
    const save = vi.spyOn(store, 'save').mockRejectedValueOnce(new Error('disk full'))
    session.dispatch(addFloor('Ground'))

    await expect(autosave.save()).rejects.toThrow('disk full')
    await vi.advanceTimersByTimeAsync(DELAY_MS)

    expect(save).toHaveBeenCalledTimes(1)
    autosave.dispose()
  })

  it('save() after dispose() rejects', async () => {
    const { store, autosave } = setUp()
    const save = vi.spyOn(store, 'save')
    autosave.dispose()

    const outcome = await autosave.save().then(
      () => 'resolved',
      () => 'rejected',
    )

    expect(outcome).toBe('rejected')
    expect(save).not.toHaveBeenCalled()
  })

  it('save() after dispose() reports no status', async () => {
    const statuses: AutosaveStatus[] = []
    const { autosave } = setUp({ onStatusChange: (status) => statuses.push(status) })
    autosave.dispose()

    await autosave.save().catch(() => undefined)

    expect(statuses).toEqual([])
  })

  it('a write that runs when dispose() is called still reports saved and calls onSaved when it ends', async () => {
    const statuses: AutosaveStatus[] = []
    const onSaved = vi.fn()
    const { session, store, autosave } = setUp({
      revision: () => REVISION,
      onSaved,
      onStatusChange: (status) => statuses.push(status),
    })
    const gate = gateSaves(store)
    session.dispatch(addFloor('Ground'))
    await vi.advanceTimersByTimeAsync(DELAY_MS)
    expect(gate.started()).toBe(1)

    autosave.dispose()
    gate.endOldestSave()
    await settle()

    expect(statuses).toEqual(['pending', 'saved'])
    expect(onSaved).toHaveBeenCalledWith(REVISION)
  })
})
