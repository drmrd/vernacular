import type { Project } from '../../core'
import type { DirectoryPort } from '../fs/directory-port'
import { FileSystemDirectory } from '../fs/file-system-directory'
import {
  FolderProjectStore,
  PROJECT_FILE,
  ProjectFileNotFoundError,
} from '../folder/folder-project-store'
import { parseProjectJson, readProjectName } from '../folder/project-json'
import { ProjectNotFoundError, type ProjectStore, type ProjectSummary } from '../project-store'
import type { DirectoryHandleStore } from './directory-handle-store'

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
 * Single-project ProjectStore bound to one id, backed by a user-granted folder
 * handle through the File System Access API. Loading and saving delegate to a
 * FolderProjectStore over the same directory. The native folder picker and the
 * handle-permission flow are browser-only seams that Playwright cannot drive, so
 * this store is validated manually rather than by unit tests.
 */
export class FileSystemFolderProjectStore implements ProjectStore {
  private readonly directory: FileSystemDirectory
  private readonly folder: FolderProjectStore

  constructor(
    private readonly id: string,
    handle: FileSystemDirectoryHandle,
  ) {
    this.directory = new FileSystemDirectory(handle)
    this.folder = new FolderProjectStore(this.directory)
  }

  /**
   * Prompt the user to pick a folder, persist the handle for reopening, and
   * return a store bound to it. Browser-only (native picker); validated manually.
   */
  static async open(
    id: string,
    handles: DirectoryHandleStore,
  ): Promise<FileSystemFolderProjectStore> {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
    await handles.put(id, handle)
    return new FileSystemFolderProjectStore(id, handle)
  }

  /**
   * Reopen a previously picked folder, re-requesting permission. Returns
   * undefined when no stored handle exists or permission is denied.
   */
  static async reopen(
    id: string,
    handles: DirectoryHandleStore,
  ): Promise<FileSystemFolderProjectStore | undefined> {
    const handle = await handles.get(id)
    if (handle === undefined) {
      return undefined
    }
    const permission = await handle.requestPermission({ mode: 'readwrite' })
    if (permission !== 'granted') {
      return undefined
    }
    return new FileSystemFolderProjectStore(id, handle)
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
    try {
      return await this.folder.loadProject()
    } catch (error) {
      // A single read decides presence: absence surfaces as the id-keyed
      // ProjectNotFoundError, while any other failure propagates unchanged.
      if (error instanceof ProjectFileNotFoundError) {
        throw new ProjectNotFoundError(id)
      }
      throw error
    }
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

  private assertBoundId(id: string): void {
    if (id !== this.id) {
      throw new ProjectNotFoundError(id)
    }
  }
}
