import { encodeDocument } from '../../core'
import type { CodecOptions, EncodedDocument, Project } from '../../core'
import type { DirectoryPort } from '../fs/directory-port'
import { PROJECT_FILE, secondDocumentFileName } from '../project-files/project-file-name'

/** The file a save writes, the bytes it grafts onto, and the encoding of the project for it. */
export interface SaveTarget {
  readonly fileName: string
  readonly previous: Uint8Array | undefined
  readonly encoded: EncodedDocument
  /** Set when the main file is newer than this build, so the save goes to the second file. */
  readonly secondFile?: { readonly name: string; readonly newerVersion: number }
}

/**
 * Encodes the project for a save and says which file to write. The main file, unless it was
 * written by a newer build: then the build's own second file, grafted onto that file's bytes.
 */
export async function encodeForSave(
  directory: DirectoryPort,
  project: Project,
  options?: CodecOptions,
): Promise<SaveTarget> {
  const previous = await directory.readFile(PROJECT_FILE)
  const encoded = encodeDocument(project, previous, options)
  const dropped = encoded.graftDropped
  if (dropped?.kind !== 'newer-version') {
    return { fileName: PROJECT_FILE, previous, encoded }
  }
  const fileName = secondDocumentFileName(dropped.buildVersion)
  const secondPrevious = await directory.readFile(fileName)
  return {
    fileName,
    previous: secondPrevious,
    encoded: encodeDocument(project, secondPrevious, options),
    secondFile: { name: fileName, newerVersion: dropped.version },
  }
}
