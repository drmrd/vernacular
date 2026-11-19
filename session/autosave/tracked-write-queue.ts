import { createWriteQueue, type WriteQueue } from '../handle/write-queue'

/** The write queue of an autosave, which also knows the promise of the last write asked for. */
export interface TrackedWriteQueue extends WriteQueue {
  /** The promise of the last write asked for, while it has not settled; otherwise undefined. */
  latest(): Promise<void> | undefined
}

/**
 * A write queue around `write` that remembers the last write asked for until it settles. The queue
 * attaches a handler to each request promise to forget it, which marks that promise as handled: a
 * caller that drops a rejected request sees no unhandled-rejection warning.
 */
export function createTrackedWriteQueue(write: () => Promise<void>): TrackedWriteQueue {
  const queue = createWriteQueue(write)
  let latest: Promise<void> | undefined
  return {
    request() {
      const requested = queue.request()
      latest = requested
      const forget = (): void => {
        if (latest === requested) {
          latest = undefined
        }
      }
      requested.then(forget, forget)
      return requested
    },
    latest: () => latest,
  }
}
