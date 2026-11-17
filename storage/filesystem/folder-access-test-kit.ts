import type { FolderHandles, RememberedFolder } from './folder-access'
import { BrowserFolderAccess } from './folder-access'

/** The descriptor that every permission call of the folder access passes. */
export const READ_WRITE = { mode: 'readwrite' }
export const FIRST_ID = 'a'
export const SECOND_ID = 'b'

/** How a stand-in call fails: with `error`, either as a rejection or by throwing at once. */
export interface Failure {
  readonly error: unknown
  readonly synchronously?: boolean
}

/** What a stand-in handle answers, and which of its calls fail. */
export interface StandInBehavior {
  readonly query?: PermissionState
  readonly request?: PermissionState
  readonly failing?: {
    readonly isSameEntry?: Failure
    readonly query?: Failure
    readonly request?: Failure
  }
}

/** Gives the answer, or fails the way the failure says. */
function settle<T>(failure: Failure | undefined, answer: T): Promise<T> {
  if (failure === undefined) return Promise.resolve(answer)
  if (failure.synchronously === true) throw failure.error
  return Promise.reject(failure.error)
}

/** Test support: a stand-in for a directory handle that records how it was asked for permission. */
export class StandInHandle {
  readonly kind = 'directory'
  readonly name = 'folder'
  readonly queried: unknown[] = []
  readonly requested: unknown[] = []

  constructor(
    private readonly entry: string,
    private readonly behavior: StandInBehavior = {},
  ) {}

  isSameEntry(other: unknown): Promise<boolean> {
    const same = other instanceof StandInHandle && other.entry === this.entry
    return settle(this.behavior.failing?.isSameEntry, same)
  }

  queryPermission(descriptor: unknown): Promise<PermissionState> {
    this.queried.push(descriptor)
    return settle(this.behavior.failing?.query, this.behavior.query ?? 'granted')
  }

  requestPermission(descriptor: unknown): Promise<PermissionState> {
    this.requested.push(descriptor)
    return settle(this.behavior.failing?.request, this.behavior.request ?? 'granted')
  }

  asHandle(): FileSystemDirectoryHandle {
    return this as unknown as FileSystemDirectoryHandle
  }
}

/**
 * Test support: remembered handles in a map; `entries` lists them in the order they were put.
 * A store that is told to fail rejects `get` or `entries` with the given error.
 */
export class MapHandles implements FolderHandles {
  readonly stored = new Map<string, FileSystemDirectoryHandle>()

  constructor(private readonly failing: { get?: Error; entries?: Error } = {}) {}

  put(id: string, handle: FileSystemDirectoryHandle): Promise<void> {
    this.stored.set(id, handle)
    return Promise.resolve()
  }

  get(id: string): Promise<FileSystemDirectoryHandle | undefined> {
    if (this.failing.get !== undefined) return Promise.reject(this.failing.get)
    return Promise.resolve(this.stored.get(id))
  }

  remove(id: string): Promise<void> {
    this.stored.delete(id)
    return Promise.resolve()
  }

  entries(): Promise<RememberedFolder[]> {
    if (this.failing.entries !== undefined) return Promise.reject(this.failing.entries)
    return Promise.resolve([...this.stored].map(([id, handle]) => ({ id, handle })))
  }
}

/** Handles that already remember the stand-in under the id, and the access over them. */
export async function accessRemembering(
  id: string,
  stand: StandInHandle,
): Promise<BrowserFolderAccess> {
  const handles = new MapHandles()
  await handles.put(id, stand.asHandle())
  return new BrowserFolderAccess(handles)
}
