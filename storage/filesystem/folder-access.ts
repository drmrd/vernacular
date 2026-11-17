import type { AssetCache } from '../asset-cache'
import { FileSystemDirectory } from '../fs/file-system-directory'
import { FolderFiles } from '../project-files/folder-files'
import { DirectoryHandleStore } from './directory-handle-store'
import type { FolderAccess, FolderHandles, RememberedFolder } from './folder-access-types'

export type { FolderAccess, FolderHandles, RememberedFolder } from './folder-access-types'
export { InMemoryFolderAccess } from './in-memory-folder-access'

const READ_WRITE = { mode: 'readwrite' } as const

/** The `name` of a thrown value, read without assuming that it is an Error instance. */
function errorName(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'name' in error ? error.name : undefined
}

/** The answer for a failed access request, or undefined when the failure is not one to answer. */
function answerForRequestFailure(error: unknown): 'denied' | 'missing' | undefined {
  const name = errorName(error)
  if (name === 'SecurityError' || name === 'NotAllowedError') {
    return 'denied'
  }
  return name === 'NotFoundError' ? 'missing' : undefined
}

/** Orders folders by id in code-unit order. */
function byId(a: RememberedFolder, b: RememberedFolder): number {
  if (a.id === b.id) {
    return 0
  }
  return a.id < b.id ? -1 : 1
}

/** Whether the two are the same entry; a handle that cannot answer is not the same entry. */
async function isSameEntryOrFalse(
  known: FileSystemDirectoryHandle,
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  try {
    return await known.isSameEntry(handle)
  } catch {
    return false
  }
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
      if (errorName(error) === 'AbortError') {
        return undefined
      }
      throw error
    }
  }

  async findKnown(handle: FileSystemDirectoryHandle): Promise<string | undefined> {
    const remembered = await this.handles.entries()
    const ascending = [...remembered].sort(byId)
    for (const folder of ascending) {
      if (await isSameEntryOrFalse(folder.handle, handle)) {
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
    try {
      return await handle.queryPermission(READ_WRITE)
    } catch {
      return 'missing'
    }
  }

  async reopen(id: string): Promise<FolderFiles | 'denied' | 'missing'> {
    const handle = await this.handles.get(id)
    if (handle === undefined) {
      return 'missing'
    }
    const answer = await this.requestAccess(handle)
    if (answer === 'denied' || answer === 'missing') {
      return answer
    }
    return new FolderFiles(id, new FileSystemDirectory(handle), {
      durable: true,
      ...this.options,
    })
  }

  /** 'granted' when the browser grants access; otherwise the answer that `reopen` gives. */
  private async requestAccess(
    handle: FileSystemDirectoryHandle,
  ): Promise<'granted' | 'denied' | 'missing'> {
    try {
      return (await handle.requestPermission(READ_WRITE)) === 'granted' ? 'granted' : 'denied'
    } catch (error) {
      const answer = answerForRequestFailure(error)
      if (answer === undefined) {
        throw error
      }
      return answer
    }
  }
}
