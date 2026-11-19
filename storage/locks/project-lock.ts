import { isSecurityRefusal, WebLocksManager } from './web-locks-manager'

/** A lock that one tab holds on one project until release() is called. */
export interface ProjectLockHold {
  release(): Promise<void>
}

/** Per-project exclusive locks shared between the tabs of one browser. */
export interface ProjectLockPort {
  readonly supported: boolean
  /** The lock without waiting, or undefined when another holder has it. */
  tryAcquire(projectId: string): Promise<ProjectLockHold | undefined>
  /** Ids whose lock any tab holds, this one included. Empty when unsupported. */
  heldIds(): Promise<ReadonlySet<string>>
}

const LOCK_NAME_PREFIX = 'vernacular-project-'

/**
 * A hold whose release does its work once; every call returns the same
 * promise, so each caller waits until the lock is really free.
 */
function releasingOnce(release: () => Promise<void>): ProjectLockHold {
  let releasing: Promise<void> | undefined
  return {
    release: () => (releasing ??= release()),
  }
}

function lockNameFor(projectId: string): string {
  return `${LOCK_NAME_PREFIX}${projectId}`
}

/** A hold that locks nothing, for a browser with no lock API or one that refuses it. */
function holdLockingNothing(): ProjectLockHold {
  return releasingOnce(() => Promise.resolve())
}

/**
 * Project locks over navigator.locks. Where the API is missing, every
 * acquisition succeeds and no id is ever reported as held. A browser that has
 * the API but refuses a request or a query with a security error is treated the
 * same way: where the browser refuses the lock API it also refuses the shared
 * storage, so nothing shared needs a lock, and a project in memory must still
 * open. Any other failure of a request or a query fails it with the same error:
 * it says nothing about the storage, so a hold that locks nothing could let two
 * tabs take one project.
 */
export class WebLocksProjectLockPort implements ProjectLockPort {
  readonly supported: boolean
  private readonly manager = new WebLocksManager()

  constructor() {
    this.supported = typeof navigator !== 'undefined' && navigator.locks !== undefined
  }

  async tryAcquire(projectId: string): Promise<ProjectLockHold | undefined> {
    if (!this.supported) {
      return holdLockingNothing()
    }
    const name = lockNameFor(projectId)
    const outcome = await this.manager.tryAcquire(name)
    if (outcome === 'busy') {
      return undefined
    }
    if (outcome === 'refused') {
      return holdLockingNothing()
    }
    return releasingOnce(() => this.manager.release(name))
  }

  async heldIds(): Promise<ReadonlySet<string>> {
    if (!this.supported) {
      return new Set()
    }
    const { held } = await navigator.locks.query().catch((error: unknown) => {
      if (isSecurityRefusal(error)) {
        return { held: undefined }
      }
      throw error
    })
    const ids = (held ?? [])
      .map((lock) => lock.name ?? '')
      .filter((name) => name.startsWith(LOCK_NAME_PREFIX))
      .map((name) => name.slice(LOCK_NAME_PREFIX.length))
    return new Set(ids)
  }
}

/**
 * Project locks in memory. Two ports built on one registry behave like two
 * tabs; a port built with no registry has its own.
 */
export class InMemoryProjectLockPort implements ProjectLockPort {
  readonly supported = true

  constructor(private readonly registry: Set<string> = new Set()) {}

  tryAcquire(projectId: string): Promise<ProjectLockHold | undefined> {
    if (this.registry.has(projectId)) {
      return Promise.resolve(undefined)
    }
    this.registry.add(projectId)
    return Promise.resolve(
      releasingOnce(() => {
        this.registry.delete(projectId)
        return Promise.resolve()
      }),
    )
  }

  heldIds(): Promise<ReadonlySet<string>> {
    return Promise.resolve(new Set(this.registry))
  }
}
