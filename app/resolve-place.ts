import type {
  DocumentHandle,
  OpenRequest,
  SessionPorts,
  SwitchFailure,
  SwitchResult,
} from '../session'
import { requestFor, startProject, switchProject } from '../session'
import type { Place } from './address'
import { createInitialProject } from './create-initial-project'
import { storageUnavailableOf } from './open-failure-text'

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

async function requestForPlace(ports: SessionPorts, place: Place): Promise<OpenRequest> {
  if (place.kind === 'project') {
    return requestFor(ports, place.id)
  }
  return startProject(ports, createInitialProject)
}

/** The id the notice names: the request's, else the address's own, else none (the bare start). */
function noticeIdOf(place: Place, request: OpenRequest | undefined): string {
  if (request !== undefined) {
    return request.id
  }
  return place.kind === 'project' ? place.id : ''
}

/** Brings the application to a place. The promise never rejects. */
export async function resolvePlace(ports: SessionPorts, place: Place): Promise<Screen> {
  if (place.kind === 'projects') {
    return { kind: 'projects' }
  }
  let request: OpenRequest | undefined
  try {
    request = await requestForPlace(ports, place)
    return screenOf(request.id, await switchProject(ports, undefined, request))
  } catch (error) {
    const id = noticeIdOf(place, request)
    return { kind: 'projects', notice: { id, failure: storageUnavailableOf(error) } }
  }
}
