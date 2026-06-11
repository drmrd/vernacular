import type { Project } from '../../core'
import { CURRENT_SCHEMA_VERSION, migrateProject } from '../../core'
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
    // Serializing now captures a snapshot, so later caller mutation cannot reach the stored bytes.
    await this.directory.writeFile(PROJECT_FILE, serializeProjectJson(project))
  }

  async exists(): Promise<boolean> {
    return (await this.directory.list('')).includes(PROJECT_FILE)
  }
}
