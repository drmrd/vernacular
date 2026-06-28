import type { ConstructionLayer } from '../registries/construction-profiles'

/**
 * The total thickness of a wall assembly across its build-up: the sum of its
 * ordered layer thicknesses, in millimeters. This is the figure the 2D plan wall
 * symbol draws to and the (later) 3D wall builder extrudes, the construction
 * analog of a trim profile's resolved cross-section dimensions. An empty assembly
 * totals zero.
 */
export function constructionTotalThickness(layers: readonly ConstructionLayer[]): number {
  return layers.reduce((sum, layer) => sum + layer.thickness, 0)
}
