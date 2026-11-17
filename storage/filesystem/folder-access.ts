import type { AssetCache } from '../asset-cache'
import { FileSystemDirectory } from '../fs/file-system-directory'
import { FolderFiles } from '../project-files/folder-files'
import { DirectoryHandleStore } from './directory-handle-store'
import type { FolderAccess, FolderHandles, RememberedFolder } from './folder-access-types'

export type { FolderAccess, FolderHandles, RememberedFolder } from './folder-access-types'
export { InMemoryFolderAccess } from './in-memory-folder-access'

const READ_WRITE = { mode: 'readwrite' } as const

/** True for the rejection that the picker gives when the user cancels. */
function isAbort(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
  )
}

/** Orders folders by id in code-unit order. */
function byId(a: RememberedFolder, b: RememberedFolder): number {
  if (a.id === b.id) {
    return 0
  }
  return a.id < b.id ? -1 : 1
}

/** Folder access through the browser's directory picker and the store of remembered handles. */
export class BrowserFolderAccess implements FolderAccess {
  constructor(
    private readonly handles: FolderHandles = new DirectoryHandleStore(),
    private readonly options: { shared?: AssetCache } = {},
  ) {}

  get supported(): boolean {
    return typeof window.showDirectoryPicker === 'function'
  }

  async pick(): Promise<FileSystemDirectoryHandle | undefined> {
    try {
      return await window.showDirectoryPicker(READ_WRITE)
    } catch (error) {
      if (isAbort(error)) {
        return undefined
      }
      throw error
    }
  }

  async findKnown(handle: FileSystemDirectoryHandle): Promise<string | undefined> {
    const remembered = await this.handles.entries()
    const ascending = [...remembered].sort(byId)
    for (const folder of ascending) {
      if (await folder.handle.isSameEntry(handle)) {
        return folder.id
      }
    }
    return undefined
  }

  remember(id: string, handle: FileSystemDirectoryHandle): Promise<void> {
    return this.handles.put(id, handle)
  }

  forget(id: string): Promise<void> {
    return this.handles.remove(id)
  }

  async permission(id: string): Promise<'granted' | 'prompt' | 'denied' | 'missing'> {
    const handle = await this.handles.get(id)
    if (handle === undefined) {
      return 'missing'
    }
    return handle.queryPermission(READ_WRITE)
  }

  async reopen(id: string): Promise<FolderFiles | 'denied' | 'missing'> {
    const handle = await this.handles.get(id)
    if (handle === undefined) {
      return 'missing'
    }
    if ((await handle.requestPermission(READ_WRITE)) !== 'granted') {
      return 'denied'
    }
    return new FolderFiles(id, new FileSystemDirectory(handle), {
      durable: true,
      ...this.options,
    })
  }
}
