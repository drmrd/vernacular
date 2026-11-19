/** What the manager keeps for one granted lock, from acquire until release. */
interface LockHold {
  /** Settles the held promise so the lock can be freed. */
  free: () => void
  /** Settles once the lock has really been freed. */
  whenFreed: () => Promise<void>
}

/**
 * Exclusive named locks over navigator.locks, held until released. The Web
 * Locks API only holds a lock for the duration of a callback, so to model
 * hold-until-release we keep the lock callback alive with a promise that never
 * settles until release() resolves its stored resolver. This is the
 * held-promise pattern: the unsettled inner promise is what keeps the exclusive
 * lock in our possession. A record of that resolver is kept for each granted
 * lock, and only for a granted one.
 *
 * release() also awaits the original request promise, which settles only once the
 * lock has actually been freed. Without that wait, an immediate re-acquire can
 * still observe the lock as held: Firefox frees the lock a task later than
 * Chromium, so resolving the held promise is not enough on its own.
 */
export class WebLocksManager {
  private readonly holds = new Map<string, LockHold>()

  /** Resolve true if the exclusive lock named `name` was acquired without waiting. */
  tryAcquire(name: string): Promise<boolean> {
    return new Promise<boolean>((resolveOuter) => {
      // Assigned below once the request exists; the hold reads it only at release.
      let freed: Promise<void> = Promise.resolve()
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
          // resolver lets release() free the lock on demand. Only a granted
          // lock is stored, so a failed attempt never replaces the holder.
          return new Promise<void>((free) => {
            this.holds.set(name, { free, whenFreed: () => freed })
          })
        },
      )
      freed = request.then(() => undefined)
    })
  }

  async release(name: string): Promise<void> {
    const hold = this.holds.get(name)
    if (hold === undefined) {
      return
    }
    this.holds.delete(name)
    hold.free()
    await hold.whenFreed()
  }
}
