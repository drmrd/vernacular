import type { DecodeFailure, Project } from '../../core'
import { DocumentDecodeError } from '../documents/document-decode-error'
import { openDecodedDocument } from '../documents/open-decoded'
import type { ArchiveLimits } from '../zip/archive-limits'
import { readArchive, type ArchiveFailure } from '../zip/read-archive'

/** Why a file gave no project. */
export type ProjectFileFailure =
  | { readonly kind: 'unsupported-file'; readonly fileName: string }
  | { readonly kind: 'archive'; readonly archive: ArchiveFailure }
  | {
      readonly kind: 'decode'
      readonly decode: DecodeFailure
      /** The checked assets of an archive whose document gave `format-rules`. Absent otherwise. */
      readonly supplied?: {
        readonly assets: ReadonlyMap<string, Uint8Array>
        readonly rejectedAssets: readonly string[]
      }
    }

/** The project of a file, with the assets that the file supplied, or why the file gave none. */
export type ProjectFileRead =
  | {
      readonly ok: true
      readonly project: Project
      /** By content hash. Each was checked against its hash by the reader. */
      readonly assets: ReadonlyMap<string, Uint8Array>
      /** The content hashes of the asset entries that the reader did not accept. */
      readonly rejectedAssets: readonly string[]
    }
  | { readonly ok: false; readonly failure: ProjectFileFailure }

type Failed = Extract<ProjectFileRead, { readonly ok: false }>

/**
 * Decodes the document bytes. A document that fails to decode, one that breaks the format rules
 * included, is refused; nothing is stored yet, so no migration backup is written.
 */
function readDocument(
  document: Uint8Array,
  assets: ReadonlyMap<string, Uint8Array>,
  rejectedAssets: readonly string[],
): ProjectFileRead {
  const { project } = openDecodedDocument(document)
  return { ok: true, project, assets, rejectedAssets }
}

/**
 * The archive's project. A document that breaks the format rules gives its failure with the checked
 * assets, so that a repaired copy can still bring them.
 */
async function readArchiveFile(
  bytes: Uint8Array,
  limits?: ArchiveLimits,
): Promise<ProjectFileRead> {
  const read = await readArchive(bytes, limits)
  if (!read.ok) {
    return { ok: false, failure: { kind: 'archive', archive: read.failure } }
  }
  const { assets, rejectedAssets } = read
  try {
    return readDocument(read.document, assets, rejectedAssets)
  } catch (error) {
    if (error instanceof DocumentDecodeError && error.failure.kind === 'format-rules') {
      const supplied = { assets, rejectedAssets }
      return { ok: false, failure: { kind: 'decode', decode: error.failure, supplied } }
    }
    throw error
  }
}

function decodeFailed(error: unknown): Failed {
  const decode: DecodeFailure =
    error instanceof DocumentDecodeError ? error.failure : { kind: 'not-a-project' }
  return { ok: false, failure: { kind: 'decode', decode } }
}

/**
 * Reads a project from the bytes of a file, choosing the reader by the ending of the name. A
 * `.building` archive is read as an untrusted file, and its checked assets come with the project;
 * a `.json` document supplies no asset. Any other name is not read at all. The promise never
 * rejects: a thrown value that is no decode failure means the file holds no project.
 */
export async function importProjectFile(
  name: string,
  bytes: Uint8Array,
  limits?: ArchiveLimits,
): Promise<ProjectFileRead> {
  const lowerName = name.toLowerCase()
  try {
    if (lowerName.endsWith('.building')) {
      return await readArchiveFile(bytes, limits)
    }
    if (lowerName.endsWith('.json')) {
      return readDocument(bytes, new Map(), [])
    }
  } catch (error) {
    return decodeFailed(error)
  }
  return { ok: false, failure: { kind: 'unsupported-file', fileName: name } }
}
