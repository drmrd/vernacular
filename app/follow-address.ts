import { openRecent, reconcileIndex, requestFor, startProject } from '../session'
import type { DocumentHandle, OpenRequest, SessionPorts, SwitchFailure } from '../session'
import type { Place } from './address'
import { createInitialProject } from './create-initial-project'
import {
  currentPlace,
  handFirstRequest,
  isBusy,
  addressLeadsNow,
  moveWaits,
  refusedPlaceWaits,
  runOwnerFlow,
  samePlace,
  showPage,
  writeWantedAddress,
  type NavigationMemory,
} from './navigation-memory'
import { resolvePlace, type PageNotice, type PageScreen } from './resolve-place'
import type { Flow } from './use-open-project'

type ProjectPlace = Extract<Place, { readonly kind: 'project' }>

/** The start request, or the request of a project address. The page has no request. */
async function readFirstRequest(
  memory: NavigationMemory,
  ports: SessionPorts,
  place: Place,
): Promise<OpenRequest | null> {
  if (place.kind === 'project') {
    if (!memory.reconciled.has(ports)) {
      await reconcileIndex(ports)
      memory.reconciled.add(ports)
    }
    return requestFor(ports, place.id)
  }
  if (place.kind === 'projects') {
    return null
  }
  const request = await startProject(ports, createInitialProject)
  memory.reconciled.add(ports)
  return request
}

/** Reads the first request of a place and hands it to the owner. A read that was replaced sets nothing. */
export function beginRead(memory: NavigationMemory, ports: SessionPorts, place: Place): void {
  const token = {}
  memory.busy.reading = token
  memory.followed = place
  void readFirstRequest(memory, ports, place).then((request) => {
    if (memory.busy.reading !== token) {
      return
    }
    memory.busy.reading = null
    if (request === null) {
      showPage(memory, {})
    } else {
      handFirstRequest(memory, ports, request)
    }
    memory.view.bump()
  })
}

/** A flow that brings the open project to a project place, and gives the page when it fails. */
function placeFlow(place: ProjectPlace): Flow<PageScreen> {
  return async (ports, current) => {
    const screen = await resolvePlace(ports, place, current)
    return screen.kind === 'editor'
      ? { ok: true, handle: screen.handle }
      : { ok: false, failure: screen }
  }
}

function noticeOf(id: string, failure: SwitchFailure | PageScreen): PageNotice | undefined {
  return failure.kind === 'projects' ? failure.notice : { id, failure }
}

/**
 * Runs a flow that may open the project of the id. When a project stays open and the flow fails,
 * the page shows with the notice. When the owner runs something else, the address is followed
 * after it. It does not reject: the owner gives storage-unavailable for a flow that throws, so the
 * callers drop its promise.
 */
async function runPlaceFlow(
  memory: NavigationMemory,
  id: string,
  flow: Flow<PageScreen>,
): Promise<void> {
  const result = await runOwnerFlow(memory, flow)
  if (!memory.live) {
    return
  }
  if (result === undefined) {
    refusedPlaceWaits(memory)
    return
  }
  if (result.ok) {
    showPage(memory, null)
  } else if (memory.handle !== null) {
    const notice = noticeOf(id, result.failure)
    showPage(memory, notice === undefined ? {} : { notice })
  }
  memory.view.bump()
}

function followWithProject(memory: NavigationMemory, place: Place, handle: DocumentHandle): void {
  if (place.kind === 'project' && place.id !== handle.id) {
    void runPlaceFlow(memory, place.id, placeFlow(place))
    return
  }
  if (place.kind === 'projects') {
    showPage(memory, {})
    return
  }
  showPage(memory, null)
  memory.view.bump()
}

function followWithNothingOpen(memory: NavigationMemory, place: Place): void {
  if (place.kind === 'projects') {
    showPage(memory, {})
    return
  }
  showPage(memory, null)
  if (place.kind === 'project' && memory.failure !== null && memory.triedId === place.id) {
    return
  }
  if (memory.ports !== null) {
    beginRead(memory, memory.ports, place)
  }
}

function followPlace(memory: NavigationMemory, place: Place): void {
  memory.followed = place
  if (memory.handle === null) {
    followWithNothingOpen(memory, place)
  } else {
    followWithProject(memory, place, memory.handle)
  }
}

/** Takes the address into account while nothing runs, and tells whether a place is to be followed. */
function readyToFollow(memory: NavigationMemory): Place | null {
  if (!memory.live) {
    return null
  }
  const place = currentPlace(memory.address)
  if (isBusy(memory)) {
    moveWaits(memory)
    return null
  }
  addressLeadsNow(memory)
  return place
}

/**
 * Follows the address. While something runs, it is followed when that ends. A place that was
 * followed already is not followed again.
 */
export function follow(memory: NavigationMemory): void {
  const place = readyToFollow(memory)
  if (place === null || (memory.followed !== null && samePlace(memory.followed, place))) {
    return
  }
  followPlace(memory, place)
}

/** Follows the address again, also when its place was followed already. */
export function followAgain(memory: NavigationMemory): void {
  const place = readyToFollow(memory)
  if (place !== null) {
    followPlace(memory, place)
  }
}

/** After a render: follows an address that moved while something ran, or writes the wanted one. */
export function afterRender(memory: NavigationMemory): void {
  if (!memory.live || isBusy(memory)) {
    return
  }
  if (memory.addressLeads) {
    follow(memory)
    return
  }
  writeWantedAddress(memory)
}

/** Opens the project of the id from its record, inside the click, so the browser may ask. */
export function reopenFolder(memory: NavigationMemory, id: string): void {
  void runPlaceFlow(memory, id, (ports, current) => openRecent(ports, current, id))
}
