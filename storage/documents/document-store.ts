import { decodeDocument, encodeDocument } from '../../core'
import type {
  CodecOptions,
  DecodedDocument,
  DecodeFailure,
  FormatFault,
  GraftDropped,
  Project,
} from '../../core'
import type { AssetCache } from '../asset-cache'
import type { DirectoryPort } from '../fs/directory-port'
import { ProjectNotFoundError } from '../project-store'
import { PROJECT_FILE } from '../project-files/project-file-name'
import { copyMissingAssets } from '../project-files/copy-missing-assets'
import type { ProjectFiles, RemovableProjectFiles } from '../project-files/project-files'
import { collectReferencedAssets } from '../zip/export-project-bundle'
import { writeBackup } from './document-backups'
import { DocumentDecodeError } from './document-decode-error'
import { openDespiteFaults, warnAboutEncodeProblems } from './open-decoded'
import { createProjectSnapshots } from './project-snapshots'
import type { ProjectSnapshots } from './project-snapshots'
import { listStoredFiles } from './stored-files'

/** Why a read gave no document. */
export type StoreReadFailure =
  | { readonly kind: 'not-found' }
  | { readonly kind: 'decode'; readonly decode: DecodeFailure }

/** The outcome of reading one project: its decoded document, or why there is none. */
export type StoreRead =
  | { readonly ok: true; readonly value: DecodedDocument; readonly lastChangedAt?: string }
  | { readonly ok: false; readonly failure: StoreReadFailure }

/** What a save found, besides the write itself. */
export interface SaveReport {
  readonly faults: readonly FormatFault[]
  /** True when a copy of the last stored file that passed the check was kept before this write. */
  readonly backedUp: boolean
  /** Why this save wrote with no graft; undefined when it grafted or had no previous file. */
  readonly graftDropped?: GraftDropped
}

/** One listed project: its id and when its document file last changed. */
export interface ProjectSummary {
  readonly id: string
  readonly lastChangedAt: string | undefined
}

function hashesToCopy(project: Project): string[] {
  const references = collectReferencedAssets(project).filter(
    (reference) => !reference.scope.startsWith('pack:'),
  )
  return [...new Set(references.map((reference) => reference.contentHash))]
}

/**
 * Puts the document codec in front of any byte store, so no store can skip a step. It decodes on
 * read and encodes on write, keeps the migration backup before a migrated document reaches the
 * caller, and keeps a backup of the last sound file before a save writes a document that fails the
 * check.
 */
export class DocumentStore {
  readonly durable: boolean

  constructor(
    protected readonly files: ProjectFiles,
    private readonly options?: CodecOptions,
  ) {
    this.durable = files.durable
  }

  /** The projects that hold a document, sorted by id. Reads no document. */
  async list(): Promise<ProjectSummary[]> {
    const ids = [...(await this.files.ids())].sort()
    return Promise.all(
      ids.map(async (id) => ({
        id,
        lastChangedAt: await this.files.projectDirectory(id).modifiedAt(PROJECT_FILE),
      })),
    )
  }

  /** Decodes the project's document. A failed decode writes nothing; a migrated one is backed up. */
  async read(id: string): Promise<StoreRead> {
    const directory = this.files.projectDirectory(id)
    const bytes = await directory.readFile(PROJECT_FILE)
    if (bytes === undefined) {
      return { ok: false, failure: { kind: 'not-found' } }
    }
    const result = decodeDocument(bytes, this.options)
    if (!result.ok) {
      return { ok: false, failure: { kind: 'decode', decode: result.failure } }
    }
    if (result.value.migratedFrom !== undefined) {
      await writeBackup(directory, 'pre-migration', {
        version: result.value.migratedFrom,
        bytes,
      })
    }
    const lastChangedAt = await directory.modifiedAt(PROJECT_FILE)
    return {
      ok: true,
      value: result.value,
      ...(lastChangedAt === undefined ? {} : { lastChangedAt }),
    }
  }

  /**
   * Writes the project over its previous file so unknown data carries over. A failed check never
   * blocks the write; it is reported. Rejects only when a write rejects.
   */
  async save(id: string, project: Project): Promise<SaveReport> {
    const directory = this.files.projectDirectory(id)
    const previous = await directory.readFile(PROJECT_FILE)
    const encoded = encodeDocument(project, previous, this.options)
    const backedUp = await this.backUpLastValid(directory, previous, encoded.faults)
    warnAboutEncodeProblems(encoded)
    await directory.writeFile(PROJECT_FILE, encoded.bytes)
    await copyMissingAssets(this.files.assetsFor(id), hashesToCopy(project))
    const { faults, graftDropped } = encoded
    return { faults, backedUp, ...(graftDropped === undefined ? {} : { graftDropped }) }
  }

  /**
   * Keeps the previous file when this write breaks the format rules and the previous file did not.
   * The check on the previous file is one more decode of its bytes, made only for a faulty write.
   */
  private async backUpLastValid(
    directory: DirectoryPort,
    previous: Uint8Array | undefined,
    faults: readonly FormatFault[],
  ): Promise<boolean> {
    if (previous === undefined || faults.length === 0) {
      return false
    }
    const previousResult = decodeDocument(previous, this.options)
    if (!previousResult.ok) {
      return false
    }
    const { migratedFrom, project } = previousResult.value
    const version = migratedFrom ?? project.meta.schemaVersion
    await writeBackup(directory, 'last-valid', { version, bytes: previous })
    return true
  }

  snapshots(id: string): ProjectSnapshots {
    return createProjectSnapshots(this.files.projectDirectory(id), this.options)
  }

  assets(id: string): AssetCache {
    return this.files.assetsFor(id)
  }

  /** Every file under the project's directory, keyed by its path relative to it. */
  storedFiles(id: string): Promise<ReadonlyMap<string, Uint8Array>> {
    return listStoredFiles(this.files.projectDirectory(id))
  }

  /**
   * Interim: opens a document that breaks the format rules, after the migration backup when the
   * file was migrated. The rule itself lives in `openDespiteFaults`.
   */
  async openDespiteFormatFaults(id: string, failure: DecodeFailure): Promise<Project> {
    if (failure.kind !== 'format-rules') {
      throw new DocumentDecodeError(failure)
    }
    if (failure.migratedFrom !== undefined) {
      const directory = this.files.projectDirectory(id)
      const bytes = await directory.readFile(PROJECT_FILE)
      if (bytes === undefined) {
        throw new ProjectNotFoundError(id)
      }
      await writeBackup(directory, 'pre-migration', { version: failure.migratedFrom, bytes })
    }
    return openDespiteFaults(failure)
  }

  /** Interim: `read` with the interim policy, throwing on failure. */
  async load(id: string): Promise<Project> {
    const read = await this.read(id)
    if (read.ok) {
      return read.value.project
    }
    if (read.failure.kind === 'not-found') {
      throw new ProjectNotFoundError(id)
    }
    if (read.failure.decode.kind === 'format-rules') {
      return this.openDespiteFormatFaults(id, read.failure.decode)
    }
    throw new DocumentDecodeError(read.failure.decode)
  }
}

/** A DocumentStore over files that can delete a whole project. */
export class WorkspaceDocumentStore extends DocumentStore {
  constructor(
    private readonly removableFiles: RemovableProjectFiles,
    options?: CodecOptions,
  ) {
    super(removableFiles, options)
  }

  /** Removes the project's document, backups, and snapshots, and nothing else. */
  delete(id: string): Promise<void> {
    return this.removableFiles.remove(id)
  }
}
