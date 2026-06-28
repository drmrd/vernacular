import { createRegistry, type Registry, type RegistryEntry } from './registry'

/**
 * The primary structural system a wall assembly is built around, covering the
 * period structural vocabulary the old-house track needs (ADR-0044): platform and
 * balloon framing are the two historic light wood-framing systems (balloon framing
 * runs continuous studs the full height of the wall, platform framing stacks one
 * storey on the next), and solid masonry is a load-bearing brick or stone wall.
 * The union is open to further systems (post-and-beam, insulated concrete)
 * additively, the way `TrimProfileShape` is.
 */
export type ConstructionSystem = 'platform-frame' | 'balloon-frame' | 'solid-masonry'

/**
 * One material layer within a wall assembly: its `material` identifier and its
 * `thickness` across the wall in millimeters. Layers are ordered interior face to
 * exterior face (see {@link ConstructionProfile}). The material is a plain string
 * id (for example `plaster`, `wood-lath`, `stud-cavity`, `brick`) so a profile can
 * name a material the finish or paint registries do not yet carry; a later slice
 * can tighten it to a material-registry id without reshaping the layer.
 */
export interface ConstructionLayer {
  material: string
  /** Layer thickness across the wall, in millimeters. */
  thickness: number
}

/**
 * A wall construction profile: a named layered assembly that describes a historic
 * wall by its build-up rather than a single thickness (design spec 4.4,
 * `ConstructionProfileRegistry`; the old-house structural vocabulary of ADR-0044
 * and ADR-0046). It is the structural analog of a {@link
 * import('./trim-profiles').TrimProfile}: `system` classifies the assembly the way
 * a trim profile's `category` names its run, and `layers` carry the per-layer
 * thickness and material the 2D plan wall symbol and the (later) 3D wall builder
 * read, the way a trim profile's `shape` and stock dimensions resolve its section.
 * Layers run from interior face to exterior face; the assembly's total thickness is
 * the sum of the layer thicknesses (see `core/scene/construction-profile.ts`). A
 * new assembly is a new registry entry, not a model change.
 */
export interface ConstructionProfile extends RegistryEntry {
  system: ConstructionSystem
  /** Ordered material layers, interior face first. */
  layers: readonly ConstructionLayer[]
}

export const CONSTRUCTION_PROFILE_REGISTRY_VERSION = 1

/**
 * The bundled starter set of wall assemblies, at least one per named structural
 * system. Layer thicknesses are nominal millimeters for common North American
 * residential construction (design spec phase-4 wall construction profiles:
 * lath-and-plaster, drywall over studs, solid brick, solid stone); a registry pack
 * can override or extend them (design spec 4.6).
 */
export const builtinConstructionProfiles: Registry<ConstructionProfile> = createRegistry(
  CONSTRUCTION_PROFILE_REGISTRY_VERSION,
  [
    {
      // Drywall over a 2x4 platform-framed partition: the modern baseline at 4.5".
      id: 'platform-framed-drywall',
      system: 'platform-frame',
      layers: [
        { material: 'drywall', thickness: 13 },
        { material: 'stud-cavity', thickness: 89 },
        { material: 'drywall', thickness: 13 },
      ],
    },
    {
      // The classic Victorian wall: lath and plaster over continuous balloon-framed
      // studs, plastered on both faces.
      id: 'balloon-framed-lath-and-plaster',
      system: 'balloon-frame',
      layers: [
        { material: 'plaster', thickness: 16 },
        { material: 'wood-lath', thickness: 7 },
        { material: 'stud-cavity', thickness: 89 },
        { material: 'wood-lath', thickness: 7 },
        { material: 'plaster', thickness: 16 },
      ],
    },
    {
      // A double-wythe solid brick bearing wall, plastered on the interior face.
      id: 'solid-masonry-brick',
      system: 'solid-masonry',
      layers: [
        { material: 'plaster', thickness: 16 },
        { material: 'brick', thickness: 215 },
      ],
    },
    {
      // A solid rubble-stone bearing wall, plastered on the interior face.
      id: 'solid-masonry-stone',
      system: 'solid-masonry',
      layers: [
        { material: 'plaster', thickness: 16 },
        { material: 'stone', thickness: 300 },
      ],
    },
  ],
)
