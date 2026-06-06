import { describe, expect, it } from 'vitest'
import { createProjectLock, type LockManagerPort } from './project-lock'

/**
 * In-test fake that simulates a single underlying lock manager shared by
 * multiple tabs. Held lock names live in one Set, so a second acquirer of an
 * already-held name fails to acquire without waiting, just as the exclusive
 * Web Locks API would behave across two tabs.
 */
function sharedLockManager(): LockManagerPort {
  const held = new Set<string>()
  return {
    tryAcquire(name: string): Promise<boolean> {
      if (held.has(name)) {
        return Promise.resolve(false)
      }
      held.add(name)
      return Promise.resolve(true)
    },
    release(name: string): Promise<void> {
      held.delete(name)
      return Promise.resolve()
    },
  }
}

describe('createProjectLock', () => {
  it('reports the first acquirer of a project as the owner', async () => {
    const lock = createProjectLock(sharedLockManager())

    await expect(lock.acquire('house')).resolves.toBe('owner')
  })

  it('reports a second acquirer of a held project as read-only', async () => {
    const manager = sharedLockManager()
    const firstTab = createProjectLock(manager)
    const secondTab = createProjectLock(manager)

    await firstTab.acquire('house')

    await expect(secondTab.acquire('house')).resolves.toBe('read-only')
  })

  it('lets a project be re-acquired as owner once the holder releases it', async () => {
    const manager = sharedLockManager()
    const firstTab = createProjectLock(manager)
    const secondTab = createProjectLock(manager)

    await firstTab.acquire('house')
    await firstTab.release('house')

    await expect(secondTab.acquire('house')).resolves.toBe('owner')
  })

  it('does not contend across distinct project ids', async () => {
    const manager = sharedLockManager()
    const firstTab = createProjectLock(manager)
    const secondTab = createProjectLock(manager)

    await firstTab.acquire('house')

    await expect(secondTab.acquire('garage')).resolves.toBe('owner')
  })
})
