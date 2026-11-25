import { useEffect, useMemo, useRef, useState } from 'react'
import type { SessionPorts } from '../session'
import { InMemoryAssetCache, type AssetCache } from '../storage'
import type { AppProps } from './app'
import { createBrowserAddressBar, createMemoryAddressBar, type AddressBar } from './address-bar'
import {
  createSessionPorts,
  createTemporarySessionPorts,
  type BuiltSessionPorts,
} from './create-session-ports'
import { useHistoryNavigation, type HistoryNavigation } from './use-history-navigation'

const TEMPORARY_PORTS_WARNING =
  'The storage of this browser was not found. Projects stay in this tab.'

export interface ProjectBoot {
  /** What shows and the open project, following the address of the page. */
  navigation: HistoryNavigation
  /** The ports that the owner uses; null until they are known. */
  ports: SessionPorts | null
  /** The pool of the user's library; null until the ports are known. */
  libraryAssets: AssetCache | null
}

export type ProjectBootInputs = Pick<
  AppProps,
  'ports' | 'resolvePorts' | 'libraryAssets' | 'address'
>

// Builds the ports once when none are injected. A builder that rejects gives ports in memory at
// once, with one console warning, so the application works and says so by its banner.
function useBootPorts(inputs: ProjectBootInputs): BuiltSessionPorts | null {
  const { ports: provided, resolvePorts } = inputs
  const [built, setBuilt] = useState<BuiltSessionPorts | null>(null)
  const started = useRef(false)
  useEffect(() => {
    if (provided !== undefined || started.current) return
    started.current = true
    const build = resolvePorts ?? createSessionPorts
    void Promise.resolve()
      .then(build)
      .then(setBuilt, (error: unknown) => {
        console.warn(TEMPORARY_PORTS_WARNING, error)
        setBuilt(createTemporarySessionPorts())
      })
  }, [provided, resolvePorts])
  return built
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

/**
 * Composes the start: the ports, the address bar, and the navigation over the one owner of the
 * open project. It holds no handle itself.
 */
export function useProjectBoot(inputs: ProjectBootInputs): ProjectBoot {
  const built = useBootPorts(inputs)
  const ports = inputs.ports ?? built?.ports ?? null
  const navigation = useHistoryNavigation(ports, useAddressBar(inputs))
  const libraryAssets = useLibraryAssets(inputs, built)
  return { navigation, ports, libraryAssets }
}
