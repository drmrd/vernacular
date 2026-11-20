import type { DirectoryPort } from '../fs/directory-port'

/**
 * The sidecar directory of a project that holds its backups. An export and an import leave it
 * out; only the unchecked copy of a project that did not open carries it.
 */
export const BACKUP_DIRECTORY = '.house-backups'

/** Why a copy of a stored file is kept. */
export type BackupKind = 'pre-migration' | 'last-valid'

const HEX_RADIX = 16
const HEX_BYTE_WIDTH = 2

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(HEX_RADIX).padStart(HEX_BYTE_WIDTH, '0'))
    .join('')
}

/** The bytes of a stored file and the schema version it was stored at. */
export interface StoredDocumentBytes {
  readonly version: number
  readonly bytes: Uint8Array
}

/**
 * Keeps a verbatim copy of stored bytes as `<kind>-v<version>-<digest>.json` in the backup
 * directory. The name carries the version the file was stored at and a digest of its bytes, so the
 * same bytes give one backup, different bytes give another, and a write never replaces a file.
 */
export async function writeBackup(
  directory: DirectoryPort,
  kind: BackupKind,
  stored: StoredDocumentBytes,
): Promise<void> {
  const digest = await sha256Hex(stored.bytes)
  const path = `${BACKUP_DIRECTORY}/${kind}-v${stored.version}-${digest}.json`
  if ((await directory.readFile(path)) === undefined) {
    await directory.writeFile(path, stored.bytes)
  }
}
