import type { DecodeFailure, Project } from '../../core'
import {
  DocumentDecodeError,
  importProjectFile,
  newProjectId,
  UnsupportedProjectFileError,
} from '../../storage'
import type { DocumentHandle } from '../handle/handle-types'
import type { SessionPorts } from '../ports'
import type { FlowResult } from './flow-result'
import { switchProject } from './switch-project'

/** A file that the user chose to open, with its name and its bytes. */
export interface ImportedFile {
  readonly name: string
  readonly bytes: Uint8Array
}

/** Why a file did not become a project. */
export type ImportFailure =
  | { readonly kind: 'unsupported-file'; readonly fileName: string }
  | { readonly kind: 'did-not-import'; readonly decode: DecodeFailure }

type ReadImport =
  | { readonly ok: true; readonly project: Project }
  | { readonly ok: false; readonly failure: ImportFailure }

/**
 * The failure of a read. A name that ends in neither `.building` nor `.json` is not supported. A
 * document that does not decode carries its decode failure, and any other thrown value (bytes that
 * are no archive, an archive with no document) means the file holds no project.
 */
function importFailureOf(error: unknown): ImportFailure {
  if (error instanceof UnsupportedProjectFileError) {
    return { kind: 'unsupported-file', fileName: error.fileName }
  }
  if (error instanceof DocumentDecodeError) {
    return { kind: 'did-not-import', decode: error.failure }
  }
  return { kind: 'did-not-import', decode: { kind: 'not-a-project' } }
}

/** Reads the document of the file in memory. A document that fails the check opens with a warning. */
async function readImport(file: ImportedFile, id: string): Promise<ReadImport> {
  try {
    return { ok: true, project: await importProjectFile(file.name, file.bytes, id) }
  } catch (error) {
    return { ok: false, failure: importFailureOf(error) }
  }
}

/**
 * Opens a copy of a project file as a new workspace project. The file is read before anything
 * else, so a file that cannot be read leaves the current project untouched. Then the switch
 * flushes and closes the current project, and the copy is saved at once, so it is stored before
 * the flow resolves. The result holds the handle whatever that save's outcome; a failed save shows
 * in the save status. The promise never rejects.
 */
export async function importFile(
  ports: SessionPorts,
  current: DocumentHandle | undefined,
  file: ImportedFile,
): Promise<FlowResult<ImportFailure>> {
  const id = newProjectId([])
  const read = await readImport(file, id)
  if (!read.ok) {
    return read
  }
  const { project } = read
  const switched = await switchProject(ports, current, {
    id,
    location: { kind: 'workspace' },
    create: () => project,
  })
  if (switched.ok) {
    await switched.handle.save()
  }
  return switched
}
