import { isStored } from '../session'
import type {
  DocumentHandle,
  FlowResult,
  OpenRequest,
  SessionPorts,
  SwitchFailure,
} from '../session'
import { addressFor, parseAddress, type Place } from './address'
import type { AddressBar } from './address-bar'
import type { PageNotice } from './resolve-place'
import type { Flow, RunFlow } from './use-open-project'

/** The page shown by the navigation, with the notice of a switch that failed or none. */
export interface ShownPage {
  readonly notice?: PageNotice
}

/** The first request of the open project, and the ports it was read on; null ports wait for any. */
export interface StartEntry {
  readonly ports: SessionPorts | null
  readonly request: OpenRequest
}

/** How the navigation tells React what to render. */
export interface NavigationView {
  setPage(page: ShownPage | null): void
  setEntry(entry: StartEntry): void
  /** Asks for one more render, so the address is checked again. */
  bump(): void
}

/** What the owner of the open project lends the navigation. */
export interface OwnerControls {
  readonly runFlow: RunFlow
  readonly retry: () => void
}

/** What keeps the navigation from following the address now. */
export interface NavigationBusy {
  /** The read of a first request that runs, as a token that its end is checked against. */
  reading: object | null
  /** True from a first request that the owner opens until the owner shows what it gave. */
  starting: boolean
  /** How many flows were handed to the owner and have not ended yet. */
  flowsRunning: number
}

/** What the navigation keeps between renders, read and written by its effects and callbacks. */
export interface NavigationMemory {
  address: AddressBar
  readonly view: NavigationView
  readonly owner: OwnerControls
  /** The ports, the open project, and the owner's failure of the latest commit. */
  ports: SessionPorts | null
  handle: DocumentHandle | null
  failure: SwitchFailure | null
  page: ShownPage | null
  /** True while the hook's effects are set up. */
  live: boolean
  readonly busy: NavigationBusy
  /** True when the user moved while something ran, so the address is followed after it. */
  addressLeads: boolean
  /** True when the next address write adds a history entry. */
  pushNext: boolean
  /** The place that the last move was followed to, while that outcome stands. */
  followed: Place | null
  /** The id that the owner tried last. */
  triedId: string | null
  /** The ports and the id of the latest first request. */
  given: { readonly ports: SessionPorts | null; readonly id: string } | null
  /** The ports whose index was reconciled already. */
  readonly reconciled: WeakSet<SessionPorts>
  /** The failure that a new project was already started for. */
  freshStartFor: { readonly failure: SwitchFailure | null } | null
}

/** The memory of a navigation that shows the page at once when its address names the page. */
export function newNavigationMemory(
  address: AddressBar,
  view: NavigationView,
  owner: OwnerControls,
): NavigationMemory {
  return {
    address,
    view,
    owner,
    ports: null,
    handle: null,
    failure: null,
    page: initialPage(address),
    live: false,
    busy: { reading: null, starting: false, flowsRunning: 0 },
    addressLeads: false,
    pushNext: false,
    followed: null,
    triedId: null,
    given: null,
    reconciled: new WeakSet(),
    freshStartFor: null,
  }
}

/** The page with no notice when the address names the page, else none. */
export function initialPage(address: AddressBar): ShownPage | null {
  return parseAddress(address.hash()).kind === 'projects' ? {} : null
}

/** True when two places are the same place. */
export function samePlace(first: Place, second: Place): boolean {
  return addressFor(first) === addressFor(second) && first.kind === second.kind
}

/** The place of the address now. A fragment that is not exact is replaced by the exact one. */
export function currentPlace(address: AddressBar): Place {
  const hash = address.hash()
  const place = parseAddress(hash)
  const exact = addressFor(place)
  if (hash !== exact) {
    address.replace(exact)
  }
  return place
}

/** The fragment that an open project wants: its address once it is stored and kept, else bare. */
export function wantedFragment(handle: DocumentHandle): string {
  const kept = isStored(handle) && handle.durable
  return kept ? addressFor({ kind: 'project', id: handle.id }) : ''
}

/** Records the page in the memory at once, so callbacks see it before the next render. */
export function showPage(memory: NavigationMemory, page: ShownPage | null): void {
  memory.page = page
  memory.view.setPage(page)
}

