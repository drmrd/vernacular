import { createContext, useContext, useSyncExternalStore } from 'react'
import type {
  PerceivedColorSample,
  PerceivedColorStore,
} from '../perceived-color/perceived-color-store'

export const PerceivedColorContext = createContext<PerceivedColorStore | null>(null)

// Unlike useSurfaceSelection, this deliberately returns null instead of
// throwing when there is no provider. The perceived-color readout is an
// optional enhancement to a finish section, not a required dependency, so a
// finish section rendered in an isolated Storybook story or a component test
// without a PerceivedColorProvider must render normally rather than crash.
export function usePerceivedColorStore(): PerceivedColorStore | null {
  return useContext(PerceivedColorContext)
}

// A module-level constant keeps the subscribe callback referentially stable
// across renders when there is no store, so useSyncExternalStore does not
// tear down and re-create a subscription on every render.
const subscribeToNothing = (): (() => void) => () => {}
const getNoSample = (): null => null

export function usePerceivedColorSample(): PerceivedColorSample | null {
  const store = usePerceivedColorStore()
  // useSyncExternalStore must be called unconditionally (rules of hooks), so
  // the absence of a store is expressed as a no-op subscription and a
  // constant null snapshot rather than skipping the hook call.
  return useSyncExternalStore(
    store === null ? subscribeToNothing : store.subscribe,
    store === null ? getNoSample : store.getSample,
  )
}
