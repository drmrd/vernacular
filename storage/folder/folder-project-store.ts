import type { Project } from '../../core'
import { CURRENT_SCHEMA_VERSION, migrateProject, preserveUnknown } from '../../core'
import type { DirectoryPort } from '../fs/directory-port'
import { parseProjectJson, serializeProjectJson } from './project-json'

/** Canonical project file name written at the root of each project folder. */
export const PROJECT_FILE = 'vernacular.json'
const AUTOSAVE_DIR = '.house-autosave'

/** Read meta.schemaVersion from a parsed project, or undefined when missing or non-numeric. */
function readStoredSchemaVersion(raw: unknown): number | undefined {
  if (typeof raw !== 'object' || raw === null) {
    return undefined
  }
  const meta = (raw as { meta?: unknown }).meta
  if (typeof meta !== 'object' || meta === null) {
    return undefined
  }
  const schemaVersion = (meta as { schemaVersion?: unknown }).schemaVersion
  return typeof schemaVersion === 'number' ? schemaVersion : undefined
}

/** Thrown by FolderProjectStore.loadProject when no project file exists at the expected path. */
export class ProjectFileNotFoundError extends Error {
  constructor(public readonly path: string) {
    super(`No project file at "${path}"`)
    this.name = 'ProjectFileNotFoundError'
  }
}

export interface FolderProjectStoreOptions {
  /** Defaults to migrateProject; injected in tests to exercise custom migration sequences. */
  migrate?: (raw: unknown) => Project
  /**
   * Schema version this store migrates toward; controls when a pre-migration backup
   * is taken. Defaults to CURRENT_SCHEMA_VERSION.
   */
  targetVersion?: number
}

/**
 * Reads and writes one project folder (vernacular.json at the directory root) through
 * a DirectoryPort. Save serializes immediately, so the stored snapshot is isolated
 * from later caller mutation (the clone-on-save contract from ADR-0003).
 */
export class FolderProjectStore {
  private readonly migrate: (raw: unknown) => Project
  private readonly targetVersion: number

  constructor(
    private readonly directory: DirectoryPort,
    options?: FolderProjectStoreOptions,
  ) {
    this.migrate = options?.migrate ?? migrateProject
    this.targetVersion = options?.targetVersion ?? CURRENT_SCHEMA_VERSION
  }

  async loadProject(): Promise<Project> {
    const bytes = await this.directory.readFile(PROJECT_FILE)
    if (bytes === undefined) {
      throw new ProjectFileNotFoundError(PROJECT_FILE)
    }
    const raw = parseProjectJson(bytes)
    const storedVersion = readStoredSchemaVersion(raw)
    if (storedVersion !== undefined && storedVersion < this.targetVersion) {
      // Back up the canonical bytes verbatim before migrating, so a failed migration
      // leaves both the original file and an identical pre-migration copy.
      await this.directory.writeFile(`${AUTOSAVE_DIR}/pre-migration-v${storedVersion}.json`, bytes)
    }
    return this.migrate(raw)
  }

  async saveProject(project: Project): Promise<void> {
    // Apply the preservation overlay against the prior Document so a read-modify-write cycle keeps
    // any unknown or reserved data the app's edit-dispatch path dropped (VFPF section 6.4). With no
    // prior file, or an unreadable one, serialize the project directly.
    const previous = await this.readPriorDocument()
    const payload = previous === undefined ? project : preserveUnknown(previous, project)
    await this.directory.writeFile(PROJECT_FILE, serializeProjectJson(payload))
  }

  private async readPriorDocument(): Promise<unknown> {
    const previousBytes = await this.directory.readFile(PROJECT_FILE)
    if (previousBytes === undefined) {
      return undefined
    }
    try {
      return this.migrateInMemory(parseProjectJson(previousBytes))
    } catch {
      // A corrupt prior file, or one that fails to migrate, must not block saving. Losing the
      // unknown keys of an unreadable previous file is the lesser harm; refusing to save would lose
      // the user's edit. So skip the overlay and overwrite the file.
      return undefined
    }
  }

  /**
   * The previous document at the target version, so a key a migration removed is not grafted back
   * as unknown data (ADR-0184). Undefined when the document is not an object or is at a newer
   * version than the target. The file on disk is never rewritten here. Throws when migration fails.
   * It looks at the schema version only, not at the registry versions (see the skip below).
   */
  private migrateInMemory(raw: unknown): unknown {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return undefined
    }
    const storedVersion = readStoredSchemaVersion(raw)
    if (storedVersion === this.targetVersion) {
      // Skipping saves a migration run on every save. It assumes no pending registry migration
      // removes or renames a key, which holds while no registry migration exists. Issue #734
      // tracks the change that removes this assumption.
      return raw
    }
    if (storedVersion !== undefined && storedVersion > this.targetVersion) {
      return undefined
    }
    return this.migrate(raw)
  }

  async exists(): Promise<boolean> {
    return (await this.directory.list('')).includes(PROJECT_FILE)
  }
}
