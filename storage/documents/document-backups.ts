import { CURRENT_SCHEMA_VERSION } from '../../core'
import type { DecodeFailure, DecodeResult, GraftDropped } from '../../core'
import type { DirectoryPort } from '../fs/directory-port'

/**
 * The sidecar directory of a project that holds its backups. An export and an import leave it
 * out; only the unchecked copy of a project that did not open carries it.
 */
export const BACKUP_DIRECTORY = '.house-backups'

/** Why a copy of a stored file is kept. */
export type BackupKind =
  | 'pre-migration'
  | 'last-valid'
  | 'pre-repair'
  | 'refused-snapshot'
  | 'unreadable-previous'
  | 'replaced-by-second-file'
  | 'set-aside-second-file'

/** The version of bytes that carry no readable schema version. */
const UNKNOWN_VERSION = 0
const HEX_RADIX = 16
const HEX_BYTE_WIDTH = 2

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
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

/**
 * Copies the previous file of a save to the backups when the encode could not read it, so the
 * save replaces no bytes that it cannot read without a copy. Does nothing for a readable file.
 */
export async function keepUnreadablePrevious(
  directory: DirectoryPort,
  previous: Uint8Array | undefined,
  graftDropped: GraftDropped | undefined,
): Promise<void> {
  if (previous === undefined || graftDropped === undefined) return
  const version = versionOfFailure(graftDropped)
  await writeBackup(directory, 'unreadable-previous', { version, bytes: previous })
}

/** The schema version to name a backup by, from the decode of the bytes it holds. */
export function storedVersionOf(decoded: DecodeResult): number {
  if (decoded.ok) {
    return decoded.value.migratedFrom ?? CURRENT_SCHEMA_VERSION
  }
  return versionOfFailure(decoded.failure)
}

/** The schema version that bytes failed to decode at; unknown when they carry none. */
function versionOfFailure(failure: DecodeFailure): number {
  switch (failure.kind) {
    case 'format-rules':
      return failure.migratedFrom ?? CURRENT_SCHEMA_VERSION
    case 'newer-version':
      return failure.version
    case 'migration-failed':
      return failure.fromVersion
    case 'not-json':
    case 'not-a-project':
      return UNKNOWN_VERSION
  }
}
