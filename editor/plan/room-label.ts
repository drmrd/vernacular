import { formatArea, type Point, type RoomSceneNode, type UnitPreferences } from '../../core'

export interface RoomLabelContent {
  name: string | undefined
  area: string
  anchor: Point
}

export interface RoomLabelOptions {
  preferences: UnitPreferences
}

/** Arithmetic mean of the polygon vertices; the label anchors at this centroid. */
function polygonCentroid(polygon: readonly Point[]): Point {
  if (polygon.length === 0) {
    return { x: 0, y: 0 }
  }
  const sum = polygon.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), {
    x: 0,
    y: 0,
  })
  return { x: sum.x / polygon.length, y: sum.y / polygon.length }
}

export function roomLabelContent(room: RoomSceneNode, options: RoomLabelOptions): RoomLabelContent {
  return {
    name: room.name,
    area: formatArea(room.area, options.preferences),
    anchor: polygonCentroid(room.polygon),
  }
}
