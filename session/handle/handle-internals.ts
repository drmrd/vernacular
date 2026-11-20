import type { DocumentStore, ProjectLockHold } from '../../storage'
import type { RecordKeeper } from './handle-record'
import type { DocumentHandle, OpenRequest } from './handle-types'

/** The lock of a handle that ended and gave its lock away, or why it did not end. */
export type HandOver =
  | { readonly ok: true; readonly hold: ProjectLockHold }
  | { readonly ok: false; readonly message: string }

/** What the session layer keeps of a handle besides its public members. */
export interface HandleInternals {
  readonly request: OpenRequest
  readonly store: DocumentStore
  /** The record writes of the handle, which a restore passes on to the handle after it. */
  readonly records: RecordKeeper
  /** Ends the handle as a close does, keeps the lock, and gives it to the caller. */
  handOver(): Promise<HandOver>
}

const internalsByHandle = new WeakMap<DocumentHandle, HandleInternals>()

/** Records what the session layer keeps of a handle that it built. */
export function registerHandle(handle: DocumentHandle, internals: HandleInternals): void {
  internalsByHandle.set(handle, internals)
}

/** What the session layer keeps of the handle. Throws when the session layer did not build it. */
export function internalsOf(handle: DocumentHandle): HandleInternals {
  const internals = internalsByHandle.get(handle)
  if (internals === undefined) {
    throw new Error('This project handle was not opened by the session layer.')
  }
  return internals
}
