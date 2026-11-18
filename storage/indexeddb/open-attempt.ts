import { FILES_STORE } from './indexeddb-requests'

/**
 * The message of a call whose open did not arrive in time. It holds whether or
 * not the browser reported a block, because the browser reports it only to the
 * first request that waits for the other connection.
 */
export const OPEN_HELD_UP_MESSAGE =
  'The storage did not open. Another tab of the app may hold it open with an older version. Close that tab and try again.'

/**
 * How long a call waits for an open request that is already pending, before it
 * rejects with {@link OPEN_HELD_UP_MESSAGE}. The browser finishes a held-back
 * request a few milliseconds after the other tab lets go, so a call made right
 * after that moment still gets its connection.
 */
export const PENDING_OPEN_WAIT_MILLISECONDS = 500

/** One open request of the browser. It cannot be cancelled, so it is kept until it ends. */
export interface OpenAttempt {
  /** Settles when the browser finishes the request. */
  result: Promise<IDBDatabase>
  /** Settles when the browser reports that another connection holds the upgrade up. Never rejects. */
  blocked: Promise<void>
}

/** Starts an open request that creates the files store when the database lacks it. */
export function startOpen(databaseName: string, version: number): OpenAttempt {
  const request = indexedDB.open(databaseName, version)
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(FILES_STORE)) {
      request.result.createObjectStore(FILES_STORE, { keyPath: 'path' })
    }
  }
  const blocked = new Promise<void>((resolve) => {
    request.onblocked = () => resolve()
  })
  const result = new Promise<IDBDatabase>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'))
  })
  return { result, blocked }
}

/** How long a call waits for an open request. */
export interface OpenWaits {
  /** The longest wait, counted from the call, whether or not the browser reports a block. */
  totalMilliseconds: number
  /** The longest wait after the browser reports a block, counted from that report. */
  afterBlockMilliseconds: number
}

/**
 * Resolves with the connection when the request finishes. Rejects with
 * {@link OPEN_HELD_UP_MESSAGE} when the request has not finished after
 * `waits.totalMilliseconds`, or after `waits.afterBlockMilliseconds` from the
 * block, whichever comes first. Both timers end when the request finishes or the
 * call rejects. The
 * request itself stays pending; a later call can wait for it again.
 */
export function waitForOpen(attempt: OpenAttempt, waits: OpenWaits): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const timers: ReturnType<typeof setTimeout>[] = []
    const endTimers = () => timers.forEach((timer) => clearTimeout(timer))
    const rejectHeldUp = () => {
      endTimers()
      reject(new Error(OPEN_HELD_UP_MESSAGE))
    }
    timers.push(setTimeout(rejectHeldUp, waits.totalMilliseconds))
    void attempt.blocked.then(() => {
      timers.push(setTimeout(rejectHeldUp, waits.afterBlockMilliseconds))
    })
    attempt.result.then(
      (database) => {
        endTimers()
        resolve(database)
      },
      (error: unknown) => {
        endTimers()
        reject(error instanceof Error ? error : new Error('Failed to open IndexedDB'))
      },
    )
  })
}
