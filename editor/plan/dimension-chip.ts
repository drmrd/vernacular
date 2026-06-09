import { worldToScreen, type ScreenPoint, type Viewport } from './viewport'
import {
  dimensionGeometry,
  distance,
  formatLength,
  lengthFormatOptions,
  type DimensionSceneNode,
  type UnitPreferences,
} from '../../core'
import { midpoint } from './geometry'

/** Minimum on-screen dimension length (px) below which a chip would be illegible and is dropped. */
export const MIN_CHIP_LENGTH_PX = 24

export interface DimensionChip {
  id: string
  screen: ScreenPoint
  label: string
}

export function dimensionChips(
  dimensions: readonly DimensionSceneNode[],
  viewport: Viewport,
  preferences: UnitPreferences,
): DimensionChip[] {
  return dimensions.flatMap((node) => {
    const geom = dimensionGeometry(node.start, node.end, node.offset)
    const screenStart = worldToScreen(geom.lineStart, viewport)
    const screenEnd = worldToScreen(geom.lineEnd, viewport)
    if (distance(screenStart, screenEnd) < MIN_CHIP_LENGTH_PX) {
      return []
    }
    return [
      {
        id: node.id,
        screen: worldToScreen(midpoint(geom.lineStart, geom.lineEnd), viewport),
        label: formatLength(node.length, lengthFormatOptions(preferences)),
      },
    ]
  })
}
