const ACTIVE_PROJECT_ID_KEY = 'vernacular.activeProjectId'
const PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/
const NEW_PROJECT_ID_PREFIX = 'project-'

export interface ActiveProjectIdStore {
  /** The remembered id, or undefined when nothing valid is remembered. Never rejects. */
  read(): Promise<string | undefined>
  /** Remember the id. Rejects when the write fails. */
  write(id: string): Promise<void>
}

/** Letters, digits, and hyphens; 1 to 64 characters; starts with a letter or digit. */
export function isValidProjectId(id: string): boolean {
  return PROJECT_ID_PATTERN.test(id)
}

/** `project-` and a random UUID, never one of `existing`. */
export function newProjectId(existing: readonly string[]): string {
  let candidate: string
  do {
    candidate = `${NEW_PROJECT_ID_PREFIX}${crypto.randomUUID()}`
  } while (existing.includes(candidate))
  return candidate
}

export class InMemoryActiveProjectIdStore implements ActiveProjectIdStore {
  private remembered: string | undefined

  read(): Promise<string | undefined> {
    return Promise.resolve(this.remembered)
  }

  write(id: string): Promise<void> {
    this.remembered = id
    return Promise.resolve()
  }
}

export class LocalStorageActiveProjectIdStore implements ActiveProjectIdStore {
  read(): Promise<string | undefined> {
    try {
      const stored = localStorage.getItem(ACTIVE_PROJECT_ID_KEY)
      return Promise.resolve(stored !== null && isValidProjectId(stored) ? stored : undefined)
    } catch {
      return Promise.resolve(undefined)
    }
  }

  write(id: string): Promise<void> {
    // No validation: callers pass ids from newProjectId or a store listing, and read guards against a damaged value.
    try {
      localStorage.setItem(ACTIVE_PROJECT_ID_KEY, id)
      return Promise.resolve()
    } catch (error) {
      return Promise.reject(error)
    }
  }
}
