import type { ProjectRecord } from '../../storage'

/**
 * Orders records by their time of use, latest first. A record with no time of use comes after
 * every record with one, and equal times order by id. The times are ISO strings of one form, so
 * they order as text.
 */
function compareUse(first: ProjectRecord, second: ProjectRecord): number {
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

/** The workspace record with the latest use; undefined when there is none. */
export function latestWorkspaceRecord(
  records: readonly ProjectRecord[],
): ProjectRecord | undefined {
  const workspaceRecords = records.filter((record) => record.location.kind === 'workspace')
  return workspaceRecords.sort(compareUse)[0]
}
