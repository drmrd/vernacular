import { isGroundPlane, markCacheHeld } from '../../engine'
import type { SceneRoot, TextureAppearance } from '../../engine'

const DEFAULT_TILE_MM = 2000

// A grass appearance whose texture the texture cache holds, as the ground draws it once loaded.
// The caller makes the texture, because only test files may import the engine testing entry.
export function heldGrassAppearance(
  texture: TextureAppearance['texture'],
  tileSizeMm = DEFAULT_TILE_MM,
): TextureAppearance {
  markCacheHeld(texture)
  return { texture, tileSize: { width: tileSizeMm, height: tileSizeMm } }
}

export function onlyGroundPlane(root: SceneRoot) {
  const planes = root.children.filter((child) => isGroundPlane(child))
  const [plane] = planes
  if (planes.length !== 1 || !plane)
    throw new Error(`expected one ground plane, got ${planes.length}`)
  return plane
}
