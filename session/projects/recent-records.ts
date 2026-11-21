import type { ProjectRecord } from '../../storage'

/**
 * Orders records by their time of use, latest first. A record with no time of use comes after
 * every record with one, and equal times order by id. The times are ISO strings of one form, so
 * they order as text.
 */
export function compareUse(first: ProjectRecord, second: ProjectRecord): number {
  const firstUse = first.lastUsedAt
  const secondUse = second.lastUsedAt
  if (firstUse !== secondUse) {
    if (firstUse === undefined) return 1
    if (secondUse === undefined) return -1
    return firstUse < secondUse ? 1 : -1
  }
  if (first.id === second.id) return 0
  return first.id < second.id ? -1 : 1
}

/** How many records the recent list gives at most. */
const RECENT_RECORD_LIMIT = 5

/**
 * The records used last, latest first, at most `RECENT_RECORD_LIMIT`, without the record of
 * `openId`. Folder records and records of projects that did not open are listed like the others.
 * The given list is not changed.
 */
export function recentRecords(records: readonly ProjectRecord[], openId?: string): ProjectRecord[] {
  const others = records.filter((record) => record.id !== openId)
  return others.sort(compareUse).slice(0, RECENT_RECORD_LIMIT)
}
