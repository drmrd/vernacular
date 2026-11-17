import type { DirectoryPort } from '../fs/directory-port'
import { FolderFiles } from '../project-files/folder-files'
import type { FolderAccess } from './folder-access-types'

type PermissionState = 'granted' | 'prompt' | 'denied'

/**
 * Folder access for tests of the layers above: no browser API is touched. A stand-in handle
 * stands for one directory object, and two handles count as the same entry when they stand for
 * the same directory object.
 */
export class InMemoryFolderAccess implements FolderAccess {
  readonly supported: boolean
  private readonly directories = new WeakMap<FileSystemDirectoryHandle, DirectoryPort>()
  private readonly remembered = new Map<string, FileSystemDirectoryHandle>()
  private readonly permissions = new Map<string, PermissionState>()
  private nextPick: FileSystemDirectoryHandle | undefined

  constructor(options: { supported?: boolean } = {}) {
    this.supported = options.supported ?? true
  }

  /** Test control: a stand-in handle for that directory. */
  addFolder(directory: DirectoryPort): FileSystemDirectoryHandle {
    const handle = {} as FileSystemDirectoryHandle
    this.directories.set(handle, directory)
    return handle
  }

  /** Test control: what the next pick() gives; undefined means that the user cancels. */
  pickNext(handle: FileSystemDirectoryHandle | undefined): void {
    this.nextPick = handle
  }

  /** Test control: the permission state of a remembered folder. */
  setPermission(id: string, state: PermissionState): void {
    this.permissions.set(id, state)
  }

  pick(): Promise<FileSystemDirectoryHandle | undefined> {
    const handle = this.nextPick
    this.nextPick = undefined
    return Promise.resolve(handle)
  }

  findKnown(handle: FileSystemDirectoryHandle): Promise<string | undefined> {
    const directory = this.directories.get(handle)
    const ascending = [...this.remembered.keys()].sort()
    const found = ascending.find((id) => {
      const known = this.remembered.get(id)
      return known !== undefined && this.directories.get(known) === directory
    })
    return Promise.resolve(found)
  }

  remember(id: string, handle: FileSystemDirectoryHandle): Promise<void> {
    this.remembered.set(id, handle)
    return Promise.resolve()
  }

  forget(id: string): Promise<void> {
    this.remembered.delete(id)
    this.permissions.delete(id)
    return Promise.resolve()
  }

  permission(id: string): Promise<PermissionState | 'missing'> {
    if (!this.remembered.has(id)) {
      return Promise.resolve('missing')
    }
    return Promise.resolve(this.permissions.get(id) ?? 'granted')
  }

  reopen(id: string): Promise<FolderFiles | 'denied' | 'missing'> {
    const handle = this.remembered.get(id)
    const directory = handle === undefined ? undefined : this.directories.get(handle)
    if (directory === undefined) {
      return Promise.resolve('missing')
    }
    if (this.permissions.get(id) === 'denied') {
      return Promise.resolve('denied')
    }
    this.permissions.set(id, 'granted')
    return Promise.resolve(new FolderFiles(id, directory, { durable: true }))
  }
}
