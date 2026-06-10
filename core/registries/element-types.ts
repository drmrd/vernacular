import { createRegistry, type Registry, type RegistryEntry } from './registry'

export type ElementCategory = 'wall' | 'opening' | 'stair'

export interface Plan2DSymbol {
  /** Identifier of the 2D plan-symbol drawing routine. */
  symbol: string
}

export interface Scene3DReference {
  /** Identifier of the 3D builder routine or asset-reference key. */
  builder: string
}

export type OpeningFamily =
  | 'swing'
  | 'slide'
  | 'fold'
  | 'pivot'
  | 'cased'
  | 'window-fixed'
  | 'window-crank'

export interface OpeningTypeParameters {
  family: OpeningFamily
  double?: boolean
  defaultWidth: number
  defaultHeight: number
  defaultSillHeight: number
}

export interface ElementType extends RegistryEntry {
  category: ElementCategory
  plan2D: Plan2DSymbol
  scene3D: Scene3DReference
  opening?: OpeningTypeParameters
}

export const ELEMENT_TYPE_REGISTRY_VERSION = 3

export const builtinElementTypes: Registry<ElementType> = createRegistry(
  ELEMENT_TYPE_REGISTRY_VERSION,
  [
    {
      id: 'straight-wall',
      category: 'wall',
      plan2D: { symbol: 'wall-line' },
      scene3D: { builder: 'extruded-wall' },
    },
    {
      id: 'single-swing-door',
      category: 'opening',
      plan2D: { symbol: 'door-swing' },
      scene3D: { builder: 'door-frame' },
      opening: {
        family: 'swing',
        defaultWidth: 813,
        defaultHeight: 2032,
        defaultSillHeight: 0,
      },
    },
    {
      id: 'double-swing-door',
      category: 'opening',
      plan2D: { symbol: 'door-swing' },
      scene3D: { builder: 'door-frame' },
      opening: {
        family: 'swing',
        double: true,
        defaultWidth: 1626,
        defaultHeight: 2032,
        defaultSillHeight: 0,
      },
    },
    {
      // A glazed double door: opening parameters are intentionally identical to
      // double-swing-door for now. Registered as a distinct architectural type so a
      // later phase can differentiate its symbol/3D without a schema change.
      id: 'french-door',
      category: 'opening',
      plan2D: { symbol: 'door-swing' },
      scene3D: { builder: 'door-frame' },
      opening: {
        family: 'swing',
        double: true,
        defaultWidth: 1626,
        defaultHeight: 2032,
        defaultSillHeight: 0,
      },
    },
    {
      id: 'dutch-door',
      category: 'opening',
      plan2D: { symbol: 'door-swing' },
      scene3D: { builder: 'door-frame' },
      opening: {
        family: 'swing',
        defaultWidth: 813,
        defaultHeight: 2032,
        defaultSillHeight: 0,
      },
    },
    {
      id: 'pocket-door',
      category: 'opening',
      plan2D: { symbol: 'door-slide' },
      scene3D: { builder: 'door-frame' },
      opening: {
        family: 'slide',
        defaultWidth: 813,
        defaultHeight: 2032,
        defaultSillHeight: 0,
      },
    },
    {
      id: 'bypass-door',
      category: 'opening',
      plan2D: { symbol: 'door-slide' },
      scene3D: { builder: 'door-frame' },
      opening: {
        family: 'slide',
        defaultWidth: 1524,
        defaultHeight: 2032,
        defaultSillHeight: 0,
      },
    },
    {
      id: 'sliding-glass-door',
      category: 'opening',
      plan2D: { symbol: 'door-slide' },
      scene3D: { builder: 'door-frame' },
      opening: {
        family: 'slide',
        defaultWidth: 1829,
        defaultHeight: 2032,
        defaultSillHeight: 0,
      },
    },
    {
      id: 'barn-door',
      category: 'opening',
      plan2D: { symbol: 'door-slide' },
      scene3D: { builder: 'door-frame' },
      opening: {
        family: 'slide',
        defaultWidth: 965,
        defaultHeight: 2032,
        defaultSillHeight: 0,
      },
    },
    {
      id: 'bifold-door',
      category: 'opening',
      plan2D: { symbol: 'door-fold' },
      scene3D: { builder: 'door-frame' },
      opening: {
        family: 'fold',
        defaultWidth: 813,
        defaultHeight: 2032,
        defaultSillHeight: 0,
      },
    },
    {
      id: 'pivot-door',
      category: 'opening',
      plan2D: { symbol: 'door-pivot' },
      scene3D: { builder: 'door-frame' },
      opening: {
        family: 'pivot',
        defaultWidth: 914,
        defaultHeight: 2438,
        defaultSillHeight: 0,
      },
    },
    {
      id: 'cased-opening',
      category: 'opening',
      plan2D: { symbol: 'cased-opening' },
      scene3D: { builder: 'door-frame' },
      opening: {
        family: 'cased',
        defaultWidth: 914,
        defaultHeight: 2032,
        defaultSillHeight: 0,
      },
    },
    {
      id: 'double-hung-window',
      category: 'opening',
      plan2D: { symbol: 'window-fixed' },
      scene3D: { builder: 'window-frame' },
      opening: {
        family: 'window-fixed',
        defaultWidth: 900,
        defaultHeight: 1200,
        defaultSillHeight: 900,
      },
    },
    {
      // Opening parameters are intentionally identical to double-hung-window for now.
      // Registered as a distinct architectural type (different sash operation) so a later
      // phase can differentiate its symbol/3D without a schema change.
      id: 'single-hung-window',
      category: 'opening',
      plan2D: { symbol: 'window-fixed' },
      scene3D: { builder: 'window-frame' },
      opening: {
        family: 'window-fixed',
        defaultWidth: 900,
        defaultHeight: 1200,
        defaultSillHeight: 900,
      },
    },
    {
      id: 'sliding-window',
      category: 'opening',
      plan2D: { symbol: 'window-fixed' },
      scene3D: { builder: 'window-frame' },
      opening: {
        family: 'window-fixed',
        defaultWidth: 1200,
        defaultHeight: 900,
        defaultSillHeight: 1000,
      },
    },
    {
      id: 'picture-window',
      category: 'opening',
      plan2D: { symbol: 'window-fixed' },
      scene3D: { builder: 'window-frame' },
      opening: {
        family: 'window-fixed',
        defaultWidth: 1500,
        defaultHeight: 1500,
        defaultSillHeight: 600,
      },
    },
    {
      id: 'casement-window',
      category: 'opening',
      plan2D: { symbol: 'window-crank' },
      scene3D: { builder: 'window-frame' },
      opening: {
        family: 'window-crank',
        defaultWidth: 600,
        defaultHeight: 1200,
        defaultSillHeight: 900,
      },
    },
    {
      id: 'awning-window',
      category: 'opening',
      plan2D: { symbol: 'window-crank' },
      scene3D: { builder: 'window-frame' },
      opening: {
        family: 'window-crank',
        defaultWidth: 900,
        defaultHeight: 600,
        defaultSillHeight: 1500,
      },
    },
    {
      id: 'hopper-window',
      category: 'opening',
      plan2D: { symbol: 'window-crank' },
      scene3D: { builder: 'window-frame' },
      opening: {
        family: 'window-crank',
        defaultWidth: 900,
        defaultHeight: 600,
        defaultSillHeight: 300,
      },
    },
    {
      id: 'transom-window',
      category: 'opening',
      plan2D: { symbol: 'window-fixed' },
      scene3D: { builder: 'window-frame' },
      opening: {
        family: 'window-fixed',
        defaultWidth: 900,
        defaultHeight: 400,
        defaultSillHeight: 2032,
      },
    },
    {
      id: 'sidelight-window',
      category: 'opening',
      plan2D: { symbol: 'window-fixed' },
      scene3D: { builder: 'window-frame' },
      opening: {
        family: 'window-fixed',
        defaultWidth: 300,
        defaultHeight: 2032,
        defaultSillHeight: 0,
      },
    },
    {
      id: 'straight-stair',
      category: 'stair',
      plan2D: { symbol: 'stair-run' },
      scene3D: { builder: 'parametric-stair' },
    },
  ],
)
