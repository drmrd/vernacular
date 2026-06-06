/** Subset of the Web Locks API we depend on; tests inject a fake. */
export interface LockManagerPort {
  /** Resolve true if the exclusive lock named `name` was acquired without waiting. */
  tryAcquire(name: string): Promise<boolean>
  release(name: string): Promise<void>
}

export type LockOutcome = 'owner' | 'read-only'

export interface ProjectLock {
  /** Owner when the lock was free, read-only when another holder has it. */
  acquire(projectId: string): Promise<LockOutcome>
  release(projectId: string): Promise<void>
}

const LOCK_NAME_PREFIX = 'vernacular-project-'

function lockNameFor(projectId: string): string {
  return `${LOCK_NAME_PREFIX}${projectId}`
}

export function createProjectLock(manager: LockManagerPort): ProjectLock {
  return {
    async acquire(projectId) {
      return (await manager.tryAcquire(lockNameFor(projectId))) ? 'owner' : 'read-only'
    },
    async release(projectId) {
      await manager.release(lockNameFor(projectId))
    },
  }
}
