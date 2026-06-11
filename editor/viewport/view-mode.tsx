import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

export type ViewMode = 'plan' | 'split' | 'preview'

export interface ViewControls {
  mode: ViewMode
  setMode: (mode: ViewMode) => void
}

const ViewModeContext = createContext<ViewControls | null>(null)

export function ViewModeProvider({
  children,
  initial = 'plan',
}: {
  children: ReactNode
  initial?: ViewMode
}) {
  const [mode, setMode] = useState<ViewMode>(initial)
  const value = useMemo<ViewControls>(() => ({ mode, setMode }), [mode])
  return <ViewModeContext.Provider value={value}>{children}</ViewModeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- the hook is the read half of this provider's public contract and ships beside it; this slice's test imports useViewMode from ./view-mode.
export function useViewMode(): ViewControls {
  const value = useContext(ViewModeContext)
  if (value === null) {
    throw new Error('useViewMode must be used within a ViewModeProvider')
  }
  return value
}
