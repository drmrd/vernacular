import { repairOfferFor } from '../../core'
import type { DecodeFailure, Project, RepairOffer } from '../../core'
import { importProjectFile } from '../../storage'
import type {
  ArchiveFailure,
  ArchiveLimitName,
  ArchiveLimits,
  PackSupplies,
  ProjectFileFailure,
  ProjectFileRead,
} from '../../storage'
import type { DocumentHandle } from '../handle/handle-types'
import type { SessionPorts } from '../ports'
import type { SwitchFailure } from './flow-result'
import { openAsNewProject } from './new-project-copy'
import { repairedCopyOf } from './repaired-copy'

/** A file that the user chose to open, with its name and its bytes. */
export interface ImportedFile {
  readonly name: string
  readonly bytes: Uint8Array
  /** Whether an installed pack supplies a `pack:` reference. With none, no pack does. */
  readonly packSupplies?: PackSupplies
  /** The limits of the archive reader. The reader's own limits apply when none are given. */
  readonly limits?: ArchiveLimits
  /** True: a file that gave `format-rules` with a repair opens as its repaired copy. */
  readonly applyRepair?: boolean
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
  const repair = repairOfferFor(decode)
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

/** The project to open and the assets that the file supplied for it. */
interface CopySource {
  readonly project: Project
  readonly assets: ReadonlyMap<string, Uint8Array>
}

type SourceRead =
  | { readonly ok: true; readonly source: CopySource }
  | { readonly ok: false; readonly failure: ImportFailure }

/**
 * The project of the read. With `applyRepair`, a document that breaks the format rules and has a
 * repair gives its repaired copy, with the assets that the archive supplied.
 */
function sourceOf(read: ProjectFileRead, file: ImportedFile): SourceRead {
  if (read.ok) {
    return { ok: true, source: read }
  }
  const { failure } = read
  if (file.applyRepair === true && failure.kind === 'decode') {
    const offer = repairOfferFor(failure.decode)
    if (offer !== undefined) {
      const assets = failure.supplied?.assets ?? new Map<string, Uint8Array>()
      return { ok: true, source: { project: repairedCopyOf(offer), assets } }
    }
  }
  return { ok: false, failure: importFailureOf(failure) }
}

/**
 * Opens a copy of a project file as a new workspace project. The file is read before anything
 * else, so a file that cannot be read leaves the current project untouched. Then the switch
 * flushes and closes the current project, the assets go into the pool, and the copy is saved at
 * once, so the pool has the assets before the stored document refers to them. The result holds
 * the handle whatever that save's outcome; a failed save shows in the save status. The reader's
 * assets are not kept past this function, since they may be views into the file. The promise
 * never rejects.
 */
export async function importFile(
  ports: SessionPorts,
  current: DocumentHandle | undefined,
  file: ImportedFile,
): Promise<ImportResult> {
  const read = sourceOf(await importProjectFile(file.name, file.bytes, file.limits), file)
  if (!read.ok) {
    return read
  }
  const { project, assets } = read.source
  return openAsNewProject(ports, current, {
    project,
    packSupplies: file.packSupplies,
    supplied: () => Promise.resolve(assets),
  })
}
