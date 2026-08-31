import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import type { LibraryItem } from '../../storage'
import { ActiveToolContext, type ToolId } from '../tools/active-tool-context'
import { FURNITURE_ROTATION_STEP_DEGREES, rotatedBy } from './place-furniture'

const PLACE_FURNITURE_TOOL = 'place-furniture'

export interface FurniturePlacementValue {
  /** The library item armed for placement, or null when nothing is armed. */
  armed: LibraryItem | null
  /** The placement ghost's rotation in degrees, applied to the next placed item. */
  rotation: number
  /** Arm a library item for placement, resetting the rotation to zero. */
  armItem: (item: LibraryItem) => void
  /** Disarm the current item and clear the ghost rotation. */
  disarm: () => void
  /** Rotate the armed ghost by one coarse step (FURNITURE_ROTATION_STEP_DEGREES). */
  rotateArmed: () => void
}

// A missing provider yields an unarmed value and no-op actions so a bare render
// (a story or an isolated test mount) does not throw; the editor shell always
// provides the real context.
const FALLBACK_VALUE: FurniturePlacementValue = {
  armed: null,
  rotation: 0,
  armItem: () => {},
  disarm: () => {},
  rotateArmed: () => {},
}

const FurniturePlacementContext = createContext<FurniturePlacementValue | null>(null)

export function useFurniturePlacement(): FurniturePlacementValue {
  return useContext(FurniturePlacementContext) ?? FALLBACK_VALUE
}

/**
 * The armed item survives a tool switch, so a return to the place-furniture
 * tool resumes where the user left off. Only the tool that consumes it may act
 * on it or say so, so every other tool sees null here: the placement ghost,
 * the pointer handler that tracks it, and the picker's placement caption all
 * read this instead of each re-deriving the same tool check.
 */
export function armedUnderTool(tool: ToolId, armed: LibraryItem | null): LibraryItem | null {
  return tool === PLACE_FURNITURE_TOOL ? armed : null
}

export interface FurniturePlacementProviderProps {
  children: ReactNode
}

/**
 * Disarms whenever the editor leaves the place-furniture tool, so an armed item
 * never outlives the tool that places it. Only that tool acts on the arm state, and
 * a ghost still armed under the wall tool is state the user cannot see or reach.
 *
 * The active tool is read straight from its context rather than through
 * `useActiveTool`, so a bare render with no tool provider (a story, an isolated
 * test) keeps working: with no tool to leave, there is nothing to disarm.
 */
function useDisarmOffTool(disarm: () => void): void {
  const activeTool = useContext(ActiveToolContext)
  const tool = activeTool?.tool
  useEffect(() => {
    if (tool !== undefined && tool !== PLACE_FURNITURE_TOOL) {
      disarm()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- disarm is rebuilt whenever the arm state changes, so listing it would re-run this on every arm; the tool leaving is the only trigger
  }, [tool])
}

/**
 * Holds the shared furniture-placement arm state so the library browser and the
 * placement glue read and write one source. Mirrors the opening-tool provider: a
 * memoized value keeps the context referentially stable across renders that do
 * not change the armed item or its rotation.
 */
export function FurniturePlacementProvider({ children }: FurniturePlacementProviderProps) {
  const [armed, setArmed] = useState<LibraryItem | null>(null)
  const [rotation, setRotation] = useState<number>(0)
  const value = useMemo<FurniturePlacementValue>(
    () => ({
      armed,
      rotation,
      armItem: (item: LibraryItem) => {
        setArmed(item)
        setRotation(0)
      },
      disarm: () => {
        setArmed(null)
        setRotation(0)
      },
      rotateArmed: () =>
        setRotation((current) => rotatedBy(current, FURNITURE_ROTATION_STEP_DEGREES)),
    }),
    [armed, rotation],
  )
  useDisarmOffTool(value.disarm)
  return createElement(FurniturePlacementContext.Provider, { value }, children)
}
