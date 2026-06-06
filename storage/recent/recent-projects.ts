import type { RecentProjectEntry } from './recent-project-store'

function byLastOpenedDescending(first: RecentProjectEntry, second: RecentProjectEntry): number {
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
