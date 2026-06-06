import type { LockManagerPort } from './project-lock'

/**
 * LockManagerPort over navigator.locks. The Web Locks API only holds a lock for
 * the duration of a callback, so to model hold-until-release we keep the lock
 * callback alive with a promise that never settles until release() resolves its
 * stored resolver. This is the held-promise pattern: the unresolved inner
 * promise is what keeps the exclusive lock in our possession.
 */
export class WebLocksManager implements LockManagerPort {
  private readonly releasers = new Map<string, () => void>()

  tryAcquire(name: string): Promise<boolean> {
    return new Promise<boolean>((resolveOuter) => {
      void navigator.locks.request(name, { mode: 'exclusive', ifAvailable: true }, (lock) => {
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
      })
    })
  }

  async release(name: string): Promise<void> {
    const releaser = this.releasers.get(name)
    if (releaser !== undefined) {
      this.releasers.delete(name)
      releaser()
    }
  }
}
