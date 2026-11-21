import { useEffect, useMemo, useRef, useState } from 'react'
import type { SessionPorts, SwitchFailure } from '../session'
import { InMemoryAssetCache, type AssetCache } from '../storage'
import type { AppProps } from './app'
import { createBrowserAddressBar, createMemoryAddressBar, type AddressBar } from './address-bar'
import {
  createSessionPorts,
  createTemporarySessionPorts,
  type BuiltSessionPorts,
} from './create-session-ports'
import { storageUnavailableOf } from './open-failure-text'
import { useHistoryNavigation, type HistoryNavigation } from './use-history-navigation'

export interface ProjectBoot {
  /** What shows and the open project, following the address of the page. */
  navigation: HistoryNavigation
  /** Why the ports did not resolve; null while they resolve and after they did. */
  portsFailure: SwitchFailure | null
  /** The ports that the owner uses; null until they are known. */
  ports: SessionPorts | null
  /** The pool of the user's library; null until the ports are known. */
  libraryAssets: AssetCache | null
  /** Builds the ports again after they did not resolve. */
  rebuildPorts: () => void
  /** Puts ports in memory in place of the ports that did not resolve, and starts a new project. */
  startInMemory: () => void
}

export type ProjectBootInputs = Pick<
  AppProps,
  'ports' | 'resolvePorts' | 'libraryAssets' | 'address'
>

interface BootPorts {
  built: BuiltSessionPorts | null
  /** Why the ports did not resolve; null while they resolve and after they did. */
  failure: SwitchFailure | null
  /** Builds the ports again after they did not resolve. */
  rebuild: () => void
  /** Puts ports in memory in place of the ports that did not resolve. */
  fallBackToMemory: () => void
}

// Builds the ports once when none are injected. A builder that rejects gives a failure that the
// boot shows itself, since the owner has no ports then. The ports are built again only by a Retry
// after such a failure: each attempt starts one build, also when the effect runs twice.
function useBootPorts(inputs: ProjectBootInputs): BootPorts {
  const { ports: provided, resolvePorts } = inputs
  const [built, setBuilt] = useState<BuiltSessionPorts | null>(null)
  const [failure, setFailure] = useState<SwitchFailure | null>(null)
  const [attempt, setAttempt] = useState(0)
  const startedAttempt = useRef<number | null>(null)
  useEffect(() => {
    if (provided !== undefined || startedAttempt.current === attempt) return
    startedAttempt.current = attempt
    const build = resolvePorts ?? createSessionPorts
    void Promise.resolve()
      .then(build)
      .then(setBuilt, (error: unknown) => setFailure(storageUnavailableOf(error)))
  }, [provided, resolvePorts, attempt])
  const rebuild = () => {
    setFailure(null)
    setAttempt((previous) => previous + 1)
  }
  const fallBackToMemory = () => {
    setFailure(null)
    setBuilt(createTemporarySessionPorts())
  }
  return { built, failure, rebuild, fallBackToMemory }
}

// The pool of the library: the injected one, the built one, or one in memory under injected ports.
function useLibraryAssets(inputs: ProjectBootInputs, built: BuiltSessionPorts | null) {
  const fallback = useMemo(() => new InMemoryAssetCache(), [])
  const injected = inputs.ports === undefined ? null : fallback
  return inputs.libraryAssets ?? built?.libraryAssets ?? injected
}

// The address bar of the mount: the injected one, the window's when the application builds its
// own ports, or one in memory under injected ports. Made once for each mount.
function useAddressBar(inputs: ProjectBootInputs): AddressBar {
  const [own] = useState<AddressBar>(() =>
    inputs.ports === undefined ? createBrowserAddressBar(window) : createMemoryAddressBar(),
  )
  return inputs.address ?? own
}

// Composes the start: the ports, the address bar, and the navigation over the one owner of the
// open project. It holds no handle itself.
export function useProjectBoot(inputs: ProjectBootInputs): ProjectBoot {
  const bootPorts = useBootPorts(inputs)
  const ports = inputs.ports ?? bootPorts.built?.ports ?? null
  const navigation = useHistoryNavigation(ports, useAddressBar(inputs))
  const answered = useRef<SwitchFailure | null>(null)
  const portsFailure = bootPorts.failure
  const startInMemory = () => {
    // A second call for the same failure, before the new project opened, does nothing.
    if (portsFailure === null || answered.current === portsFailure) return
    answered.current = portsFailure
    bootPorts.fallBackToMemory()
    navigation.startFresh()
  }
  const libraryAssets = useLibraryAssets(inputs, bootPorts.built)
  const rebuildPorts = bootPorts.rebuild
  return { navigation, portsFailure, ports, libraryAssets, rebuildPorts, startInMemory }
}
