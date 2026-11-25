import { decodeDocument, encodeDocument } from '../../core'
import type { CodecOptions, Project } from '../../core'
import type { DirectoryPort } from '../fs/directory-port'
import { PROJECT_FILE } from '../project-files/project-file-name'
import { ProjectNotFoundError } from '../project-store'
import { storedVersionOf, writeBackup } from './document-backups'
import type { ReplaceReport } from './document-store'

/** What a replace works on: the stored project, and how to copy the assets the new document needs. */
export interface ReplaceTarget {
  readonly id: string
  readonly directory: DirectoryPort
  readonly options?: CodecOptions
  readonly prepareAssets: (project: Project) => Promise<void>
}

/**
 * Replaces the stored document with the project. The project is encoded with no previous document,
 * so data that only the stored document held is not carried over. The steps run in this order, and
 * a failed step stops the ones after it: read the stored bytes, encode, stop when the result breaks
 * the format rules, work out the backup version, prepare the assets, keep the stored bytes as a
 * backup, write the document. Assets copied before a later failure stay, as for a save.
 */
export async function replaceStoredDocument(
  target: ReplaceTarget,
  project: Project,
): Promise<ReplaceReport> {
  const { id, directory, options } = target
  const stored = await directory.readFile(PROJECT_FILE)
  if (stored === undefined) {
    throw new ProjectNotFoundError(id)
  }
  const encoded = encodeDocument(project, undefined, options)
  if (encoded.faults.length > 0) {
    return { replaced: false, faults: encoded.faults }
  }
  const version = storedVersionOf(decodeDocument(stored, options))
  await target.prepareAssets(project)
  await writeBackup(directory, 'pre-repair', { version, bytes: stored })
  await directory.writeFile(PROJECT_FILE, encoded.bytes)
  return { replaced: true }
}
