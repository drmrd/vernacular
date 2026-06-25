import { WALL_NODE_PREFIX, type WallSceneNode } from './scene-graph'

/**
 * The raw wall id behind a wall scene-node id: the `wall:` prefix that
 * `deriveWallNode` prepends, stripped off, so the id matches a paint-store key or
 * an opening's `hostWallId`. Ids that never carried the prefix pass through.
 */
export function rawWallId(wall: WallSceneNode): string {
  return wall.id.startsWith(WALL_NODE_PREFIX) ? wall.id.slice(WALL_NODE_PREFIX.length) : wall.id
}
