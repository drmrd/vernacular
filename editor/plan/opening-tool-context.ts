import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import type { Point, SceneGraph } from '../../core'
import type { ToolId } from '../tools/active-tool-context'
import type { PlacementRefusal } from './overlay-announce'

// The element-type id placed when the place-opening tool fires. A single swing
// door is the most common opening, so it is the default placement type until the
// user picks another in the type chooser.
const DEFAULT_PLACEMENT_TYPE = 'single-swing-door'

export interface OpeningToolValue {
  /** The element-type id the place-opening tool places on its next click. */
  placementType: string
  /** Choose the element-type id to place next. */
  setPlacementType: (id: string) => void
  /** Why the last placement put nothing down, or null when it landed. */
  placementRefusal: PlacementRefusal | null
  /**
   * Report a refused attempt, or clear the notice with null. Each call with a reason is a new
   * attempt, also when it repeats the reason that already stands. Keeps its identity across renders.
   */
  setPlacementRefusal: (refusal: PlacementRefusal | null) => void
  /** Refused attempts so far: rises by one on every call with a reason, and never falls. */
  refusalAttempt: number
}

// A missing provider yields the default placement type and no-op setters so a
// bare PlanView render (a story or an isolated test mount) does not throw; the
// editor shell always provides the real context.
const FALLBACK_VALUE: OpeningToolValue = {
  placementType: DEFAULT_PLACEMENT_TYPE,
  setPlacementType: () => {},
  placementRefusal: null,
  setPlacementRefusal: () => {},
  refusalAttempt: 0,
}

const OpeningToolContext = createContext<OpeningToolValue | null>(null)

export function useOpeningTool(): OpeningToolValue {
  return useContext(OpeningToolContext) ?? FALLBACK_VALUE
}

/**
 * Retires the standing refusal whenever the active tool changes. A refusal is about
 * one placement under one tool, so putting that tool down ends it rather than parking it
 * for the next time the tool comes back.
 */
export function useForgetRefusalOnToolChange(tool: ToolId): void {
  const { setPlacementRefusal } = useOpeningTool()
  useEffect(() => {
    setPlacementRefusal(null)
  }, [tool, setPlacementRefusal])
}

/**
 * What a standing refusal was computed from, and the signs that the person has moved on.
 * Caller guarantee: pass references that change only when the thing changes. The selection set
 * must be the store's own set, and the scene graph must be the memoized graph of the active
 * floor, not one rebuilt on each render (the overlay graph is such a rebuild). Otherwise every
 * render retires the notice.
 */
export interface RefusalBasis {
  tool: ToolId
  /** The plan's scene graph. A new reference means the plan changed: an edit, an undo, a redo. */
  sceneGraph: SceneGraph
  activeFloorId: string | null
  /** Compared by reference: the selection store hands out one set until the selection changes. */
  selectedIds: ReadonlySet<string>
  /** The keyboard authoring candidate, compared by `x` and `y`: a re-created point with the same
   *  coordinates keeps the notice. */
  candidate: Point
}

/**
 * Retires the standing refusal, before paint, when any basis field or the provider's placement
 * type takes a new value or reference, except the candidate, which compares by `x` and `y`.
 * The same references keep it. Clears on mount. A refusal is about one placement under one
 * situation, so a changed plan, floor, selection, candidate, tool, or placement type ends it
 * rather than leaving a sentence that may no longer be true.
 *
 * A refusal reported since the hook last ran stands, even when the basis changed in that same
 * commit: it describes the attempt that just happened, and it retires at the next change.
 */
export function useRetireStaleRefusal(basis: RefusalBasis): void {
  const { placementType, setPlacementRefusal, refusalAttempt } = useOpeningTool()
  const { tool, sceneGraph, activeFloorId, selectedIds } = basis
  const { x: candidateX, y: candidateY } = basis.candidate
  // Starts at the count of the first render, so mounting clears. Written only by the effect, and
  // only to the count the effect just read, so a second run of the same commit (strict mode) finds
  // the count unchanged on mount, where clearing is idempotent.
  const lastSeenAttempt = useRef(refusalAttempt)
  useLayoutEffect(() => {
    if (refusalAttempt !== lastSeenAttempt.current) {
      lastSeenAttempt.current = refusalAttempt
      return
    }
    setPlacementRefusal(null)
  }, [
    tool,
    sceneGraph,
    activeFloorId,
    selectedIds,
    candidateX,
    candidateY,
    placementType,
    setPlacementRefusal,
    refusalAttempt,
  ])
}

export interface OpeningToolProviderProps {
  children: ReactNode
}

/**
 * Holds the shared placement-tool state so the type chooser, the pointer glue,
 * and the overlay read and write one source: the element type the place-opening
 * tool places next, and why the last placement was refused. The refusal rides
 * here rather than in the opening hook alone because the stair tool refuses for
 * its own reason, the keyboard opening drop reports too, and the overlay reports
 * all of them from one place. Mirrors the underlay provider: a memoized value keeps
 * the context referentially stable across renders that change neither.
 */
export function OpeningToolProvider({ children }: OpeningToolProviderProps) {
  const [placementType, setPlacementType] = useState<string>(DEFAULT_PLACEMENT_TYPE)
  const [placementRefusal, setRefusal] = useState<PlacementRefusal | null>(null)
  const [refusalAttempt, setRefusalAttempt] = useState(0)
  const setPlacementRefusal = useCallback((refusal: PlacementRefusal | null) => {
    setRefusal(refusal)
    if (refusal !== null) setRefusalAttempt((attempts) => attempts + 1)
  }, [])
  const value = useMemo<OpeningToolValue>(
    () => ({
      placementType,
      setPlacementType,
      placementRefusal,
      setPlacementRefusal,
      refusalAttempt,
    }),
    [placementType, placementRefusal, setPlacementRefusal, refusalAttempt],
  )
  return createElement(OpeningToolContext.Provider, { value }, children)
}
