import { createRegistry, type Registry, type RegistryEntry } from './registry'

export type ElementCategory = 'wall' | 'opening'

export interface Plan2DSymbol {
  /** Identifier of the 2D plan-symbol drawing routine. */
  symbol: string
}

export interface Scene3DReference {
  /** Identifier of the 3D builder routine or asset-reference key. */
  builder: string
}

export interface ElementType extends RegistryEntry {
  category: ElementCategory
  plan2D: Plan2DSymbol
  scene3D: Scene3DReference
}

export const ELEMENT_TYPE_REGISTRY_VERSION = 1

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
    },
  ],
)
