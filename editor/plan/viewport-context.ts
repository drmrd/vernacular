import {
  createContext,
  createElement,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { DEFAULT_PLAN_SCALE, type Viewport } from './viewport'

export interface ViewportValue {
  viewport: Viewport
  setViewport: Dispatch<SetStateAction<Viewport>>
}

const ViewportContext = createContext<ViewportValue | null>(null)

export function useViewport(): ViewportValue {
  const value = useContext(ViewportContext)
  if (value === null) {
    throw new Error('useViewport must be used within a ViewportProvider')
  }
  return value
}

export interface ViewportProviderProps {
  children: ReactNode
}

/**
 * Owns the plan camera (scale + pan offset) so the canvas that draws it, the header
 * zoom control, and the status-bar coordinate readout all read and drive one source.
 * The plan view consumes `setViewport` for its pan/zoom/fit input exactly as it did
 * when the state lived locally; the value shape is unchanged.
 */
export function ViewportProvider({ children }: ViewportProviderProps) {
  const [viewport, setViewport] = useState<Viewport>({ scale: DEFAULT_PLAN_SCALE })
  const value = useMemo<ViewportValue>(() => ({ viewport, setViewport }), [viewport])
  return createElement(ViewportContext.Provider, { value }, children)
}
