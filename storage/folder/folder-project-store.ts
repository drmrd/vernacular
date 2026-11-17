import type { CodecOptions, MigrateOptions, Project } from '../../core'
import type { DirectoryPort } from '../fs/directory-port'
import { DocumentDecodeError } from '../documents/document-decode-error'
import { encodeForWrite, openDecodedDocument } from '../documents/open-decoded'
import type { OpenedDocument } from '../documents/open-decoded'

/** Canonical project file name written at the root of each project folder. */
export const PROJECT_FILE = 'vernacular.json'
const AUTOSAVE_DIR = '.house-autosave'

/** Thrown by FolderProjectStore.loadProject when no project file exists at the expected path. */
export class ProjectFileNotFoundError extends Error {
  constructor(public readonly path: string) {
    super(`No project file at "${path}"`)
    this.name = 'ProjectFileNotFoundError'
  }
}

export interface FolderProjectStoreOptions {
  /** Handed to the codec; injected in tests to exercise custom migration sequences. */
  migration?: MigrateOptions
}

/** The stored version that a failed migration started from; undefined for any other error. */
function migrationFailedFrom(error: unknown): number | undefined {
  const isMigrationFailure =
    error instanceof DocumentDecodeError && error.failure.kind === 'migration-failed'
  return isMigrationFailure ? error.failure.fromVersion : undefined
}

/**
 * Reads and writes one project folder (vernacular.json at the directory root) through
 * a DirectoryPort and the document codec. Save encodes immediately, so the stored snapshot is
 * isolated from later caller mutation (the clone-on-save contract from ADR-0003).
 */
export class FolderProjectStore {
  private readonly codecOptions: CodecOptions

  constructor(
    private readonly directory: DirectoryPort,
    options?: FolderProjectStoreOptions,
  ) {
    this.codecOptions = options?.migration === undefined ? {} : { migration: options.migration }
  }

  async loadProject(): Promise<Project> {
    const bytes = await this.directory.readFile(PROJECT_FILE)
    if (bytes === undefined) {
      throw new ProjectFileNotFoundError(PROJECT_FILE)
    }
    const opened = await this.openWithBackup(bytes)
    return opened.project
  }

  /**
   * Opens the stored bytes. Back up the stored bytes verbatim before a migration changes them, so
   * a failed migration leaves both the original file and an identical pre-migration copy.
   */
  private async openWithBackup(bytes: Uint8Array): Promise<OpenedDocument> {
    let opened: OpenedDocument
    try {
      opened = openDecodedDocument(bytes, this.codecOptions)
    } catch (error) {
      const failedFrom = migrationFailedFrom(error)
      if (failedFrom !== undefined) {
        await this.backUp(failedFrom, bytes)
      }
      throw error
    }
    if (opened.migratedFrom !== undefined) {
      await this.backUp(opened.migratedFrom, bytes)
    }
    return opened
  }

  private async backUp(fromVersion: number, bytes: Uint8Array): Promise<void> {
    await this.directory.writeFile(`${AUTOSAVE_DIR}/pre-migration-v${fromVersion}.json`, bytes)
  }

  async saveProject(project: Project): Promise<void> {
    // The codec grafts the unknown or reserved data of the stored file that the app's edit-dispatch
    // path dropped (VFPF section 6.4). With no stored file, or an unreadable one, it writes the
    // project directly: refusing to save would lose the user's edit. A stored file that cannot be
    // decoded gets no graft: the codec reports it as dropped, and this store does not act on it yet.
    const previous = await this.directory.readFile(PROJECT_FILE)
    const bytes = encodeForWrite(project, previous, this.codecOptions)
    await this.directory.writeFile(PROJECT_FILE, bytes)
  }

  async exists(): Promise<boolean> {
    return (await this.directory.list('')).includes(PROJECT_FILE)
  }
}
