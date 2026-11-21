import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isStored } from '../session'
import type { DocumentHandle, SessionPorts, SwitchFailure } from '../session'
import { parseAddress } from './address'
import type { AddressBar } from './address-bar'
import { beginRead, follow, settle } from './follow-address'
import { leavePage, retryNotice, runFlowOf, startFresh } from './navigation-actions'
import {
  currentPlace,
  initialPage,
  newNavigationMemory,
  takeCommitted,
  type NavigationMemory,
  type ShownPage,
  type StartEntry,
} from './navigation-memory'
import type { Screen } from './resolve-place'
import { useOpenProject, type RunFlow } from './use-open-project'

/** The open project and what shows, following the address of the page through its history. */
export interface HistoryNavigation {
  /** What shows. Null while the start, a retry, or the first read of the index runs. */
  readonly screen: Screen | null
  /** The open project, also while the page shows over it. */
  readonly handle: DocumentHandle | null
  /** Runs a flow of the editor. A project that it opens gets a new history entry. */
  readonly runFlow: RunFlow
  /** Tries again what the notice says did not work. Call it inside the click. */
  readonly retry: () => void
  /** Leaves the page: back to the open project, or to the start when none is open. */
  readonly leavePage: () => void
  /** Starts a new project under a new id and leaves every stored project alone. */
  readonly startFresh: () => void
}

interface ScreenParts {
  readonly handle: DocumentHandle | null
  readonly failure: SwitchFailure | null
  readonly page: ShownPage | null
  readonly tried: string | null
}

function pageScreen(page: ShownPage): Screen {
  return page.notice === undefined
    ? { kind: 'projects' }
    : { kind: 'projects', notice: page.notice }
}

function screenOf({ handle, failure, page, tried }: ScreenParts): Screen | null {
  if (handle !== null) {
    return page === null ? { kind: 'editor', handle } : pageScreen(page)
  }
  if (page !== null) {
    return { kind: 'projects' }
  }
  if (failure !== null) {
    return { kind: 'projects', notice: { id: tried ?? '', failure } }
  }
  return null
}

/** The first request for the ports: one given for any ports, or one read on these ports. */
function firstRequestOf(entry: StartEntry | null, ports: SessionPorts | null) {
  return entry !== null && (entry.ports === null || entry.ports === ports) ? entry.request : null
}

/** Tells the navigation when the open project is first stored, so its address can be written. */
function useStoredSignal(handle: DocumentHandle | null, bump: () => void): void {
  useEffect(() => {
    if (handle === null || isStored(handle)) {
      return
    }
    return handle.subscribe(() => {
      if (isStored(handle)) bump()
    })
  }, [handle, bump])
}

/** Listens to the moves of the user, and replaces an address that is not exact at the mount. */
function useAddressListener(memory: NavigationMemory, address: AddressBar): void {
  useEffect(() => {
    memory.address = address
    memory.live = true
    currentPlace(address)
    const stop = address.onNavigate(() => follow(memory))
    return () => {
      memory.live = false
      stop()
    }
  }, [memory, address])
}

/** Reads the first request of the address once for each ports, unless a new project waits for them. */
function useFirstRead(memory: NavigationMemory, ports: SessionPorts | null): void {
  useEffect(() => {
    const waiting = memory.given !== null && memory.given.ports === null
    if (ports === null || waiting) {
      return
    }
    beginRead(memory, ports, parseAddress(memory.address.hash()))
    return () => {
      memory.reading = null
    }
  }, [memory, ports])
}

/**
 * Follows project addresses through the browser history on top of the owner of the open project.
 * The address follows the open project, and the open project follows the address after the user
 * moved through the history or edited it.
 */
export function useHistoryNavigation(
  ports: SessionPorts | null,
  address: AddressBar,
): HistoryNavigation {
  const [page, setPage] = useState<ShownPage | null>(() => initialPage(address))
  const [entry, setEntry] = useState<StartEntry | null>(null)
  const [, setStep] = useState(0)
  const bump = useCallback(() => setStep((step) => step + 1), [])
  const owner = useOpenProject(ports, firstRequestOf(entry, ports))
  const memoryRef = useRef<NavigationMemory | null>(null)
  memoryRef.current ??= newNavigationMemory(address, { setPage, setEntry, bump }, owner)
  const memory = memoryRef.current
  const { handle, failure } = owner
  useEffect(
    () => takeCommitted(memory, { ports, handle, failure }),
    [memory, ports, handle, failure],
  )
  useAddressListener(memory, address)
  useFirstRead(memory, ports)
  useStoredSignal(handle, bump)
  useEffect(() => settle(memory))
  const actions = useMemo(
    () => ({
      runFlow: runFlowOf(memory),
      retry: () => retryNotice(memory),
      leavePage: () => leavePage(memory),
      startFresh: () => startFresh(memory),
    }),
    [memory],
  )
  const screen = screenOf({ handle, failure, page, tried: memory.tried })
  return { screen, handle, ...actions }
}
