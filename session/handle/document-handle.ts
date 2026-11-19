import type { DocumentStore, ProjectLockHold } from '../../storage'
import { createAutosave } from '../autosave/create-autosave'
import { createEditorSession } from '../editor-session/editor-session'
import { messageOf } from './find-document-store'
import { createHandleNotices } from './handle-notices'
import type { DocumentHandle, OpenRequest, SaveOutcome, SaveStatus } from './handle-types'
import type { OpenedProject } from './read-for-open'

/** What an open found, from which a handle is built. */
export interface DocumentHandleParts {
  readonly request: OpenRequest
  readonly store: DocumentStore
  readonly hold: ProjectLockHold
  readonly opened: OpenedProject
}

interface SaveStatusCell {
  get(): SaveStatus
  set(status: SaveStatus): void
  subscribe(listener: () => void): () => void
}

const SAVED: SaveOutcome = { ok: true }

/** Calls the listener; an error it throws goes to the console, so the other listeners still run. */
function callListener(listener: () => void): void {
  try {
    listener()
  } catch (error) {
    console.error(error)
  }
}

/** The save status, which tells its listeners of each new value and of no repeated one. */
function createSaveStatusCell(): SaveStatusCell {
  let status: SaveStatus = 'idle'
  const listeners = new Set<() => void>()
  return {
    get: () => status,
    set(next) {
      if (next === status) {
        return
      }
      status = next
      for (const listener of [...listeners]) {
        callListener(listener)
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

function failedWith(error: unknown): SaveOutcome {
  return { ok: false, message: messageOf(error) }
}

/** Builds the handle of an opened project: its session, its autosave, its status, its notices. */
export function createDocumentHandle(parts: DocumentHandleParts): DocumentHandle {
  const { request, store, opened } = parts
  const session = createEditorSession(opened.project)
  const status = createSaveStatusCell()
  const notices = createHandleNotices()
  if (opened.savedByNewerBuild) {
    notices.raise('saved-by-newer-build')
  }
  const autosave = createAutosave({
    session,
    store,
    projectId: request.id,
    onStatusChange: status.set,
  })
  return {
    id: request.id,
    location: request.location,
    durable: store.durable,
    session,
    snapshots: store.snapshots(request.id),
    saveStatus: status.get,
    subscribe: status.subscribe,
    onNotice: notices.onNotice,
    save: () => autosave.save().then(() => SAVED, failedWith),
    flush: () => Promise.resolve(SAVED),
    close: () => Promise.resolve(SAVED),
  }
}
