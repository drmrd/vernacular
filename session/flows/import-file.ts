import { findRepairOffer } from '../../core'
import type { DecodeFailure, Project, RepairOffer } from '../../core'
import {
  copyImportedAssets,
  importProjectFile,
  neededAssetHashes,
  newProjectId,
} from '../../storage'
import type {
  ArchiveFailure,
  ArchiveLimitName,
  ArchiveLimits,
  AssetCache,
  PackSupplies,
  ProjectFileFailure,
} from '../../storage'
import type { DocumentHandle } from '../handle/handle-types'
import type { SessionPorts } from '../ports'
import type { SwitchFailure } from './flow-result'
import { switchProject } from './switch-project'

/** A file that the user chose to open, with its name and its bytes. */
export interface ImportedFile {
  readonly name: string
  readonly bytes: Uint8Array
  /** Whether an installed pack supplies a `pack:` reference. With none, no pack does. */
  readonly packSupplies?: PackSupplies
  /** The limits of the archive reader. The reader's own limits apply when none are given. */
  readonly limits?: ArchiveLimits
}

/** Why a file did not become a project. */
export type ImportFailure =
  | { readonly kind: 'unsupported-file'; readonly fileName: string }
  | {
      readonly kind: 'did-not-import'
      readonly decode: DecodeFailure
      /** A repair that would let the document open, when there is one. */
      readonly repair?: RepairOffer
    }
  | {
      readonly kind: 'archive-too-large'
      readonly limit: ArchiveLimitName
      readonly allowed: number
    }

/** The project now open with the needed assets that its pool lacks, or why nothing changed. */
export type ImportResult =
  | {
      readonly ok: true
      readonly handle: DocumentHandle
      readonly missingAssets: readonly string[]
    }
  | { readonly ok: false; readonly failure: SwitchFailure | ImportFailure }

/**
 * The failure of a read. An archive above a limit says which limit; bytes that are no archive and
 * an archive with no document both mean the file holds no project.
 */
function importFailureOf(failure: ProjectFileFailure): ImportFailure {
  switch (failure.kind) {
    case 'unsupported-file':
      return failure
    case 'decode':
      return didNotImport(failure.decode)
    case 'archive':
      return archiveFailureOf(failure.archive)
  }
}

/** A document that failed to decode, with the repair that would let it open, when there is one. */
function didNotImport(decode: DecodeFailure): ImportFailure {
  const repair = decode.kind === 'format-rules' ? findRepairOffer(decode.document) : undefined
  return { kind: 'did-not-import', decode, ...(repair === undefined ? {} : { repair }) }
}

function archiveFailureOf(archive: ArchiveFailure): ImportFailure {
  switch (archive.kind) {
    case 'too-large':
      return { kind: 'archive-too-large', limit: archive.limit, allowed: archive.allowed }
    case 'not-an-archive':
    case 'no-document':
      return { kind: 'did-not-import', decode: { kind: 'not-a-project' } }
  }
}

/**
 * The pool of the new project. A pool that cannot be reached does not fail the import: the copy
 * still opens, and every needed asset shows as missing.
 */
function poolOf(ports: SessionPorts, id: string): AssetCache | undefined {
  try {
    return ports.workspace.assets(id)
  } catch (error) {
    console.error(
      'The asset pool of the imported project cannot be reached; no asset is copied.',
      error,
    )
    return undefined
  }
}

/**
 * The content hashes that the document needs. A document whose references cannot be listed names
 * nothing as missing rather than fail an import whose project is already open.
 */
function neededOf(project: Project, packSupplies: PackSupplies | undefined): string[] {
  try {
    return neededAssetHashes(project, packSupplies)
  } catch (error) {
    console.error(
      'The assets that the imported document needs cannot be listed; no asset is copied.',
      error,
    )
    return []
  }
}

/**
 * Reads the file, switches to the copy, and copies the assets that its document needs. Nothing is
 * written before the switch, so a refused file or a failed switch leaves every store as it was.
 * The reader's assets are not kept past this function, since they may be views into the file.
 */
async function openWithAssets(
  ports: SessionPorts,
  current: DocumentHandle | undefined,
  file: ImportedFile,
): Promise<ImportResult> {
  const read = await importProjectFile(file.name, file.bytes, file.limits)
  if (!read.ok) {
    return { ok: false, failure: importFailureOf(read.failure) }
  }
  const { project } = read
  const id = newProjectId([])
  const switched = await switchProject(ports, current, {
    id,
    location: { kind: 'workspace' },
    create: () => project,
  })
  if (!switched.ok) {
    return switched
  }
  const needed = neededOf(project, file.packSupplies)
  const pool = poolOf(ports, id)
  const missingAssets =
    pool === undefined ? needed : await copyImportedAssets(pool, read.assets, needed)
  return { ok: true, handle: switched.handle, missingAssets }
}

/**
 * Opens a copy of a project file as a new workspace project. The file is read before anything
 * else, so a file that cannot be read leaves the current project untouched. Then the switch
 * flushes and closes the current project, the assets go into the pool, and the copy is saved at
 * once, so the pool has the assets before the stored document refers to them. The result holds
 * the handle whatever that save's outcome; a failed save shows in the save status. The promise
 * never rejects.
 */
export async function importFile(
  ports: SessionPorts,
  current: DocumentHandle | undefined,
  file: ImportedFile,
): Promise<ImportResult> {
  const opened = await openWithAssets(ports, current, file)
  if (opened.ok) {
    await opened.handle.save()
  }
  return opened
}
