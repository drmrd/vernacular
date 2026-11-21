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
 * True once the store held the project at the open, the handle that this one replaced said so, or a
 * write of the handle reported saved. False for a handle that the session layer did not build.
 */
export function isStored(handle: DocumentHandle): boolean {
  return findInternals(handle)?.stored() ?? false
}
