import type { ProjectSnapshots } from '../../storage'

/**
 * What setting aside the recovery copies that cannot be read came to: no such copy, some moved to
 * the project's backups, or a backup that could not be written.
 */
export type SetAsideOutcome = 'none' | 'kept' | 'failed'

/**
 * Moves each recovery copy that does not decode to the project's backups. A failure goes to the
 * console once and is reported as `failed`. It never rejects.
 */
export async function setAsideRefusedCopies(snapshots: ProjectSnapshots): Promise<SetAsideOutcome> {
  try {
    const moved = await snapshots.setAsideRefused()
    return moved > 0 ? 'kept' : 'none'
  } catch (error) {
    console.error(error)
    return 'failed'
  }
}
