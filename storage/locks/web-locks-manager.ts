import type { LockManagerPort } from './project-lock'

/**
 * LockManagerPort over navigator.locks. The Web Locks API only holds a lock for
 * the duration of a callback, so to model hold-until-release we keep the lock
 * callback alive with a promise that never settles until release() resolves its
 * stored resolver. This is the held-promise pattern: the unsettled inner promise
 * is what keeps the exclusive lock in our possession.
 *
 * release() also awaits the original request promise, which settles only once the
 * lock has actually been freed. Without that wait, an immediate re-acquire can
 * still observe the lock as held: Firefox frees the lock a task later than
 * Chromium, so resolving the held promise is not enough on its own.
 */
export class WebLocksManager implements LockManagerPort {
  private readonly releasers = new Map<string, () => void>()
  private readonly requests = new Map<string, Promise<void>>()

  tryAcquire(name: string): Promise<boolean> {
    return new Promise<boolean>((resolveOuter) => {
      const request = navigator.locks.request(
        name,
        { mode: 'exclusive', ifAvailable: true },
        (lock) => {
          if (lock === null) {
            resolveOuter(false)
            return undefined
          }
          resolveOuter(true)
          // Returning an unsettled promise keeps the lock held; storing its
          // resolver lets release() free the lock on demand.
          return new Promise<void>((release) => {
            this.releasers.set(name, release)
          })
        },
      )
      this.requests.set(
        name,
        request.then(() => undefined),
      )
    })
  }

  async release(name: string): Promise<void> {
    const releaser = this.releasers.get(name)
    if (releaser === undefined) {
      return
    }
    this.releasers.delete(name)
    releaser()
    const request = this.requests.get(name)
    this.requests.delete(name)
    if (request !== undefined) {
      await request
    }
  }
}
