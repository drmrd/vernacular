import { decodeDocument } from '../../core'
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
import { PROJECT_FILE } from '../project-files/project-file-name'
import type { ProjectFiles, RemovableProjectFiles } from '../project-files/project-files'
import { collectReferencedAssets } from '../project-files/referenced-assets'
import { ProjectNotFoundError } from '../project-store'
import { writeBackup, storedVersionOf } from './document-backups'
import { warnAboutEncodeProblems } from './open-decoded'
import { createProjectSnapshots } from './project-snapshots'
import type { ProjectSnapshots } from './project-snapshots'
import { replaceStoredDocument } from './replace-stored'
import { encodeForSave } from './save-target'
import type { SecondFileWritten } from './save-target'
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
  /** The time of last change of the document file after the write; absent when the store cannot tell. */
  readonly lastChangedAt?: string
  /** Set when the save wrote the second file because the main file is newer than this build. */
  readonly secondFile?: SecondFileWritten
}

/** What a replace of the stored document did: it wrote, or it found faults and wrote nothing. */
export type ReplaceReport =
  | { readonly replaced: true }
  | { readonly replaced: false; readonly faults: readonly FormatFault[] }

/** One listed project: its id and when its document file last changed. */
export interface ProjectSummary {
  readonly id: string
  readonly lastChangedAt: string | undefined
}

const PACK_SCOPE_PREFIX = 'pack:'

type DecodedRead = Extract<StoreRead, { readonly ok: true }>

/** A stored document file with the outcome of decoding exactly those bytes. */
type StoredRead = { readonly decoded: DecodedRead } | { readonly failure: DecodeFailure }

function hashesToCopy(project: Project): string[] {
  const references = collectReferencedAssets(project).filter(
    (reference) => !reference.scope.startsWith(PACK_SCOPE_PREFIX),
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

  /**
   * The projects that hold a document, sorted by id. Reads no document. A project whose time of
   * last change cannot be read is listed with `lastChangedAt` undefined; a failure to list the ids
   * themselves still rejects.
   */
  async list(): Promise<ProjectSummary[]> {
    const ids = [...(await this.files.ids())].sort()
    return Promise.all(ids.map(async (id) => ({ id, lastChangedAt: await this.changedAt(id) })))
  }

  /** The time of the last change, or undefined whenever it cannot be read, for any reason. */
  private async changedAt(id: string): Promise<string | undefined> {
    try {
      return await this.files.projectDirectory(id).modifiedAt(PROJECT_FILE)
    } catch {
      return undefined
    }
  }

  /** Decodes the project's document. A failed decode writes nothing; a migrated one is backed up. */
  async read(id: string): Promise<StoreRead> {
    const stored = await this.readStored(id)
    if (stored === undefined) {
      return { ok: false, failure: { kind: 'not-found' } }
    }
    return 'failure' in stored
      ? { ok: false, failure: { kind: 'decode', decode: stored.failure } }
      : stored.decoded
  }

  /** The document file and its decoded outcome; undefined when the project has no document file. */
  private async readStored(id: string): Promise<StoredRead | undefined> {
    if (!this.files.holds(id)) {
      return undefined
    }
    const directory = this.files.projectDirectory(id)
    const bytes = await directory.readFile(PROJECT_FILE)
    if (bytes === undefined) {
      return undefined
    }
    const result = decodeDocument(bytes, this.options)
    if (!result.ok) {
      return { failure: result.failure }
    }
    if (result.value.migratedFrom !== undefined) {
      await writeBackup(directory, 'pre-migration', {
        version: result.value.migratedFrom,
        bytes,
      })
    }
    const lastChangedAt = await this.changedAt(id)
    const { value } = result
    const decoded: DecodedRead = {
      ok: true,
      value,
      ...(lastChangedAt === undefined ? {} : { lastChangedAt }),
    }
    return { decoded }
  }

  /**
   * Writes the project over its previous file so unknown data carries over. A failed check never
   * blocks the write; it is reported. The assets the folder lacks are copied first, so a failed
   * copy rejects before any write. It rejects when any step fails: the read of the previous file,
   * the encode, the asset copy, the backup of the last valid file, or the write.
   */
  async save(id: string, project: Project): Promise<SaveReport> {
    const directory = this.files.projectDirectory(id)
    const { fileName, previous, encoded, secondFile } = await encodeForSave(
      directory,
      project,
      this.options,
    )
    await this.files.prepareAssets(id, hashesToCopy(project))
    const backedUp = await this.backUpLastValid(directory, previous, encoded.faults)
    warnAboutEncodeProblems(encoded)
    await directory.writeFile(fileName, encoded.bytes)
    const lastChangedAt = await this.changedAt(id)
    const { faults, graftDropped } = encoded
    return {
      faults,
      backedUp,
      ...(secondFile === undefined ? {} : { secondFile }),
      ...(graftDropped === undefined ? {} : { graftDropped }),
      ...(lastChangedAt === undefined ? {} : { lastChangedAt }),
    }
  }

  /**
   * Replaces the stored document with the project, encoded with no previous document. Keeps the
   * stored bytes as a `pre-repair` backup before the write. Rejects with ProjectNotFoundError
   * when no document is stored.
   */
  async replaceStored(id: string, project: Project): Promise<ReplaceReport> {
    if (!this.files.holds(id)) {
      throw new ProjectNotFoundError(id)
    }
    return replaceStoredDocument(
      {
        id,
        directory: this.files.projectDirectory(id),
        ...(this.options === undefined ? {} : { options: this.options }),
        prepareAssets: (replacement) => this.files.prepareAssets(id, hashesToCopy(replacement)),
      },
      project,
    )
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
    const version = storedVersionOf(previousResult)
    await writeBackup(directory, 'last-valid', { version, bytes: previous })
    return true
  }

  snapshots(id: string): ProjectSnapshots {
    return createProjectSnapshots(this.files.projectDirectory(id), this.options)
  }

  assets(id: string): AssetCache {
    return this.files.assetsFor(id)
  }

  /**
   * Every file under the project's directory, keyed by its path relative to it. A project that the
   * store does not hold has no files.
   */
  async storedFiles(id: string): Promise<ReadonlyMap<string, Uint8Array>> {
    if (!this.files.holds(id)) {
      return new Map()
    }
    return listStoredFiles(this.files.projectDirectory(id))
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

  /** Removes the named assets from the shared pool, and no file of any project. */
  removeAssets(contentHashes: readonly string[]): Promise<void> {
    return this.removableFiles.removeAssets(contentHashes)
  }
}
