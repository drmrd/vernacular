export type ProjectBackend = 'opfs' | 'file-system-folder' | 'zip-bundle'

export interface RecentProjectEntry {
  id: string
  name: string
  backend: ProjectBackend
  lastOpened: number
}

export interface RecentProjectStore {
  /** Most-recently-opened first. */
  list(): Promise<RecentProjectEntry[]>
  /** Insert or update by id (upsert), refreshing the stored entry. */
  record(entry: RecentProjectEntry): Promise<void>
  remove(id: string): Promise<void>
}

/**
 * Map-backed reference implementation for tests and the not-yet-wired shell.
 * Entries are cloned on record and on list so callers cannot mutate stored
 * state by holding a reference (the clone-on-save ethos from ADR-0003).
 */
export class InMemoryRecentProjectStore implements RecentProjectStore {
  private readonly entries = new Map<string, RecentProjectEntry>()

  async list(): Promise<RecentProjectEntry[]> {
    return [...this.entries.values()]
      .sort((first, second) => second.lastOpened - first.lastOpened)
      .map((entry) => ({ ...entry }))
  }

  async record(entry: RecentProjectEntry): Promise<void> {
    this.entries.set(entry.id, { ...entry })
  }

  async remove(id: string): Promise<void> {
    this.entries.delete(id)
  }
}
