import { describe, it, expect } from 'vitest'
import { createWriteQueue } from './write-queue'

/** Enough turns of the microtask queue for every chained promise in the queue to settle. */
const MICROTASK_TURNS = 20

async function flushMicrotasks(): Promise<void> {
  for (let turn = 0; turn < MICROTASK_TURNS; turn++) {
    await Promise.resolve()
  }
}

interface PendingSave {
  readonly state: string
  readonly end: (error?: Error) => void
}

/**
 * A store whose save stays pending until the test ends it. It records the state of each save,
 * the state it stored last, and the most saves that ran at the same time.
 */
function createStoreDouble() {
  const savedStates: string[] = []
  const pending: PendingSave[] = []
  let running = 0
  let mostRunningTogether = 0
  let stored: string | undefined

  function save(state: string): Promise<void> {
    savedStates.push(state)
    running += 1
    mostRunningTogether = Math.max(mostRunningTogether, running)
    return new Promise<void>((resolve, reject) => {
      pending.push({
        state,
        end: (error) => {
          running -= 1
          if (error) {
            reject(error)
            return
          }
          stored = state
          resolve()
        },
      })
    })
  }

  function endOldestSave(error?: Error): void {
    const next = pending.shift()
    if (!next) throw new Error('No save is pending')
    next.end(error)
  }

  return {
    save,
    endOldestSave,
    savedStates,
    stored: () => stored,
    mostRunningTogether: () => mostRunningTogether,
  }
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

/** A queue over a store double, with a present state the test edits and the write reads when it starts. */
function setUp() {
  const store = createStoreDouble()
  let presentState = 'initial'
  const queue = createWriteQueue(() => store.save(presentState))
  return {
    store,
    queue,
    edit: (state: string) => {
      presentState = state
    },
  }
}

describe('createWriteQueue', () => {
  it('starts a write before the request returns and resolves when that write ends', async () => {
    const { store, queue } = setUp()

    const outcome = follow(queue.request())

    expect(store.savedStates).toEqual(['initial'])
    await flushMicrotasks()
    expect(outcome().status).toBe('pending')

    store.endOldestSave()
    await flushMicrotasks()
    expect(outcome().status).toBe('resolved')
  })

  it('leaves the second state stored after two overlapping saves, with two writes at most', async () => {
    const { store, queue, edit } = setUp()

    edit('first')
    const first = queue.request()
    edit('second')
    const second = queue.request()

    store.endOldestSave()
    await flushMicrotasks()
    store.endOldestSave()
    await Promise.all([first, second])

    expect(store.stored()).toBe('second')
    expect(store.savedStates).toHaveLength(2)
  })

  it('gives one more write of the last state for three requests during one write', async () => {
    const { store, queue, edit } = setUp()
    const firstRequest = follow(queue.request())

    const duringWrite = ['one', 'two', 'three'].map((state) => {
      edit(state)
      return follow(queue.request())
    })
    await flushMicrotasks()
    expect(store.savedStates).toEqual(['initial'])

    store.endOldestSave()
    await flushMicrotasks()
    expect(firstRequest().status).toBe('resolved')
    expect(store.savedStates).toEqual(['initial', 'three'])
    expect(duringWrite.map((outcome) => outcome().status)).toEqual([
      'pending',
      'pending',
      'pending',
    ])

    store.endOldestSave()
    await flushMicrotasks()
    expect(duringWrite.map((outcome) => outcome().status)).toEqual([
      'resolved',
      'resolved',
      'resolved',
    ])
    expect(store.savedStates).toHaveLength(2)
  })

  it('a close during an in-flight write stores the last edit', async () => {
    const { store, queue, edit } = setUp()
    edit('early')
    queue.request()

    edit('last edit')
    const close = follow(queue.request())
    await flushMicrotasks()
    expect(close().status).toBe('pending')

    store.endOldestSave()
    await flushMicrotasks()
    expect(store.savedStates).toEqual(['early', 'last edit'])
    expect(close().status).toBe('pending')

    store.endOldestSave()
    await flushMicrotasks()
    expect(close().status).toBe('resolved')
    expect(store.stored()).toBe('last edit')
    expect(store.mostRunningTogether()).toBe(1)
  })

  it('reports a rejected write to its caller and still runs the next request', async () => {
    const { store, queue } = setUp()
    const failure = new Error('disk full')
    const failed = follow(queue.request())

    store.endOldestSave(failure)
    await flushMicrotasks()
    expect(failed()).toEqual({ status: 'rejected', error: failure })

    const later = follow(queue.request())
    expect(store.savedStates).toHaveLength(2)
    store.endOldestSave()
    await flushMicrotasks()
    expect(later().status).toBe('resolved')
  })

  it('keeps a waiting request when the write before it rejects, and gives it the result of its own write', async () => {
    const { store, queue, edit } = setUp()
    const failure = new Error('disk full')
    const failed = follow(queue.request())
    edit('waiting state')
    const waiting = follow(queue.request())

    store.endOldestSave(failure)
    await flushMicrotasks()
    expect(failed()).toEqual({ status: 'rejected', error: failure })
    expect(store.savedStates).toEqual(['initial', 'waiting state'])
    expect(waiting().status).toBe('pending')

    store.endOldestSave()
    await flushMicrotasks()
    expect(waiting().status).toBe('resolved')
    expect(store.stored()).toBe('waiting state')
  })

  it('never runs two saves at the same time across a sequence of overlapping requests', async () => {
    const { store, queue, edit } = setUp()
    const requests: Array<Promise<void>> = []

    requests.push(queue.request())
    edit('a')
    requests.push(queue.request())
    store.endOldestSave()
    await flushMicrotasks()
    edit('b')
    requests.push(queue.request())
    store.endOldestSave()
    await flushMicrotasks()
    store.endOldestSave()
    await Promise.all(requests)

    expect(store.mostRunningTogether()).toBe(1)
    expect(store.stored()).toBe('b')
  })
})
