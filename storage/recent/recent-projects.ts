import type { RecentProjectEntry, ProjectBackend } from './recent-project-store'

export interface RecentEntryInput {
  id: string
  name: string
  backend: ProjectBackend
  /** Injected for determinism; the app passes Date.now() at the call site, not here. */
  openedAt: number
}

/** Build the upsert entry recorded when a project is opened or saved. */
export function recentEntryFor(input: RecentEntryInput): RecentProjectEntry {
  return {
    id: input.id,
    name: input.name,
    backend: input.backend,
    lastOpened: input.openedAt,
  }
}

export function byLastOpenedDescending(
  first: RecentProjectEntry,
  second: RecentProjectEntry,
): number {
  return second.lastOpened - first.lastOpened
}

/** Most-recently-opened first, de-duplicated by id (newest occurrence wins). */
export function orderRecentProjects(entries: readonly RecentProjectEntry[]): RecentProjectEntry[] {
  const newestById = new Map<string, RecentProjectEntry>()

  for (const entry of entries) {
    const existing = newestById.get(entry.id)
    if (existing === undefined || entry.lastOpened > existing.lastOpened) {
      newestById.set(entry.id, entry)
    }
  }

  return [...newestById.values()].sort(byLastOpenedDescending)
}
