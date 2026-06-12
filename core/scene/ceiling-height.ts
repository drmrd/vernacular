import { DEFAULT_CEILING_HEIGHT_MM } from '../model/factories'
import type { RoomSceneNode } from './scene-graph'

/** Single read point for a room's ceiling height. Nodes from
 *  `deriveRoomNodesForFloor` always carry it (the host floor's
 *  `defaultCeilingHeight`); the `DEFAULT_CEILING_HEIGHT_MM` fallback is
 *  deliberate defensive defaulting for hand-built `RoomSceneNode` literals that
 *  omit it, not a dead branch. This accessor is where a height profile (sloped,
 *  tray, coved ceilings) will later resolve to a value. */
export function ceilingHeight(node: RoomSceneNode): number {
  return node.ceilingHeight ?? DEFAULT_CEILING_HEIGHT_MM
}
