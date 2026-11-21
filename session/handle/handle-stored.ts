import { findInternals } from './handle-internals'
import type { DocumentHandle, SaveStatus } from './handle-types'

/** Whether the store holds the project of one handle. Once set, it stays set. */
export interface StoredFlag {
  get(): boolean
  /** Takes the status of a write; `saved` means the store holds the project. */
  noteStatus(status: SaveStatus): void
}

/** A flag that starts as given: a project that the store held, or one that a write has not reached. */
export function createStoredFlag(initial: boolean): StoredFlag {
  let stored = initial
  return {
    get: () => stored,
    noteStatus(status) {
      stored ||= status === 'saved'
    },
  }
}

/**
 * True when the store holds the project of the handle: the open read it from the store, or a
 * write of the handle was stored. False for a handle that the session layer did not build.
 */
export function isStored(handle: DocumentHandle): boolean {
  return findInternals(handle)?.stored() ?? false
}
