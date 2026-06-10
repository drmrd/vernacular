import {
  formatArea,
  polygonCentroid,
  type Point,
  type RoomSceneNode,
  type UnitPreferences,
} from '../../core'

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
