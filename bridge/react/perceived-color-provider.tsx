import type { ReactNode } from 'react'
import type { PerceivedColorStore } from '../perceived-color/perceived-color-store'
import { PerceivedColorContext } from './perceived-color-context'

export interface PerceivedColorProviderProps {
  store: PerceivedColorStore
  children: ReactNode
}

export function PerceivedColorProvider({ store, children }: PerceivedColorProviderProps) {
  return <PerceivedColorContext.Provider value={store}>{children}</PerceivedColorContext.Provider>
}
