import { decodeDocument } from '../../core'
import type { CodecOptions } from '../../core'
import { storedVersionOf, writeBackup } from '../documents/document-backups'
import type { DirectoryPort } from '../fs/directory-port'

/**
 * Moves each listed snapshot whose bytes do not decode into the project's backups. The backup is
 * written before the snapshot is removed, so a fault between the two leaves the bytes in both
 * places and never in neither. The first fault rejects and keeps the snapshot it hit.
 */
export async function setAsideRefusedSnapshots(
  directory: DirectoryPort,
  codec: CodecOptions,
  snapshotPaths: readonly string[],
): Promise<number> {
  let moved = 0
  for (const path of snapshotPaths) {
    const bytes = await directory.readFile(path)
    if (bytes === undefined) {
      continue
    }
    const decoded = decodeDocument(bytes, codec)
    if (decoded.ok) {
      continue
    }
    await writeBackup(directory, 'refused-snapshot', { version: storedVersionOf(decoded), bytes })
    await directory.removeFile(path)
    moved += 1
  }
  return moved
}
