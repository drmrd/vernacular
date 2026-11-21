import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import type { Point } from '../../core'
import { computeFitViewport, contentBounds, planContentPoints, type Bounds } from './fit'
import { PLAN_HEIGHT, PLAN_WIDTH } from './plan-scene'
import { resolveStageSize } from './plan-stage-size'
import { DEFAULT_PLAN_SCALE, type Viewport, type ViewportSize } from './viewport'

export interface ViewportValue {
  viewport: Viewport
  setViewport: Dispatch<SetStateAction<Viewport>>
  /** The plan stage size in pixels: nominal until the first measurement. */
  stageSize: ViewportSize
  /** Records a pane measurement. Never writes the viewport, except the one opening refit. */
  reportStageSize: (measured: ViewportSize) => void
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
  initialContent?: ViewportInitialContent | undefined
}

const DEFAULT_VIEWPORT: Viewport = { scale: DEFAULT_PLAN_SCALE }

const NOMINAL_STAGE_SIZE: ViewportSize = { width: PLAN_WIDTH, height: PLAN_HEIGHT }

interface OpeningState {
  viewport: Viewport
  /** Bounds of the content the floor opened with, or null when it opened empty. */
  bounds: Bounds | null
  stageSize: ViewportSize
}

function computeOpeningState(initialContent: ViewportInitialContent | undefined): OpeningState {
  if (initialContent === undefined) {
    return { viewport: DEFAULT_VIEWPORT, bounds: null, stageSize: NOMINAL_STAGE_SIZE }
  }
  const bounds = contentBounds(planContentPoints(initialContent.walls, initialContent.rooms))
  const viewport =
    bounds === null ? DEFAULT_VIEWPORT : computeFitViewport(bounds, initialContent.size)
  return { viewport, bounds, stageSize: initialContent.size }
}

/**
 * Owns the plan camera (scale + pan offset) so the canvas that draws it, the header
 * zoom control, and the status-bar coordinate readout all read and drive one source.
 * The plan view consumes `setViewport` for its pan/zoom/fit input exactly as it did
 * when the state lived locally. The provider also holds the measured stage size. A
 * measurement leaves the viewport alone, except that the first one refits the opening
 * viewport to the measured size once, so the opening fit frames the real pane.
 */
export function ViewportProvider({ children, initialContent }: ViewportProviderProps) {
  const [opening] = useState(() => computeOpeningState(initialContent))
  const [viewport, setViewport] = useState<Viewport>(opening.viewport)
  const [stageSize, setStageSize] = useState<ViewportSize>(opening.stageSize)
  const stageSizeRef = useRef(stageSize)
  const hasMeasuredRef = useRef(false)
  const reportStageSize = useCallback(
    (measured: ViewportSize) => {
      const resolved = resolveStageSize(stageSizeRef.current, measured)
      if (resolved === stageSizeRef.current) {
        return
      }
      stageSizeRef.current = resolved
      setStageSize(resolved)
      const isFirstMeasurement = !hasMeasuredRef.current
      hasMeasuredRef.current = true
      const { bounds } = opening
      if (isFirstMeasurement && bounds !== null) {
        setViewport((current) =>
          current === opening.viewport ? computeFitViewport(bounds, resolved) : current,
        )
      }
    },
    [opening],
  )
  const value = useMemo<ViewportValue>(
    () => ({ viewport, setViewport, stageSize, reportStageSize }),
    [viewport, stageSize, reportStageSize],
  )
  return createElement(ViewportContext.Provider, { value }, children)
}
