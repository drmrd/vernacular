import type { FolderFiles } from '../project-files/folder-files'

/** How the application reaches the folders that the user picked. */
export interface FolderAccess {
  /** True when the host can show a folder picker. */
  readonly supported: boolean
  /** Shows the browser's folder picker; undefined when the user cancels. */
  pick(): Promise<FileSystemDirectoryHandle | undefined>
  /** The id of a known folder that is the same entry as `handle`. */
  findKnown(handle: FileSystemDirectoryHandle): Promise<string | undefined>
  /** Remembers the folder under `id`, so that a later session can reopen it. */
  remember(id: string, handle: FileSystemDirectoryHandle): Promise<void>
  /** Drops the folder remembered under `id`. */
  forget(id: string): Promise<void>
  /**
   * The state of read and write access to the folder remembered under `id`, as the browser
   * reports it; 'missing' when no folder is remembered under that id, and also when the browser
   * cannot answer for the folder.
   */
  permission(id: string): Promise<'granted' | 'prompt' | 'denied' | 'missing'>
  /**
   * After a user gesture: requests access and returns the folder's files. The answer is 'missing'
   * when no folder is remembered under `id` or the browser cannot find it, and 'denied' when the
   * request is not granted, also for a request with no user gesture. Any other error of the
   * request rejects.
   */
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
