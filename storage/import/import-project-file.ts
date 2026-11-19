import type { Project } from '../../core'
import { openDecodedDocument } from '../documents/open-decoded'
import { ProjectNotFoundError } from '../project-store'
import { ZipBundleProjectStore } from '../zip/zip-bundle-project-store'

/** Thrown when a file name's extension matches no supported project decoder. */
export class UnsupportedProjectFileError extends Error {
  readonly fileName: string

  constructor(fileName: string) {
    super(`Unsupported project file: ${fileName}`)
    this.name = 'UnsupportedProjectFileError'
    this.fileName = fileName
  }
}

/**
 * The project of a `.building` archive. A document that only breaks the format rules opens under
 * the interim rule; an archive with no document throws ProjectNotFoundError, and any other failed
 * decode throws a DocumentDecodeError.
 */
async function readArchive(bytes: Uint8Array, id: string): Promise<Project> {
  const store = await ZipBundleProjectStore.fromBundle(id, bytes)
  const read = await store.read(id)
  if (read.ok) {
    return read.value.project
  }
  if (read.failure.kind === 'not-found') {
    throw new ProjectNotFoundError(id)
  }
  return store.openDespiteFormatFaults(id, read.failure.decode)
}

/** Import a project from file bytes, selecting a decoder by the file name's extension. */
export async function importProjectFile(
  name: string,
  bytes: Uint8Array,
  id: string,
): Promise<Project> {
  const lowerName = name.toLowerCase()
  if (lowerName.endsWith('.building')) {
    return readArchive(bytes, id)
  }
  if (lowerName.endsWith('.json')) {
    return openDecodedDocument(bytes).project
  }
  throw new UnsupportedProjectFileError(name)
}
