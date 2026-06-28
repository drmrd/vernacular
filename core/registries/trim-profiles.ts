import { createRegistry, type Registry, type RegistryEntry } from './registry'

/**
 * Which run of trim a profile is cut for, covering the period interior vocabulary
 * the old-house track needs (ADR-0044): door and window casing, baseboard, crown,
 * chair rail, picture rail, and wainscot cap. The union is open to further runs
 * (plate rail, cornice, base shoe) additively, the way `VoidContourKind` is.
 */
export type TrimCategory =
  | 'casing'
  | 'baseboard'
  | 'crown'
  | 'chair-rail'
  | 'picture-rail'
  | 'wainscot-cap'

/**
 * The named cross-section shape of a moulding: the registry shape parameter the
 * 2D section resolver switches on (see `core/scene/trim-profile.ts`), the trim
 * analog of an opening's `VoidContourKind`. `flat` is square-edged stock; `cove`
 * is a concave quarter-round; `ovolo` is a convex quarter-round. Open to further
 * profiles (ogee, bead, ogee-cyma) additively, the same way head shapes are.
 */
export type TrimProfileShape = 'flat' | 'cove' | 'ovolo'

/**
 * A trim profile: a moulding's cross-section shape plus its stock dimensions, the
 * trim analog of an opening type's head shape (design spec 3.2, path-based trim;
 * 4.4, `TrimProfileRegistry`). `shape` is the registry shape parameter the section
 * resolver reads; `height` and `projection` are the stock dimensions in
 * millimeters. `height` runs up the wall and `projection` stands out from the wall
 * face. Geometry resolves from `shape` the same way an opening head does, so a new
 * profile shape is a new resolver `case`, not a model change.
 */
export interface TrimProfile extends RegistryEntry {
  category: TrimCategory
  shape: TrimProfileShape
  /** Stock height up the wall, in millimeters. */
  height: number
  /**
   * How far the moulding stands proud of the wall face, in millimeters. Kept no
   * greater than `height` so the section resolver's quarter-round arcs stay
   * circular.
   */
  projection: number
}

export const TRIM_PROFILE_REGISTRY_VERSION = 1

/**
 * The bundled starter set of moulding profiles, at least one per named trim run.
 * Dimensions are nominal millimeters for common North American residential stock;
 * a registry pack can override or extend them (design spec 4.6).
 */
export const builtinTrimProfiles: Registry<TrimProfile> = createRegistry(
  TRIM_PROFILE_REGISTRY_VERSION,
  [
    // Door and window casing: a flat board and a rounded-edge variant.
    { id: 'casing-flat', category: 'casing', shape: 'flat', height: 90, projection: 19 },
    { id: 'casing-ovolo', category: 'casing', shape: 'ovolo', height: 90, projection: 22 },
    // Baseboard: a flat board and a taller rounded-cap variant.
    { id: 'baseboard-flat', category: 'baseboard', shape: 'flat', height: 140, projection: 19 },
    { id: 'baseboard-ovolo', category: 'baseboard', shape: 'ovolo', height: 159, projection: 22 },
    // Crown moulding: the deep-projecting run at the wall-to-ceiling angle.
    { id: 'crown-cove', category: 'crown', shape: 'cove', height: 114, projection: 76 },
    { id: 'crown-ovolo', category: 'crown', shape: 'ovolo', height: 140, projection: 90 },
    // Chair rail: a mid-wall protective run.
    { id: 'chair-rail-ovolo', category: 'chair-rail', shape: 'ovolo', height: 64, projection: 25 },
    // Picture rail: a slender high-wall run for hanging hardware.
    {
      id: 'picture-rail-cove',
      category: 'picture-rail',
      shape: 'cove',
      height: 44,
      projection: 38,
    },
    // Wainscot cap: the moulded top edge of wall panelling.
    {
      id: 'wainscot-cap-ovolo',
      category: 'wainscot-cap',
      shape: 'ovolo',
      height: 38,
      projection: 32,
    },
  ],
)
