import type { Project } from '../../core'
import { InMemoryDirectory } from '../fs/in-memory-directory'
import type { DirectoryPort } from '../fs/directory-port'
import { FolderProjectStore, PROJECT_FILE } from '../folder/folder-project-store'
import { parseProjectJson, readProjectName } from '../folder/project-json'
import { ProjectNotFoundError, type ProjectStore, type ProjectSummary } from '../project-store'
import { zipFolder, unzipFolder, type FolderEntries } from './zip-codec'

/** Collect every file path stored under a directory, descending into subdirectories. */
async function collectFilePaths(directory: DirectoryPort, prefix: string): Promise<string[]> {
  const paths: string[] = []
  for (const segment of await directory.list(prefix)) {
    const childPath = prefix === '' ? segment : `${prefix}/${segment}`
    const children = await directory.list(childPath)
    if (children.length === 0) {
      paths.push(childPath)
    } else {
      paths.push(...(await collectFilePaths(directory, childPath)))
    }
  }
  return paths
}

/**
 * Single-project ProjectStore bound to one id, backed by an in-memory expansion of a
 * .building bundle. Loading and saving delegate to a FolderProjectStore over the same
 * directory; exportBundle repacks the current directory contents into bundle bytes.
 */
export class ZipBundleProjectStore implements ProjectStore {
  private readonly folder: FolderProjectStore

  constructor(
    private readonly id: string,
    private readonly directory: InMemoryDirectory = new InMemoryDirectory(),
  ) {
    this.folder = new FolderProjectStore(this.directory)
  }

  static async fromBundle(id: string, bytes: Uint8Array): Promise<ZipBundleProjectStore> {
    const entries = unzipFolder(bytes)
    const directory = new InMemoryDirectory()
    for (const [path, content] of entries) {
      await directory.writeFile(path, content)
    }
    return new ZipBundleProjectStore(id, directory)
  }

  async list(): Promise<ProjectSummary[]> {
    if (!(await this.folder.exists())) {
      return []
    }
    const bytes = await this.directory.readFile(PROJECT_FILE)
    if (bytes === undefined) {
      return []
    }
    // Listing reads the stored name without upgrading the schema: parse the raw
    // document directly rather than migrating it, since no save happens here.
    const name = readProjectName(parseProjectJson(bytes)) ?? ''
    return [{ id: this.id, name }]
  }

  async load(id: string): Promise<Project> {
    this.assertBoundId(id)
    if (!(await this.folder.exists())) {
      throw new ProjectNotFoundError(id)
    }
    return this.folder.loadProject()
  }

  async save(id: string, project: Project): Promise<void> {
    this.assertBoundId(id)
    await this.folder.saveProject(project)
  }

  async delete(id: string): Promise<void> {
    this.assertBoundId(id)
    for (const path of await collectFilePaths(this.directory, '')) {
      await this.directory.removeFile(path)
    }
  }

  async exportBundle(): Promise<Uint8Array> {
    const entries: FolderEntries = new Map()
    for (const path of await collectFilePaths(this.directory, '')) {
      const content = await this.directory.readFile(path)
      if (content !== undefined) {
        entries.set(path, content)
      }
    }
    return zipFolder(entries)
  }

  private assertBoundId(id: string): void {
    if (id !== this.id) {
      throw new ProjectNotFoundError(id)
    }
  }
}
