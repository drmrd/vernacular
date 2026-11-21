import type { DocumentHandle, OpenRequest, SessionPorts, SwitchFailure } from '../session'
import { requestFor, startProject, switchProject } from '../session'
import type { SwitchResult } from '../session'
import type { Place } from './address'
import { createInitialProject } from './create-initial-project'
import { storageUnavailableOf } from './open-failure-text'

export { requestFor }

/** Why the page shows in place of a project, and for which id. */
export interface PageNotice {
  readonly id: string
  readonly failure: SwitchFailure
}

export type Screen =
  | { readonly kind: 'editor'; readonly handle: DocumentHandle }
  | { readonly kind: 'projects'; readonly notice?: PageNotice }

function screenOf(id: string, result: SwitchResult): Screen {
  if (result.ok) {
    return { kind: 'editor', handle: result.handle }
  }
  return { kind: 'projects', notice: { id, failure: result.failure } }
}

async function openRequest(ports: SessionPorts, place: Place): Promise<OpenRequest> {
  if (place.kind === 'project') {
    return requestFor(ports, place.id)
  }
  return startProject(ports, createInitialProject)
}

/** Brings the application to a place. The promise never rejects. */
export async function resolvePlace(
  ports: SessionPorts,
  place: Place,
  current?: DocumentHandle,
): Promise<Screen> {
  // A project that is open is not read yet.
  void current
  if (place.kind === 'projects') {
    return { kind: 'projects' }
  }
  let request: OpenRequest | undefined
  try {
    request = await openRequest(ports, place)
    return screenOf(request.id, await switchProject(ports, undefined, request))
  } catch (error) {
    const id = request?.id ?? (place.kind === 'project' ? place.id : '')
    return { kind: 'projects', notice: { id, failure: storageUnavailableOf(error) } }
  }
}
