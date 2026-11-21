// Test support shared by the snapshot set-aside tests.
import { createHash } from 'node:crypto'
import { InMemoryDirectory } from '../fs/in-memory-directory'

export const AUTOSAVE_DIRECTORY = '.house-autosave'
export const BACKUP_DIRECTORY = '.house-backups'
export const NOT_A_PROJECT_VERSION = 0

/** Bytes that do not parse as JSON; the label varies them so each call can differ. */
export function notJson(label = 'this is'): Uint8Array {
  return new TextEncoder().encode(`{"${label}": not json`)
}

/** An in-memory directory that already holds the given files. */
export async function holding(files: Record<string, Uint8Array>): Promise<InMemoryDirectory> {
  const directory = new InMemoryDirectory()
  for (const [path, bytes] of Object.entries(files)) await directory.writeFile(path, bytes)
  return directory
}

/** The file name the store gives the backup of a refused snapshot. */
export function backupNameOf(version: number, bytes: Uint8Array): string {
  const digest = createHash('sha256').update(bytes).digest('hex')
  return `refused-snapshot-v${version}-${digest}.json`
}

/** The path of the backup of a refused snapshot, under the backup directory. */
export function backupPathOf(version: number, bytes: Uint8Array): string {
  return `${BACKUP_DIRECTORY}/${backupNameOf(version, bytes)}`
}
