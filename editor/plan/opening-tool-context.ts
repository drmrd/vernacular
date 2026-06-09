import { createContext, createElement, useContext, useMemo, useState, type ReactNode } from 'react'

// The element-type id placed when the place-opening tool fires. A single swing
// door is the most common opening, so it is the default placement type until the
// user picks another in the type chooser.
const DEFAULT_PLACEMENT_TYPE = 'single-swing-door'

export interface OpeningToolValue {
  /** The element-type id the place-opening tool places on its next click. */
  placementType: string
  /** Choose the element-type id to place next. */
  setPlacementType: (id: string) => void
}

// A missing provider yields the default placement type and a no-op setter so a
// bare PlanView render (a story or an isolated test mount) does not throw; the
// editor shell always provides the real context.
const FALLBACK_VALUE: OpeningToolValue = {
  placementType: DEFAULT_PLACEMENT_TYPE,
  setPlacementType: () => {},
}

const OpeningToolContext = createContext<OpeningToolValue | null>(null)

export function useOpeningTool(): OpeningToolValue {
  return useContext(OpeningToolContext) ?? FALLBACK_VALUE
}

export interface OpeningToolProviderProps {
  children: ReactNode
}

/**
 * Holds the shared place-opening placement type so the type chooser and the
 * placement glue read and write one source. Mirrors the underlay provider: a
 * memoized value keeps the context referentially stable across renders that do
 * not change the placement type.
 */
export function OpeningToolProvider({ children }: OpeningToolProviderProps) {
  const [placementType, setPlacementType] = useState<string>(DEFAULT_PLACEMENT_TYPE)
  const value = useMemo<OpeningToolValue>(
    () => ({ placementType, setPlacementType }),
    [placementType],
  )
  return createElement(OpeningToolContext.Provider, { value }, children)
}
