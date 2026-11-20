import { BACKUP_DIRECTORY } from '../documents/document-backups'
import { AUTOSAVE_DIRECTORY } from '../snapshots/snapshot-store'

const SIDECAR_DIRECTORIES = [BACKUP_DIRECTORY, AUTOSAVE_DIRECTORY]

/** Whether the path lies in a sidecar directory (the backups or the recovery snapshots). */
export function isSidecarPath(path: string): boolean {
  return SIDECAR_DIRECTORIES.some((directory) => path.startsWith(`${directory}/`))
}
