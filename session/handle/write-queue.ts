/**
 * Orders the writes of one document so that they run one at a time and the last state wins.
 */
export interface WriteQueue {
  /**
   * Asks for a write of the present state. When no write runs, the write starts before this
   * call returns. When a write runs, one more write starts after it ends, however many
   * requests arrived in the meantime. The promise resolves when a write that started after
   * this request has ended, and it rejects with that write's error.
   */
  request(): Promise<void>
}

interface WaitingRequests {
  readonly promise: Promise<void>
  readonly resolve: () => void
  readonly reject: (error: unknown) => void
}

function createWaitingRequests(): WaitingRequests {
  let resolve: () => void = () => undefined
  let reject: (error: unknown) => void = () => undefined
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function callWrite(write: () => Promise<void>): Promise<void> {
  try {
    return write()
  } catch (error) {
    return Promise.reject(error)
  }
}

/**
 * Creates a queue around `write`. The write reads the present state itself when it starts, so
 * the one write that follows a running write stores the last state.
 */
export function createWriteQueue(write: () => Promise<void>): WriteQueue {
  let isWriting = false
  let waiting: WaitingRequests | null = null

  function startWrite(): Promise<void> {
    isWriting = true
    const outcome = callWrite(write)
    outcome.then(endWrite, endWrite)
    return outcome
  }

  function endWrite(): void {
    isWriting = false
    const next = waiting
    if (next === null) return
    waiting = null
    startWrite().then(next.resolve, next.reject)
  }

  return {
    request(): Promise<void> {
      if (!isWriting) return startWrite()
      waiting ??= createWaitingRequests()
      return waiting.promise
    },
  }
}
