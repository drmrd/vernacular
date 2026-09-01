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
import type { Point } from '../../core'
import { computeFitViewport, contentBounds, planContentPoints } from './fit'
import { DEFAULT_PLAN_SCALE, type Viewport, type ViewportSize } from './viewport'

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

/** The already-drawn content a floor opens with, so the initial viewport can frame it. */
export interface ViewportInitialContent {
  walls: readonly { start: Point; end: Point }[]
  rooms: readonly { polygon: readonly Point[] }[]
  size: ViewportSize
}

export interface ViewportProviderProps {
  children: ReactNode
  /** When provided, the initial viewport frames this content instead of starting at the default scale. */
  initialContent?: ViewportInitialContent
}

const DEFAULT_VIEWPORT: Viewport = { scale: DEFAULT_PLAN_SCALE }

function computeInitialViewport(initialContent: ViewportInitialContent | undefined): Viewport {
  if (initialContent === undefined) {
    return DEFAULT_VIEWPORT
  }
  const bounds = contentBounds(planContentPoints(initialContent.walls, initialContent.rooms))
  return bounds === null ? DEFAULT_VIEWPORT : computeFitViewport(bounds, initialContent.size)
}

/**
 * Owns the plan camera (scale + pan offset) so the canvas that draws it, the header
 * zoom control, and the status-bar coordinate readout all read and drive one source.
 * The plan view consumes `setViewport` for its pan/zoom/fit input exactly as it did
 * when the state lived locally; the value shape is unchanged.
 */
export function ViewportProvider({ children, initialContent }: ViewportProviderProps) {
  const [viewport, setViewport] = useState<Viewport>(() => computeInitialViewport(initialContent))
  const value = useMemo<ViewportValue>(() => ({ viewport, setViewport }), [viewport])
  return createElement(ViewportContext.Provider, { value }, children)
}
