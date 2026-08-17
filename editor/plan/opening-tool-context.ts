import { createContext, createElement, useContext, useMemo, useState, type ReactNode } from 'react'

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
  /** Why the last placement click put nothing down, or null when it landed. */
  placementRefusal: PlacementRefusal | null
  /** Report a refused placement, or clear the notice with null. */
  setPlacementRefusal: (refusal: PlacementRefusal | null) => void
}

// A missing provider yields the default placement type and no-op setters so a
// bare PlanView render (a story or an isolated test mount) does not throw; the
// editor shell always provides the real context.
const FALLBACK_VALUE: OpeningToolValue = {
  placementType: DEFAULT_PLACEMENT_TYPE,
  setPlacementType: () => {},
  placementRefusal: null,
  setPlacementRefusal: () => {},
}

const OpeningToolContext = createContext<OpeningToolValue | null>(null)

export function useOpeningTool(): OpeningToolValue {
  return useContext(OpeningToolContext) ?? FALLBACK_VALUE
}

export interface OpeningToolProviderProps {
  children: ReactNode
}

/**
 * Holds the shared placement-tool state so the type chooser, the pointer glue,
 * and the overlay read and write one source: the element type the place-opening
 * tool places next, and why the last placement click was refused. The refusal
 * rides here rather than in the opening hook alone because the stair tool refuses
 * for its own reason and the overlay reports both from one place. Mirrors the
 * underlay provider: a memoized value keeps the context referentially stable
 * across renders that change neither.
 */
export function OpeningToolProvider({ children }: OpeningToolProviderProps) {
  const [placementType, setPlacementType] = useState<string>(DEFAULT_PLACEMENT_TYPE)
  const [placementRefusal, setPlacementRefusal] = useState<PlacementRefusal | null>(null)
  const value = useMemo<OpeningToolValue>(
    () => ({ placementType, setPlacementType, placementRefusal, setPlacementRefusal }),
    [placementType, placementRefusal],
  )
  return createElement(OpeningToolContext.Provider, { value }, children)
}
