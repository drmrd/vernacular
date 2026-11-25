import { decodeDocument, encodeDocument } from '../../core'
import type { CodecOptions, DecodeResult, Project } from '../../core'
import type { DirectoryPort } from '../fs/directory-port'
import { PROJECT_FILE, secondDocumentFileName } from '../project-files/project-file-name'
import { collectReferencedAssets } from '../project-files/referenced-assets'
import { ProjectNotFoundError } from '../project-store'
import { storedVersionOf, writeBackup } from './document-backups'
import type { ReplaceReport } from './document-store'
import { listSecondFiles, readNewestSecondFile } from './second-file'

const PACK_SCOPE_PREFIX = 'pack:'

/** The content hashes of the assets a project references outside the packs, each once. */
export function hashesToCopy(project: Project): string[] {
  const references = collectReferencedAssets(project).filter(
    (reference) => !reference.scope.startsWith(PACK_SCOPE_PREFIX),
  )
  return [...new Set(references.map((reference) => reference.contentHash))]
}

/** What a replace works on: the stored project, and how to copy the assets the new document needs. */
export interface ReplaceTarget {
  readonly id: string
  readonly directory: DirectoryPort
  readonly options?: CodecOptions
  readonly prepareAssets: (project: Project) => Promise<void>
}

/** Bytes that a replace overwrites, and the outcome of decoding exactly those bytes. */
interface StoredFile {
  readonly bytes: Uint8Array
  readonly result: DecodeResult
}

/** The file a replace writes, and what it holds now; nothing when the file does not exist yet. */
interface ReplacedFile {
  readonly name: string
  readonly stored?: StoredFile
}

/**
 * The file a replace writes: the main file, or under a newer main file the newest second file at
 * or below the build's version, whether or not it decodes, or the build's own second file when
 * there is none. A newer main file is never the file to replace.
 */
async function fileToReplace(
  directory: DirectoryPort,
  main: Uint8Array,
  options?: CodecOptions,
): Promise<ReplacedFile> {
  const result = decodeDocument(main, options)
  if (result.ok || result.failure.kind !== 'newer-version') {
    return { name: PROJECT_FILE, stored: { bytes: main, result } }
  }
  const { buildVersion } = result.failure
  const files = await listSecondFiles(directory)
  const second = await readNewestSecondFile(directory, files, buildVersion)
  if (second === undefined) {
    return { name: secondDocumentFileName(buildVersion) }
  }
  const stored = { bytes: second.bytes, result: decodeDocument(second.bytes, options) }
  return { name: second.name, stored }
}

/**
 * Replaces the stored document with the project. The project is encoded with no previous document,
 * so data that only the stored document held is not carried over. The steps run in this order, and
 * a failed step stops the ones after it: read the main file, encode, stop when the result breaks
 * the format rules, pick the file to replace, prepare the assets, keep the bytes of that file as a
 * backup when it exists, write it. Assets copied before a later failure stay, as for a save.
 */
export async function replaceStoredDocument(
  target: ReplaceTarget,
  project: Project,
): Promise<ReplaceReport> {
  const { id, directory, options } = target
  const main = await directory.readFile(PROJECT_FILE)
  if (main === undefined) {
    throw new ProjectNotFoundError(id)
  }
  const encoded = encodeDocument(project, undefined, options)
  if (encoded.faults.length > 0) {
    return { replaced: false, faults: encoded.faults }
  }
  const replaced = await fileToReplace(directory, main, options)
  await target.prepareAssets(project)
  if (replaced.stored !== undefined) {
    const { bytes, result } = replaced.stored
    await writeBackup(directory, 'pre-repair', { version: storedVersionOf(result), bytes })
  }
  await directory.writeFile(replaced.name, encoded.bytes)
  return { replaced: true }
}
