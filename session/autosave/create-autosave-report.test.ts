import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createAutosave } from './create-autosave'
import type { AutosaveConfig } from './create-autosave'
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

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.useFakeTimers()
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('the onReport callback of createAutosave', () => {
  it('onReport is called once with the report of the store save', async () => {
    const onReport = vi.fn()
    const { session, store, autosave } = setUp({ onReport })
    const save = vi.spyOn(store, 'save')
    session.dispatch(addFloor('Ground'))

    await autosave.save()

    expect(onReport).toHaveBeenCalledTimes(1)
    expect(onReport).toHaveBeenCalledWith(await save.mock.results[0]?.value)
    autosave.dispose()
  })

  it('with snapshots, onReport is called after the snapshot is written and before the prune', async () => {
    const order: string[] = []
    const { session, autosave } = setUp({
      snapshots: recordingSnapshots(order),
      onReport: () => order.push('onReport'),
    })
    session.dispatch(addFloor('Ground'))

    await autosave.save()

    expect(order).toEqual(['writeSnapshot', 'onReport', 'prune'])
    autosave.dispose()
  })

  it('an onReport that throws does not change the write, and the error is logged once', async () => {
    const failure = new Error('onReport failed')
    const { session, store, autosave } = setUp({
      onReport: () => {
        throw failure
      },
    })
    session.dispatch(addFloor('Ground'))

    await expect(autosave.save()).resolves.toBeUndefined()

    const read = await store.read(PROJECT_ID)
    expect(read.ok && read.value.project.floors.length).toBe(1)
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleError.mock.calls.flat()).toContain(failure)
    autosave.dispose()
  })
})
