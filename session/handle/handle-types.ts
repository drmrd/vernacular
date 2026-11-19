import type { DecodeFailure, Project } from '../../core'
import type { ProjectLocation, ProjectSnapshots } from '../../storage'
import type { EditorSession } from '../editor-session/editor-session'

/** Why a project did not open. */
export type OpenFailure =
  | { readonly kind: 'open-elsewhere' | 'not-found' | 'folder-permission' | 'folder-unavailable' }
  | { readonly kind: 'did-not-open'; readonly decode: DecodeFailure }
  | { readonly kind: 'storage-unavailable'; readonly message: string }

/** Whether the changes of an open project are stored. */
export type SaveStatus = 'idle' | 'pending' | 'saved' | 'error'

/** How a save ended: stored, or not stored with the reason. */
export type SaveOutcome = { readonly ok: true } | { readonly ok: false; readonly message: string }

/** Something the user should hear about an open project, given once for each handle. */
export type HandleNotice = 'saved-by-newer-build' | 'saved-with-faults'

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
  /** Stores the present project now. */
  save(): Promise<SaveOutcome>
  /** Stores the changes that are not stored yet. */
  flush(): Promise<SaveOutcome>
  /** Stores the changes, then ends autosave and frees the lock. */
  close(): Promise<SaveOutcome>
}

/** The handle of a project that opened, or why it did not open. */
export type OpenResult =
  | { readonly ok: true; readonly handle: DocumentHandle }
  | { readonly ok: false; readonly failure: OpenFailure }

/** Which project to open, and where it is kept. */
export interface OpenRequest {
  readonly id: string
  readonly location: ProjectLocation
  /** When set, a missing project starts from this document instead of failing. */
  readonly create?: () => Project
}
