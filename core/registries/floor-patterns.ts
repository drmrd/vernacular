import { colorFromHex, type Color } from '../color/color'
import { createRegistry, type Registry, type RegistryEntry } from './registry'

/**
 * A floor wearing-surface pattern: the repeating material a floor is finished in
 * (wood plank, ceramic tile, parquet). Each entry maps to the colors the pattern
 * is drawn in (base color first), a default repeat size in millimeters, and the
 * 3D material roughness the surface renders with. It is the first material-backed
 * surface treatment, paired with the `pattern` SurfaceTreatment variant (ADR-0056).
 */
export interface FloorPattern extends RegistryEntry {
  colors: Color[]
  scale: number
  roughness: number
}

export const FLOOR_PATTERN_REGISTRY_VERSION = 1

const floorPattern = (
  id: string,
  hexes: string[],
  scale: number,
  roughness: number,
): FloorPattern => ({
  id,
  colors: hexes.map((hex) => colorFromHex(hex)),
  scale,
  roughness,
})

export const builtinFloorPatterns: Registry<FloorPattern> = createRegistry(
  FLOOR_PATTERN_REGISTRY_VERSION,
  [
    // Oak plank with a darker grain line; a plank is roughly 150 mm wide.
    floorPattern('plank', ['#a9824f', '#7c5a33'], 150, 0.6),
    // Ceramic tile in a square grid with a pale grout joint; 300 mm tiles.
    floorPattern('tile-grid', ['#cfc7ba', '#b8b0a3'], 300, 0.3),
    // Parquet hardwood in small interlocking blocks; a 100 mm module.
    floorPattern('parquet', ['#9c6f3d', '#caa06a'], 100, 0.55),
  ],
)
