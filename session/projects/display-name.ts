import type { ProjectRecord } from '../../storage'

/** The name shown for a project whose record holds none, as after a read that found no name. */
export const UNNAMED_PROJECT = 'Unnamed project'

/** The name to show for a record: its name, or the placeholder when it has none. */
export function displayNameOf(record: ProjectRecord): string {
  return record.name ?? UNNAMED_PROJECT
}
