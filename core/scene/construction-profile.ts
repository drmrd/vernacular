import { getEntry, type Registry } from '../registries/registry'
import {
  builtinConstructionProfiles,
  type ConstructionLayer,
  type ConstructionProfile,
} from '../registries/construction-profiles'

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

/**
 * A wall construction profile resolved for rendering: its ordered material layers
 * (interior face first) and the total assembly thickness in millimeters, the
 * construction analog of a trim profile's resolved cross-section
 * ({@link import('./trim-profile').resolveTrimProfileSection}). The 2D wall symbol
 * and the (later) 3D wall builder read the layers and thickness without knowing
 * which assembly produced them.
 */
export interface ResolvedConstruction {
  layers: readonly ConstructionLayer[]
  totalThickness: number
}

/**
 * Resolves a wall construction profile's ordered layers and total thickness from a
 * registry id, the construction analog of {@link
 * import('./trim-profile').resolveTrimProfileSection}. The layers and their
 * thicknesses come from the registry entry, so a rendering layer reads geometry
 * without knowing the assembly. An id the registry does not carry resolves to
 * `undefined`, since the layers live on the entry and there is nothing to draw
 * without them.
 */
export function resolveConstructionProfile(
  profileId: string,
  constructionProfiles: Registry<ConstructionProfile> = builtinConstructionProfiles,
): ResolvedConstruction | undefined {
  const entry = getEntry(constructionProfiles, profileId)
  if (entry === undefined) return undefined
  return { layers: entry.layers, totalThickness: constructionTotalThickness(entry.layers) }
}

/**
 * The footprint thickness a wall node draws to: the resolved assembly total when
 * the node references a registry-known construction profile, otherwise the node's
 * raw thickness. An unknown id also falls back to the raw thickness, so a missing
 * registry entry degrades to today's single-thickness behavior rather than
 * collapsing the wall to zero.
 */
export function effectiveWallThickness(
  node: { thickness: number; constructionProfile?: string },
  constructionProfiles: Registry<ConstructionProfile> = builtinConstructionProfiles,
): number {
  if (node.constructionProfile === undefined) return node.thickness
  return (
    resolveConstructionProfile(node.constructionProfile, constructionProfiles)?.totalThickness ??
    node.thickness
  )
}
