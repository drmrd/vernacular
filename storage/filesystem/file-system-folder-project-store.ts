import { DocumentStore } from '../documents/document-store'
import type { DirectoryPort } from '../fs/directory-port'
import { FileSystemDirectory } from '../fs/file-system-directory'
import { FolderFiles } from '../project-files/folder-files'
import type { DirectoryHandleStore } from './directory-handle-store'

/**
 * Single-project store bound to one id: the project is the document at the root of a picked
 * folder. It is the document store over folder files, and it has no delete, so no method removes a
 * file from the folder. The native folder picker and the handle-permission flow are browser-only
 * seams that Playwright cannot drive, so `open` and `reopen` are validated manually.
 */
export class FileSystemFolderProjectStore extends DocumentStore {
  constructor(id: string, folder: DirectoryPort) {
    super(new FolderFiles(id, folder, { durable: true }))
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
    return new FileSystemFolderProjectStore(id, new FileSystemDirectory(handle))
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
    return new FileSystemFolderProjectStore(id, new FileSystemDirectory(handle))
  }
}
