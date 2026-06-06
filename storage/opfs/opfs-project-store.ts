import type { Project } from '../../core'
import { FolderProjectStore } from '../folder/folder-project-store'
import { parseProjectJson } from '../folder/project-json'
import type { ProjectStore, ProjectSummary } from '../project-store'
import { ProjectNotFoundError } from '../project-store'
import type { DirectoryPort } from '../fs/directory-port'
import { SubdirectoryPort } from '../fs/subdirectory-port'

const PROJECT_FILE = 'project.json'

/** Read meta.name from a parsed project; it is a string on a valid project. */
function readProjectName(raw: unknown): string {
  return (raw as { meta: { name: string } }).meta.name
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
    const folder = this.folderFor(id)
    if (!(await folder.exists())) {
      throw new ProjectNotFoundError(id)
    }
    return folder.loadProject()
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
    return { id, name: readProjectName(parseProjectJson(bytes)) }
  }

  async delete(id: string): Promise<void> {
    await this.removeSubtree(id)
  }

  private async removeSubtree(prefix: string): Promise<void> {
    for (const child of await this.root.list(prefix)) {
      const childPath = prefix === '' ? child : `${prefix}/${child}`
      if ((await this.root.list(childPath)).length > 0) {
        await this.removeSubtree(childPath)
      } else {
        await this.root.removeFile(childPath)
      }
    }
  }
}
