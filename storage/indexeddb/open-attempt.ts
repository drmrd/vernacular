import { FILES_STORE } from './indexeddb-requests'

/** The message of a call that the storage of another tab holds up. */
export const BLOCKED_MESSAGE =
  'Another tab holds the storage open with an older version of the app. Close that tab and try again.'

/**
 * How long a call waits for an open request that the browser holds back, before
 * it rejects with {@link BLOCKED_MESSAGE}. The browser finishes that request a
 * few milliseconds after the other tab lets go, so a call made right after
 * that moment still gets its connection.
 */
export const BLOCKED_OPEN_WAIT_MILLISECONDS = 500

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

/**
 * Resolves with the connection when the request finishes. When the request is
 * blocked, rejects with {@link BLOCKED_MESSAGE} once `graceMilliseconds` have
 * passed since the block, unless the request finishes first. The request itself
 * stays pending; a later call can wait for it again.
 */
export function waitForOpen(attempt: OpenAttempt, graceMilliseconds: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    void attempt.blocked.then(() => {
      timer = setTimeout(() => reject(new Error(BLOCKED_MESSAGE)), graceMilliseconds)
    })
    attempt.result.then(
      (database) => {
        clearTimeout(timer)
        resolve(database)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error('Failed to open IndexedDB'))
      },
    )
  })
}
