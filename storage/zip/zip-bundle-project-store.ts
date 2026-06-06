import type { Project } from '../../core'
import { InMemoryDirectory } from '../fs/in-memory-directory'
import { FolderProjectStore, PROJECT_FILE } from '../folder/folder-project-store'
import { parseProjectJson } from '../folder/project-json'
import { ProjectNotFoundError, type ProjectStore, type ProjectSummary } from '../project-store'
import { zipFolder, unzipFolder, type FolderEntries } from './zip-codec'

/** Read meta.name from a parsed project, or '' when missing or non-string. */
function readProjectName(raw: unknown): string {
  if (typeof raw !== 'object' || raw === null) {
    return ''
  }
  const meta = (raw as { meta?: unknown }).meta
  if (typeof meta !== 'object' || meta === null) {
    return ''
  }
  const name = (meta as { name?: unknown }).name
  return typeof name === 'string' ? name : ''
}

/** Collect every file path stored under a directory, descending into subdirectories. */
async function collectFilePaths(directory: InMemoryDirectory, prefix: string): Promise<string[]> {
  const paths: string[] = []
  for (const segment of await directory.list(prefix)) {
    const childPath = prefix === '' ? segment : `${prefix}/${segment}`
    const grandchildren = await directory.list(childPath)
    if (grandchildren.length === 0) {
      paths.push(childPath)
    } else {
      paths.push(...(await collectFilePaths(directory, childPath)))
    }
  }
  return paths
}

/**
 * Single-project ProjectStore bound to one id, backed by an in-memory expansion of a
 * .house.zip bundle. Loading and saving delegate to a FolderProjectStore over the same
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
    const name = readProjectName(parseProjectJson(bytes))
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
        // Re-wrap so the bytes are a Uint8Array in this realm: jsdom's TextEncoder
        // yields a foreign-realm array that the zip codec would treat as a sub-folder.
        entries.set(path, new Uint8Array(content))
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
