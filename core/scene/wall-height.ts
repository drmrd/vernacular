import { DEFAULT_CEILING_HEIGHT_MM } from '../model/factories'
import type { WallSceneNode } from './scene-graph'

/** Single read point for a wall's height. Nodes from `deriveWallNode` always
 *  carry a height (the host floor's `defaultCeilingHeight`); the
 *  `DEFAULT_CEILING_HEIGHT_MM` fallback is deliberate defensive defaulting for
 *  hand-built `WallSceneNode` literals that omit it, not a dead branch. */
export function wallHeight(node: WallSceneNode): number {
  return node.height ?? DEFAULT_CEILING_HEIGHT_MM
}
