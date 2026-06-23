import { createContext, useContext } from 'react'

/**
 * The active edit layer scopes which plan elements are selectable. `'all'`
 * leaves every element selectable (today's behavior); a specific layer narrows
 * selection to that layer's elements while the rest stay visible but inert.
 */
export type EditLayer = 'all' | 'walls' | 'openings' | 'furniture' | 'annotations'

export const DEFAULT_EDIT_LAYER: EditLayer = 'all'

export interface ActiveEditLayerValue {
  layer: EditLayer
  setLayer: (layer: EditLayer) => void
}

export const ActiveEditLayerContext = createContext<ActiveEditLayerValue | null>(null)

/**
 * Reads the active edit layer from context. Throws when used outside an
 * `EditLayerProvider`, since the layer state has no meaningful default here.
 */
export function useActiveEditLayer(): ActiveEditLayerValue {
  const value = useContext(ActiveEditLayerContext)
  if (value === null) {
    throw new Error('useActiveEditLayer must be used within an EditLayerProvider')
  }
  return value
}
