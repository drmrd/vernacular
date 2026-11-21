import { openRecent, reconcileIndex, requestFor, startProject } from '../session'
import type { DocumentHandle, OpenRequest, SessionPorts, SwitchFailure } from '../session'
import type { Place } from './address'
import { createInitialProject } from './create-initial-project'
import {
  currentPlace,
  give,
  isBusy,
  samePlace,
  showPage,
  writeWantedAddress,
  type NavigationMemory,
} from './navigation-memory'
import { resolvePlace, type PageNotice, type Screen } from './resolve-place'
import type { Flow } from './use-open-project'

type PageScreen = Extract<Screen, { readonly kind: 'projects' }>
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
  memory.reading = token
  memory.followed = place
  void readFirstRequest(memory, ports, place).then((request) => {
    if (memory.reading !== token) {
      return
    }
    memory.reading = null
    if (request === null) {
      showPage(memory, {})
    } else {
      give(memory, ports, request)
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
 * after it.
 */
async function runPlaceFlow(
  memory: NavigationMemory,
  id: string,
  flow: Flow<PageScreen>,
): Promise<void> {
  memory.flowRunning = true
  const result = await memory.owner.runFlow(flow)
  memory.flowRunning = false
  if (!memory.live) {
    return
  }
  if (result === undefined) {
    memory.addressLeads = true
    memory.followed = null
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
  if (place.kind === 'project' && memory.failure !== null && memory.tried === place.id) {
    return
  }
  if (memory.ports !== null) {
    beginRead(memory, memory.ports, place)
  }
}

/**
 * Follows the address. While something runs, it is followed when that ends. A place that was
 * followed already is not followed again unless the follow is forced.
 */
export function follow(memory: NavigationMemory, forced = false): void {
  if (!memory.live) {
    return
  }
  const place = currentPlace(memory.address)
  if (isBusy(memory)) {
    memory.addressLeads = true
    return
  }
  memory.addressLeads = false
  memory.pushNext = false
  if (!forced && memory.followed !== null && samePlace(memory.followed, place)) {
    return
  }
  memory.followed = place
  if (memory.handle === null) {
    followWithNothingOpen(memory, place)
  } else {
    followWithProject(memory, place, memory.handle)
  }
}

/** After a render: follows an address that moved while something ran, or writes the wanted one. */
export function settle(memory: NavigationMemory): void {
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
