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

/** A write for a store double: runs the effect, then resolves what a save with nothing to report gives. */
function savedAfter(effect: () => unknown): () => Promise<{ faults: never[]; backedUp: boolean }> {
  return async () => {
    effect()
    return { faults: [], backedUp: false }
  }
}

/** Snapshot doubles that record their calls in `order`. */
function recordingSnapshots(order: string[]) {
  return {
    writeSnapshot: vi.fn().mockImplementation(async () => {
      order.push('writeSnapshot')
    }),
    prune: vi.fn().mockImplementation(async () => {
      order.push('prune')
    }),
  }
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

type Outcome =
  | { status: 'pending' }
  | { status: 'resolved' }
  | { status: 'rejected'; error: unknown }

/** Follows a promise so a test can ask, without timers, whether it has settled yet. */
function follow(promise: Promise<void>): () => Outcome {
  let outcome: Outcome = { status: 'pending' }
  promise.then(
    () => {
      outcome = { status: 'resolved' }
    },
    (error: unknown) => {
      outcome = { status: 'rejected', error }
    },
  )
  return () => outcome
}

describe('createAutosave writing a project', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('writes ahead to a snapshot, then saves canonically, then prunes in order', async () => {
    const order: string[] = []
    const snapshots = recordingSnapshots(order)
    const statuses: string[] = []
    const { session, store, autosave } = setUp({
      snapshots,
      onStatusChange: (status) => statuses.push(status),
    })
    const saveSpy = vi.spyOn(store, 'save').mockImplementation(savedAfter(() => order.push('save')))

    session.dispatch(addFloor('Ground'))
    expect(statuses).toEqual(['pending'])

    await vi.advanceTimersByTimeAsync(DELAY_MS)

    expect(snapshots.writeSnapshot).toHaveBeenCalledTimes(1)
    expect(snapshots.writeSnapshot).toHaveBeenCalledWith(session.getProject())
    expect(saveSpy).toHaveBeenCalledTimes(1)
    expect(saveSpy).toHaveBeenCalledWith(PROJECT_ID, session.getProject())
    expect(snapshots.prune).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['writeSnapshot', 'save', 'prune'])
    expect(statuses).toEqual(['pending', 'saved'])

    autosave.dispose()
  })

  it('leaves the latest edit in the canonical store after a write-ahead cycle', async () => {
    const snapshots = {
      writeSnapshot: vi.fn().mockResolvedValue(undefined),
      prune: vi.fn().mockResolvedValue(undefined),
    }
    const { session, store, autosave } = setUp({ snapshots })

    session.dispatch(addFloor('Ground'))
    await vi.advanceTimersByTimeAsync(DELAY_MS)

    expect(await storedFloorCount(store)).toBe(1)

    autosave.dispose()
  })

  it('keeps the snapshot without pruning and reports error when the canonical save fails', async () => {
    const order: string[] = []
    const snapshots = recordingSnapshots(order)
    const statuses: string[] = []
    const { session, store, autosave } = setUp({
      snapshots,
      onStatusChange: (status) => statuses.push(status),
    })
    const saveSpy = vi.spyOn(store, 'save').mockImplementation(async () => {
      order.push('save')
      throw new Error('disk full')
    })

    session.dispatch(addFloor('Ground'))
    await vi.advanceTimersByTimeAsync(DELAY_MS)

    expect(snapshots.writeSnapshot).toHaveBeenCalledTimes(1)
    expect(saveSpy).toHaveBeenCalledTimes(1)
    expect(snapshots.prune).not.toHaveBeenCalled()
    expect(order).toEqual(['writeSnapshot', 'save'])
    expect(statuses).toEqual(['pending', 'error'])

    autosave.dispose()
  })

  it('reports the saved revision once after a successful save', async () => {
    const onSaved = vi.fn()
    const { session, autosave } = setUp({ revision: () => 7, onSaved })

    session.dispatch(addFloor('Ground'))
    await vi.advanceTimersByTimeAsync(DELAY_MS)

    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(onSaved).toHaveBeenCalledWith(7)

    autosave.dispose()
  })

  it('reports the revision captured at persist start, not one bumped during the write', async () => {
    const onSaved = vi.fn()
    let rev = 1
    const { session, store, autosave } = setUp({ revision: () => rev, onSaved })
    vi.spyOn(store, 'save').mockImplementation(
      savedAfter(() => {
        rev = 2
      }),
    )

    session.dispatch(addFloor('Ground'))
    await vi.advanceTimersByTimeAsync(DELAY_MS)

    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(onSaved).toHaveBeenCalledWith(1)

    autosave.dispose()
  })

  it('does not report a saved revision when the canonical save fails', async () => {
    const onSaved = vi.fn()
    const statuses: string[] = []
    const { session, store, autosave } = setUp({
      revision: () => 3,
      onSaved,
      onStatusChange: (status) => statuses.push(status),
    })
    vi.spyOn(store, 'save').mockImplementation(async () => {
      throw new Error('disk full')
    })

    session.dispatch(addFloor('Ground'))
    await vi.advanceTimersByTimeAsync(DELAY_MS)

    expect(onSaved).not.toHaveBeenCalled()
    expect(statuses).toEqual(['pending', 'error'])

    autosave.dispose()
  })
})

