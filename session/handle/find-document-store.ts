import { DocumentStore } from '../../storage'
import type { SessionPorts } from '../ports'
import type { OpenFailed, OpenRequest } from './handle-types'
import { storageUnavailable } from './thrown-failures'

/** The store that holds a project, or why it cannot be reached. */
export type FoundStore = { readonly ok: true; readonly store: DocumentStore } | OpenFailed

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
