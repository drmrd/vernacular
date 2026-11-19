import { DocumentStore } from '../../storage'
import type { SessionPorts } from '../ports'
import type { OpenFailure, OpenRequest } from './handle-types'

/** The store that holds a project, or why it cannot be reached. */
export type FoundStore =
  | { readonly ok: true; readonly store: DocumentStore }
  | { readonly ok: false; readonly failure: OpenFailure }

/** The message of a thrown value: the message of an Error, and the value as text otherwise. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** A failure for a step whose storage did not answer. */
export function storageUnavailable(error: unknown): {
  readonly ok: false
  readonly failure: OpenFailure
} {
  return { ok: false, failure: { kind: 'storage-unavailable', message: messageOf(error) } }
}

/**
 * The store of a folder. Access is asked of the browser only after it says that access is
 * granted, since a request needs a user gesture.
 */
async function findFolderStore(ports: SessionPorts, id: string): Promise<FoundStore> {
  const permission = await ports.folders.permission(id)
  if (permission === 'missing') {
    return { ok: false, failure: { kind: 'folder-unavailable' } }
  }
  if (permission !== 'granted') {
    return { ok: false, failure: { kind: 'folder-permission' } }
  }
  const files = await ports.folders.reopen(id)
  if (files === 'missing') {
    return { ok: false, failure: { kind: 'folder-unavailable' } }
  }
  if (files === 'denied') {
    return { ok: false, failure: { kind: 'folder-permission' } }
  }
  return { ok: true, store: new DocumentStore(files) }
}

/** Finds the store of the request's location. It never rejects. */
export async function findDocumentStore(
  ports: SessionPorts,
  request: OpenRequest,
): Promise<FoundStore> {
  if (request.location.kind === 'workspace') {
    return { ok: true, store: ports.workspace }
  }
  try {
    return await findFolderStore(ports, request.id)
  } catch (error) {
    return storageUnavailable(error)
  }
}
