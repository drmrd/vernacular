import { createContext, createElement, useContext, useMemo, useState, type ReactNode } from 'react'

export interface ViewOverlayValue {
  showGrid: boolean
  showDimensions: boolean
  toggleGrid: () => void
  toggleDimensions: () => void
}

const ViewOverlayContext = createContext<ViewOverlayValue | null>(null)

export function useViewOverlay(): ViewOverlayValue {
  const value = useContext(ViewOverlayContext)
  if (value === null) {
    throw new Error('useViewOverlay must be used within a ViewOverlayProvider')
  }
  return value
}

export interface ViewOverlayProviderProps {
  children: ReactNode
}

export function ViewOverlayProvider({ children }: ViewOverlayProviderProps) {
  const [showGrid, setShowGrid] = useState(true)
  const [showDimensions, setShowDimensions] = useState(true)
  const value = useMemo<ViewOverlayValue>(
    () => ({
      showGrid,
      showDimensions,
      toggleGrid: () => setShowGrid((prev) => !prev),
      toggleDimensions: () => setShowDimensions((prev) => !prev),
    }),
    [showGrid, showDimensions],
  )
  return createElement(ViewOverlayContext.Provider, { value }, children)
}
