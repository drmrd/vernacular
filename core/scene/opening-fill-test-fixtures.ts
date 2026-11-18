import type { OpeningSceneNode } from './scene-graph'
import { openingFill, type HungSash, type OpeningFillPart } from './opening-fill'

/**
 * A single-swing door centered on a 120 mm wall running along +x with its normal on +y.
 * Each test overrides the type and the opening dimensions it needs.
 */
export const baseOpening: OpeningSceneNode = {
  id: 'opening-1',
  kind: 'opening',
  floorId: 'floor-1',
  type: 'single-swing-door',
  center: { x: 1000, y: 0 },
  along: { x: 1, y: 0 },
  normal: { x: 0, y: 1 },
  width: 900,
  height: 2032,
  sillHeight: 0,
  hostThickness: 120,
  orientation: { hinge: 'start', facing: 'positive' },
  hostWallId: 'south',
}

const SILL_HEIGHT_MM = 900
const MEETING_RAIL_TOP_MM = 1530
const HEAD_HEIGHT_MM = 2100

/** A 900 x 1200 window with a 900 sill in the 120 mm wall of `baseOpening`. */
export const hungWindow = (
  type: string,
  facing: 'positive' | 'negative' = 'positive',
): OpeningSceneNode => ({
  ...baseOpening,
  type,
  width: 900,
  height: 1200,
  sillHeight: SILL_HEIGHT_MM,
  orientation: { hinge: 'start' as const, facing },
})

/** The parts whose vertical extent lies within one sash's half of a `hungWindow`. */
export const sashParts = (
  window: OpeningSceneNode,
  sash: HungSash,
): ReadonlyArray<OpeningFillPart> => {
  const [lowest, highest] =
    sash === 'lower' ? [SILL_HEIGHT_MM, MEETING_RAIL_TOP_MM] : [MEETING_RAIL_TOP_MM, HEAD_HEIGHT_MM]
  return openingFill(window).filter((p) => p.up.min >= lowest && p.up.max <= highest)
}
