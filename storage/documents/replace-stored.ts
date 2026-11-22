import { decodeDocument, encodeDocument } from '../../core'
import type { CodecOptions, Project } from '../../core'
import type { DirectoryPort } from '../fs/directory-port'
import { PROJECT_FILE, secondDocumentFileName } from '../project-files/project-file-name'
import { ProjectNotFoundError } from '../project-store'
import { storedVersionOf, writeBackup } from './document-backups'
import type { ReplaceReport } from './document-store'
import { newestSecondFile } from './second-file'

/** What a replace works on: the stored project, and how to copy the assets the new document needs. */
export interface ReplaceTarget {
  readonly id: string
  readonly directory: DirectoryPort
  readonly options?: CodecOptions
  readonly prepareAssets: (project: Project) => Promise<void>
}

/** The file a replace writes, and the bytes it holds now; none when the file does not exist yet. */
interface ReplacedFile {
  readonly name: string
  readonly bytes: Uint8Array | undefined
}

/**
 * The file that a read decodes: the main file, or under a newer main file its newest readable
 * second file, or the build's own second file when there is none. A newer main file is never
 * the file to replace.
 */
async function fileToReplace(
  directory: DirectoryPort,
  main: Uint8Array,
  options?: CodecOptions,
): Promise<ReplacedFile> {
  const decoded = decodeDocument(main, options)
  if (decoded.ok || decoded.failure.kind !== 'newer-version') {
    return { name: PROJECT_FILE, bytes: main }
  }
  const { buildVersion } = decoded.failure
  const second = await newestSecondFile(directory, buildVersion)
  return second ?? { name: secondDocumentFileName(buildVersion), bytes: undefined }
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
  const replaced = await fileToReplace(directory, stored, options)
  await target.prepareAssets(project)
  if (replaced.bytes !== undefined) {
    const version = storedVersionOf(decodeDocument(replaced.bytes, options))
    await writeBackup(directory, 'pre-repair', { version, bytes: replaced.bytes })
  }
  await directory.writeFile(replaced.name, encoded.bytes)
  return { replaced: true }
}
