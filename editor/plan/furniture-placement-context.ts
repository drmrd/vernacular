import { createContext, createElement, useContext, useMemo, useState, type ReactNode } from 'react'

import type { LibraryItem } from '../../storage'
import { FURNITURE_ROTATION_STEP_DEGREES, rotatedBy } from './place-furniture'

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

export interface FurniturePlacementProviderProps {
  children: ReactNode
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
  return createElement(FurniturePlacementContext.Provider, { value }, children)
}