/** True while a first request is read, the owner opens one, or a flow runs. */
export function isBusy(memory: NavigationMemory): boolean {
  const ownerOpens = memory.handle === null && memory.failure === null && memory.given !== null
  const { reading, starting, flowsRunning } = memory.busy
  return reading !== null || starting || flowsRunning > 0 || ownerOpens
}

/**
 * The open project leads after a step of the user that is not a move: no move waits, and the next
 * address write adds an entry.
 */
export function projectLeads(memory: NavigationMemory): void {
  memory.addressLeads = false
  memory.pushNext = true
  memory.followed = null
}

/**
 * A flow gave another project, so the next address write adds an entry. A move made while it ran
 * still leads, which is why the address keeps leading.
 */
export function flowGaveProject(memory: NavigationMemory): void {
  memory.pushNext = true
  memory.followed = null
}

/** The user moved while something ran, so the address is followed when it ends. */
export function moveWaits(memory: NavigationMemory): void {
  memory.addressLeads = true
}

/**
 * The owner refused the flow of a place, so the place is followed when the running step ends, as a
 * place not followed yet.
 */
export function refusedPlaceWaits(memory: NavigationMemory): void {
  memory.addressLeads = true
  memory.followed = null
}

/** The address leads now, and the write that answers it replaces the present entry. */
export function addressLeadsNow(memory: NavigationMemory): void {
  memory.addressLeads = false
  memory.pushNext = false
}

/** Marks the owner as starting, unless it refuses because a flow runs. */
export function ownerRetries(memory: NavigationMemory): void {
  if (memory.busy.flowsRunning === 0) {
    memory.busy.starting = true
  }
}

/**
 * Hands a flow to the owner and keeps the navigation busy until it ends. A flow that the owner
 * refuses ends at once and leaves a flow that still runs busy. The count drops also when the owner
 * rejects.
 */
export async function runOwnerFlow<Refusal>(
  memory: NavigationMemory,
  flow: Flow<Refusal>,
): Promise<FlowResult<Refusal> | undefined> {
  memory.busy.flowsRunning += 1
  try {
    return await memory.owner.runFlow(flow)
  } finally {
    memory.busy.flowsRunning -= 1
  }
}

/**
 * Hands a first request to the owner. The owner opens it when no project is open and the ports or
 * the id differ from those of the request before.
 */
export function handFirstRequest(
  memory: NavigationMemory,
  ports: SessionPorts | null,
  request: OpenRequest,
): void {
  const before = memory.given
  const isNew = before === null || before.ports !== ports || before.id !== request.id
  memory.given = { ports, id: request.id }
  memory.triedId = request.id
  if (isNew && memory.handle === null) {
    memory.busy.starting = true
  }
  memory.view.setEntry({ ports, request })
}

/** What a commit shows. */
export interface Committed {
  readonly ports: SessionPorts | null
  readonly handle: DocumentHandle | null
  readonly failure: SwitchFailure | null
}

/** Takes what the latest commit shows. A new handle or failure ends the owner's open. */
export function takeCommitted(memory: NavigationMemory, committed: Committed): void {
  const { handle, failure } = committed
  const changed = handle !== memory.handle || failure !== memory.failure
  if (handle !== null && handle !== memory.handle) {
    memory.triedId = handle.id
  }
  if (changed && (handle !== null || failure !== null)) {
    memory.busy.starting = false
  }
  memory.ports = committed.ports
  memory.handle = handle
  memory.failure = failure
}

/**
 * Writes the fragment that the open project wants when the address names another place and no
 * page shows. The write adds an entry when one was asked for, and replaces the present one
 * otherwise.
 */
export function writeWantedAddress(memory: NavigationMemory): void {
  const { handle, address } = memory
  if (handle === null || memory.page !== null) {
    return
  }
  const wanted = wantedFragment(handle)
  const push = memory.pushNext
  memory.pushNext = false
  if (samePlace(parseAddress(address.hash()), parseAddress(wanted))) {
    return
  }
  if (push) {
    address.push(wanted)
  } else {
    address.replace(wanted)
  }
  memory.followed = null
}
