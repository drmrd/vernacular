import { WebLocksManager } from './web-locks-manager'

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

function lockNameFor(projectId: string): string {
  return `${LOCK_NAME_PREFIX}${projectId}`
}

/**
 * Project locks over navigator.locks. Where the API is missing, every
 * acquisition succeeds and no id is ever reported as held.
 */
export class WebLocksProjectLockPort implements ProjectLockPort {
  readonly supported: boolean
  private readonly manager = new WebLocksManager()

  constructor() {
    this.supported = typeof navigator !== 'undefined' && navigator.locks !== undefined
  }

  async tryAcquire(projectId: string): Promise<ProjectLockHold | undefined> {
    if (!this.supported) {
      return { release: () => Promise.resolve() }
    }
    const name = lockNameFor(projectId)
    if (!(await this.manager.tryAcquire(name))) {
      return undefined
    }
    return { release: () => this.manager.release(name) }
  }

  async heldIds(): Promise<ReadonlySet<string>> {
    if (!this.supported) {
      return new Set()
    }
    const { held } = await navigator.locks.query()
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
    return Promise.resolve({
      release: () => {
        this.registry.delete(projectId)
        return Promise.resolve()
      },
    })
  }

  heldIds(): Promise<ReadonlySet<string>> {
    return Promise.resolve(new Set(this.registry))
  }
}
