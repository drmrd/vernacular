import { describe, it, expect } from 'vitest'
import { createWriteQueue } from './write-queue'

/** Enough turns of the microtask queue for every chained promise in the queue to settle. */
const MICROTASK_TURNS = 20

async function flushMicrotasks(): Promise<void> {
  for (let turn = 0; turn < MICROTASK_TURNS; turn++) {
    await Promise.resolve()
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

/**
 * A write that stays pending until the test ends it. The write may throw at once on the calls
 * named in `throwOnCalls`. It counts how many writes started.
 */
function createWriteDouble(throwOnCalls: ReadonlyMap<number, Error> = new Map()) {
  const pending: Array<(error?: Error) => void> = []
  let started = 0

  function write(): Promise<void> {
    started += 1
    const immediate = throwOnCalls.get(started)
    if (immediate) throw immediate
    return new Promise<void>((resolve, reject) => {
      pending.push((error) => (error ? reject(error) : resolve()))
    })
  }

  function endOldestWrite(error?: Error): void {
    const end = pending.shift()
    if (!end) throw new Error('No write is pending')
    end(error)
  }

  return { write, endOldestWrite, started: () => started }
}

describe('createWriteQueue when a write fails', () => {
  it('treats a write that throws at once as a rejected write and still runs the next request', async () => {
    const failure = new Error('store is closed')
    const double = createWriteDouble(new Map([[1, failure]]))
    const queue = createWriteQueue(double.write)

    const failed = follow(queue.request())
    await flushMicrotasks()
    expect(failed()).toEqual({ status: 'rejected', error: failure })

    const later = follow(queue.request())
    expect(double.started()).toBe(2)
    double.endOldestWrite()
    await flushMicrotasks()
    expect(later().status).toBe('resolved')
  })

  it('rejects every waiting request with the error of the write that served them', async () => {
    const double = createWriteDouble()
    const queue = createWriteQueue(double.write)
    const errorA = new Error('first write failed')
    const errorB = new Error('second write failed')
    const first = follow(queue.request())
    const waitingOne = follow(queue.request())
    const waitingTwo = follow(queue.request())

    double.endOldestWrite(errorA)
    await flushMicrotasks()
    expect(first()).toEqual({ status: 'rejected', error: errorA })
    expect(double.started()).toBe(2)

    double.endOldestWrite(errorB)
    await flushMicrotasks()
    expect(waitingOne()).toEqual({ status: 'rejected', error: errorB })
    expect(waitingTwo()).toEqual({ status: 'rejected', error: errorB })

    const later = follow(queue.request())
    expect(double.started()).toBe(3)
    double.endOldestWrite()
    await flushMicrotasks()
    expect(later().status).toBe('resolved')
  })
})
