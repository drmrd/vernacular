import {
  moveStair,
  STAIR_NODE_PREFIX,
  type Command,
  type MoveStairParams,
  type Point,
  type StairSceneNode,
} from '../../core'

/**
 * Builds the command that repositions `stair` by the displacement of `world`
 * from `grab`, the point the drag started at. Returns null when the cursor never
 * left the grab point, so a bare click on a selected stair dispatches no
 * undoable no-op.
 */
export function stairMoveCommand(
  stair: StairSceneNode,
  grab: Point,
  world: Point,
): Command<MoveStairParams> | null {
  const delta = { x: world.x - grab.x, y: world.y - grab.y }
  if (delta.x === 0 && delta.y === 0) {
    return null
  }
  const position = { x: stair.position.x + delta.x, y: stair.position.y + delta.y }
  return moveStair(rawStairId(stair), position)
}

// The raw stair id behind a stair scene-node id: the `stair:` namespace that
// `deriveStairNodes` prepends, stripped off, so the command names the model
// stair. Ids that never carried the prefix pass through.
function rawStairId(stair: StairSceneNode): string {
  return stair.id.startsWith(STAIR_NODE_PREFIX)
    ? stair.id.slice(STAIR_NODE_PREFIX.length)
    : stair.id
}