describe('createAutosave and a prune that rejects', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('a prune that rejects leaves the write succeeded and is logged once', async () => {
    const failure = new Error('the prune failed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const snapshots = {
      writeSnapshot: vi.fn().mockResolvedValue(undefined),
      prune: vi.fn().mockRejectedValue(failure),
    }
    const statuses: string[] = []
    const { session, autosave } = setUp({
      snapshots,
      onStatusChange: (status) => statuses.push(status),
    })
    session.dispatch(addFloor('Ground'))

    await expect(autosave.save()).resolves.toBeUndefined()

    expect(statuses).toEqual(['pending', 'saved'])
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleError.mock.calls.flat()).toContain(failure)

    autosave.dispose()
  })
})

describe('createAutosave writing through one queue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('a delay that ends during a running write gives one more write after it, and no two saves run together', async () => {
    const { session, store, autosave } = setUp()
    const gate = gateSaves(store)
    session.dispatch(addFloor('Ground'))
    await vi.advanceTimersByTimeAsync(DELAY_MS)
    session.dispatch(addFloor('Upper'))
    await vi.advanceTimersByTimeAsync(DELAY_MS)
    await settle()
    expect(gate.started()).toBe(1)

    gate.endOldestSave()
    await settle()
    expect(gate.started()).toBe(2)
    gate.endOldestSave()
    await settle()

    expect(gate.mostRunningTogether()).toBe(1)
    expect(await storedFloorCount(store)).toBe(2)

    autosave.dispose()
  })

  it('a write that waited reports the revision read when it started, not when it was asked for', async () => {
    const onSaved = vi.fn()
    let revision = 1
    const { session, store, autosave } = setUp({ revision: () => revision, onSaved })
    const gate = gateSaves(store)
    session.dispatch(addFloor('Ground'))
    await vi.advanceTimersByTimeAsync(DELAY_MS)
    revision = 2
    session.dispatch(addFloor('Upper'))
    await vi.advanceTimersByTimeAsync(DELAY_MS)
    revision = 3
    session.dispatch(addFloor('Attic'))

    gate.endOldestSave()
    await settle()
    gate.endOldestSave()
    await settle()
    await vi.advanceTimersByTimeAsync(DELAY_MS)

    expect(onSaved.mock.calls).toEqual([[1], [3]])
    expect(gate.started()).toBe(2)

    autosave.dispose()
  })

  it('reports saved only when no change arrived since the write started', async () => {
    const statuses: string[] = []
    const { session, store, autosave } = setUp({
      onStatusChange: (status) => statuses.push(status),
    })
    const gate = gateSaves(store)
    session.dispatch(addFloor('Ground'))
    await vi.advanceTimersByTimeAsync(DELAY_MS)
    session.dispatch(addFloor('Upper'))

    gate.endOldestSave()
    await settle()
    expect(statuses).toEqual(['pending', 'pending'])

    await vi.advanceTimersByTimeAsync(DELAY_MS)
    gate.endOldestSave()
    await settle()
    expect(statuses).toEqual(['pending', 'pending', 'saved'])

    autosave.dispose()
  })

  it('a write that waits when dispose is called never starts', async () => {
    const { session, store, autosave } = setUp()
    const gate = gateSaves(store)
    session.dispatch(addFloor('Ground'))
    await vi.advanceTimersByTimeAsync(DELAY_MS)
    session.dispatch(addFloor('Upper'))
    await vi.advanceTimersByTimeAsync(DELAY_MS)

    autosave.dispose()
    gate.endOldestSave()
    await settle()

    expect(gate.started()).toBe(1)
  })

  it('save() during a running write resolves after the write that follows it', async () => {
    const { session, store, autosave } = setUp()
    const gate = gateSaves(store)
    session.dispatch(addFloor('Ground'))
    await vi.advanceTimersByTimeAsync(DELAY_MS)

    const saving = follow(autosave.save())
    gate.endOldestSave()
    await settle()
    expect(gate.started()).toBe(2)
    expect(saving().status).toBe('pending')

    gate.endOldestSave()
    await settle()
    expect(saving().status).toBe('resolved')

    autosave.dispose()
  })

  it('save() rejects with the error of its write, and the next write still runs', async () => {
    const { session, store, autosave } = setUp()
    const failure = new Error('disk full')
    vi.spyOn(store, 'save').mockRejectedValueOnce(failure)
    session.dispatch(addFloor('Ground'))

    await expect(autosave.save()).rejects.toBe(failure)
    await autosave.save()

    expect(await storedFloorCount(store)).toBe(1)

    autosave.dispose()
  })
})
