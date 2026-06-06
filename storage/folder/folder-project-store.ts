import type { Project } from '../../core'
import { migrateProject } from '../../core'
import type { DirectoryPort } from '../fs/directory-port'
import { parseProjectJson, serializeProjectJson } from './project-json'

const PROJECT_FILE = 'project.json'

/** Thrown by FolderProjectStore.loadProject when no project file exists at the expected path. */
export class ProjectFileNotFoundError extends Error {
  constructor(public readonly path: string) {
    super(`No project file at "${path}"`)
    this.name = 'ProjectFileNotFoundError'
  }
}

export interface FolderProjectStoreOptions {
  /** Defaults to migrateProject; injected in tests for synthetic chains. */
  migrate?: (raw: unknown) => Project
}

/**
 * Reads and writes one project folder (project.json at the directory root) through
 * a DirectoryPort. Single-project; multi-project stores compose one per id. Save
 * serializes immediately, so the stored snapshot is isolated from later caller
 * mutation (the clone-on-save contract from ADR-0003).
 */
export class FolderProjectStore {
  private readonly migrate: (raw: unknown) => Project

  constructor(
    private readonly directory: DirectoryPort,
    options?: FolderProjectStoreOptions,
  ) {
    this.migrate = options?.migrate ?? migrateProject
  }

  async loadProject(): Promise<Project> {
    const bytes = await this.directory.readFile(PROJECT_FILE)
    if (bytes === undefined) {
      throw new ProjectFileNotFoundError(PROJECT_FILE)
    }
    return this.migrate(parseProjectJson(bytes))
  }

  async saveProject(project: Project): Promise<void> {
    // Serializing now captures a snapshot, so later caller mutation cannot reach the stored bytes.
    await this.directory.writeFile(PROJECT_FILE, serializeProjectJson(project))
  }

  async exists(): Promise<boolean> {
    return (await this.directory.list('')).includes(PROJECT_FILE)
  }
}
