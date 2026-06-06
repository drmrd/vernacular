import type { Project } from '../../core'
import {
  FolderProjectStore,
  PROJECT_FILE,
  ProjectFileNotFoundError,
} from '../folder/folder-project-store'
import { parseProjectJson } from '../folder/project-json'
import type { ProjectStore, ProjectSummary } from '../project-store'
import { ProjectNotFoundError } from '../project-store'
import type { DirectoryPort } from '../fs/directory-port'
import { SubdirectoryPort } from '../fs/subdirectory-port'

/** Read meta.name from a parsed project, or undefined when it is not a string. */
function readProjectName(raw: unknown): string | undefined {
  const name = (raw as { meta?: { name?: unknown } }).meta?.name
  return typeof name === 'string' ? name : undefined
}

/**
 * Stores each project in its own id-named subdirectory, delegating the
 * project.json codec, migration, and backup to a FolderProjectStore that
 * operates inside that subdirectory. Absence of a project is reported as the
 * id-keyed ProjectNotFoundError.
 */
export class OpfsProjectStore implements ProjectStore {
  constructor(private readonly root: DirectoryPort) {}

  private folderFor(id: string): FolderProjectStore {
    return new FolderProjectStore(new SubdirectoryPort(this.root, id))
  }

  async save(id: string, project: Project): Promise<void> {
    await this.folderFor(id).saveProject(project)
  }

  async load(id: string): Promise<Project> {
    try {
      return await this.folderFor(id).loadProject()
    } catch (error) {
      // A single read decides presence: absence surfaces as the id-keyed
      // ProjectNotFoundError, while any other failure propagates unchanged.
      if (error instanceof ProjectFileNotFoundError) {
        throw new ProjectNotFoundError(id)
      }
      throw error
    }
  }

  async list(): Promise<ProjectSummary[]> {
    const summaries: ProjectSummary[] = []
    for (const id of await this.root.list('')) {
      const summary = await this.summaryFor(id)
      if (summary !== undefined) {
        summaries.push(summary)
      }
    }
    return summaries
  }

  private async summaryFor(id: string): Promise<ProjectSummary | undefined> {
    const bytes = await this.root.readFile(`${id}/${PROJECT_FILE}`)
    if (bytes === undefined) {
      return undefined
    }
    const name = readProjectName(parseProjectJson(bytes))
    if (name === undefined) {
      return undefined
    }
    return { id, name }
  }

  async delete(id: string): Promise<void> {
    await this.removeSubtree(id)
  }

  private async removeSubtree(prefix: string): Promise<void> {
    for (const child of await this.root.list(prefix)) {
      const childPath = prefix === '' ? child : `${prefix}/${child}`
      // Relies on the DirectoryPort.list leaf invariant: listing a stored file
      // yields [], so a non-empty listing marks a directory to recurse into and
      // an empty listing marks a file to remove.
      if ((await this.root.list(childPath)).length > 0) {
        await this.removeSubtree(childPath)
      } else {
        await this.root.removeFile(childPath)
      }
    }
  }
}
