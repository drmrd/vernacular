import type { FolderFiles } from '../project-files/folder-files'

/** How the application reaches the folders that the user picked. */
export interface FolderAccess {
  readonly supported: boolean
  /** Shows the browser's folder picker; undefined when the user cancels. */
  pick(): Promise<FileSystemDirectoryHandle | undefined>
  /** The id of a known folder that is the same entry as `handle`. */
  findKnown(handle: FileSystemDirectoryHandle): Promise<string | undefined>
  remember(id: string, handle: FileSystemDirectoryHandle): Promise<void>
  forget(id: string): Promise<void>
  permission(id: string): Promise<'granted' | 'prompt' | 'denied' | 'missing'>
  /** After a user gesture: requests access and returns the folder's files. */
  reopen(id: string): Promise<FolderFiles | 'denied' | 'missing'>
}

/** One folder that the store remembers, with the id it is remembered under. */
export interface RememberedFolder {
  readonly id: string
  readonly handle: FileSystemDirectoryHandle
}

/** What the browser access needs from the store of remembered handles. */
export interface FolderHandles {
  put(id: string, handle: FileSystemDirectoryHandle): Promise<void>
  get(id: string): Promise<FileSystemDirectoryHandle | undefined>
  remove(id: string): Promise<void>
  entries(): Promise<RememberedFolder[]>
}
