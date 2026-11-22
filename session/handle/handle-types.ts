import type { DecodeFailure, Project, RepairOffer } from '../../core'
import type { ProjectLocation, ProjectSnapshots } from '../../storage'
import type { AutosaveStatus } from '../autosave/create-autosave'
import type { EditorSession } from '../editor-session/editor-session'

/** Why a project did not open. */
export type OpenFailure =
  | { readonly kind: 'open-elsewhere' | 'not-found' | 'folder-permission' | 'folder-unavailable' }
  | {
      readonly kind: 'did-not-open'
      readonly decode: DecodeFailure
      /** A repair that would let the document open, when there is one. */
      readonly repair?: RepairOffer
    }
  | { readonly kind: 'storage-unavailable'; readonly message: string }

/** Whether the changes of an open project are stored, and whether the store outlives the tab. */
export type SaveStatus = AutosaveStatus | 'tab-only'

/** How a save ended: stored, or not stored with the reason. */
export type SaveOutcome = { readonly ok: true } | { readonly ok: false; readonly message: string }

/** Something the user should hear about an open project, given once for each handle. */
export type HandleNotice =
  | 'saved-by-newer-build'
  | 'saved-with-faults'
  | 'recovery-copy-kept'
  | 'saved-in-second-file'
  | 'unreadable-file-replaced'

/** One open project: its session, its save state, and the lock that keeps it in this tab. */
export interface DocumentHandle {
  readonly id: string
  readonly location: ProjectLocation
  /** True when the store keeps the project after the browser closes. */
  readonly durable: boolean
  readonly session: EditorSession
  readonly snapshots: ProjectSnapshots
  /** The present save status. */
  saveStatus(): SaveStatus
  /** Calls the listener each time the save status changes. Returns a function that removes it. */
  subscribe(listener: () => void): () => void
  /** Delivers each notice once. Returns a function that removes the listener. */
  onNotice(listener: (notice: HandleNotice) => void): () => void
  /** Stores the present project now, also when nothing changed. Resolves not ok when that write
   *  fails or when the handle is closed. Never rejects. */
  save(): Promise<SaveOutcome>
  /** Stores what may be unsaved: a change not stored yet, or the state after a write that failed.
   *  Then waits for the writes that run or wait and resolves with the outcome of the last of them,
   *  or not ok when the handle is closed. Never rejects. */
  flush(): Promise<SaveOutcome>
  /** Writes until nothing is unsaved and no write runs or waits, then ends autosave and frees the
   *  lock. When a write fails it resolves not ok, and the handle stays open with the lock. Calls
   *  that overlap share one attempt; on a closed handle it resolves ok and does nothing. */
  close(): Promise<SaveOutcome>
}

/** How a handle is opened, beyond which project. */
export interface OpenOptions {
  /** True for a handle that no editor shows: its saves write no recovery snapshot, remove none. */
  readonly leaveSnapshots?: boolean
}

/** An open that failed, with the reason. */
export interface OpenFailed {
  readonly ok: false
  readonly failure: OpenFailure
}

/** The handle of a project that opened, or why it did not open. */
export type OpenResult = { readonly ok: true; readonly handle: DocumentHandle } | OpenFailed

/** Which project to open, and where it is kept. */
export interface OpenRequest {
  readonly id: string
  readonly location: ProjectLocation
  /** When set, a missing project starts from this document instead of failing. */
  readonly create?: () => Project
}
