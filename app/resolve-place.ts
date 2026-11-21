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

/** What shows in place of the application: the editor of a handle, or the page of projects. */
export type Screen =
  | { readonly kind: 'editor'; readonly handle: DocumentHandle }
  | { readonly kind: 'projects'; readonly notice?: PageNotice }

/** The screen that shows the page, with or without a notice. */
export type PageScreen = Extract<Screen, { readonly kind: 'projects' }>

function screenOf(id: string, result: SwitchResult): Screen {
  if (result.ok) {
    return { kind: 'editor', handle: result.handle }
  }
  return { kind: 'projects', notice: { id, failure: result.failure } }
}

/** The request that a place opens: its project's own, else the start request. */
export async function requestForPlace(ports: SessionPorts, place: Place): Promise<OpenRequest> {
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

/** True when the place is the one that the open project already holds. */
function isPlaceOf(current: DocumentHandle, place: Place): boolean {
  return place.kind === 'start' || (place.kind === 'project' && place.id === current.id)
}

/**
 * Brings the application to a place. With a project open, its own address and the start keep it,
 * and another address switches to the other project. The promise never rejects.
 */
export async function resolvePlace(
  ports: SessionPorts,
  place: Place,
  current?: DocumentHandle,
): Promise<Screen> {
  if (place.kind === 'projects') {
    return { kind: 'projects' }
  }
  if (current !== undefined && isPlaceOf(current, place)) {
    return { kind: 'editor', handle: current }
  }
  let request: OpenRequest | undefined
  try {
    request = await requestForPlace(ports, place)
    return screenOf(request.id, await switchProject(ports, current, request))
  } catch (error) {
    const id = noticeIdOf(place, request)
    return { kind: 'projects', notice: { id, failure: storageUnavailableOf(error) } }
  }
}
