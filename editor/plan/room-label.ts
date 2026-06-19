import {
  formatArea,
  polygonCentroid,
  type Point,
  type RoomSceneNode,
  type UnitPreferences,
} from '../../core'

import { contentBounds } from './fit'
import { LABEL_FONT_SIZE_PX, LABEL_LINE_HEIGHT_PX } from './label-constants'
import { labelBox } from './label-layout'
import { worldToScreen, type Viewport } from './viewport'

export interface RoomLabelContent {
  name: string | undefined
  area: string
  anchor: Point
}

export interface RoomLabelOptions {
  preferences: UnitPreferences
}

export function roomLabelContent(room: RoomSceneNode, options: RoomLabelOptions): RoomLabelContent {
  return {
    name: room.name,
    area: formatArea(room.area, options.preferences),
    anchor: polygonCentroid(room.polygon),
  }
}

/**
 * How much of the room's on-screen footprint a label line may consume on either
 * axis and still count as a fit. A label spanning the room edge-to-edge reads as
 * cramped, so a line must seat within this fraction of the footprint.
 */
const LABEL_FIT_RATIO = 0.9

/**
 * The placement decision for a room's name and area block. `kind` summarizes the
 * outcome; `showName` and `showArea` say which lines the draw path paints.
 *
 * Unnamed-room contract: a room whose `content.name` is `undefined` has no name
 * line to paint, so `showName` is never `true` for it and its `kind` is never
 * `name-only`. Such a room shows at most its area: `area-only` when the area
 * string fits the footprint, otherwise `hidden`. This keeps the draw path from
 * ever calling `fillText` with an absent name.
 */
export interface RoomLabelPlacement {
  kind: 'full' | 'name-only' | 'area-only' | 'hidden'
  showName: boolean
  showArea: boolean
}

const HIDDEN_PLACEMENT: RoomLabelPlacement = { kind: 'hidden', showName: false, showArea: false }

/** The room's projected on-screen footprint in pixels, or null for a degenerate polygon. */
function projectedFootprint(
  room: RoomSceneNode,
  viewport: Viewport,
): { width: number; height: number } | null {
  const screenPoints = room.polygon.map((point) => worldToScreen(point, viewport))
  const bounds = contentBounds(screenPoints)
  if (bounds === null) {
    return null
  }
  return { width: bounds.max.x - bounds.min.x, height: bounds.max.y - bounds.min.y }
}

/** Whether a single label line of `text` seats within the footprint at the fit ratio. */
function lineFits(text: string, footprint: { width: number; height: number }): boolean {
  const box = labelBox(text, { x: 0, y: 0 }, { sizePx: LABEL_FONT_SIZE_PX })
  const lineWidth = box.max.x - box.min.x
  return lineWidth <= footprint.width * LABEL_FIT_RATIO
}

/**
 * Decide whether a room's name and area block fits its on-screen footprint at the
 * current zoom. A comfortably large room keeps the full name and area; a room too
 * small to seat both lines drops the area, and one too small for even the name is
 * hidden. The decision is a pure function of the room's `worldToScreen`-projected
 * footprint and the `labelBox` estimate, with no canvas measurement.
 */
export function roomLabelPlacement(
  room: RoomSceneNode,
  viewport: Viewport,
  options: RoomLabelOptions,
): RoomLabelPlacement {
  const footprint = projectedFootprint(room, viewport)
  if (footprint === null) {
    return HIDDEN_PLACEMENT
  }
  const content = roomLabelContent(room, options)
  const primaryLine = content.name ?? content.area
  if (!lineFits(primaryLine, footprint)) {
    return HIDDEN_PLACEMENT
  }
  // An unnamed room has no name line to paint. Its primary line is the area
  // string itself, so a fit here is an area-only label, never a name-only one.
  if (content.name === undefined) {
    return { kind: 'area-only', showName: false, showArea: true }
  }
  const blockHeight = LABEL_FONT_SIZE_PX + LABEL_LINE_HEIGHT_PX
  const areaFits =
    lineFits(content.area, footprint) && blockHeight <= footprint.height * LABEL_FIT_RATIO
  if (!areaFits) {
    return { kind: 'name-only', showName: true, showArea: false }
  }
  return { kind: 'full', showName: true, showArea: true }
}
