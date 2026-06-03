import { createRegistry, type Registry, type RegistryEntry } from './registry'

/** A surface finish mapped to material-parameter presets. See design spec 6.8. */
export interface Finish extends RegistryEntry {
  id: string
  roughness: number
  sheen: number
  specular: number
}

export const FINISH_REGISTRY_VERSION = 1

export const builtinFinishes: Registry<Finish> = createRegistry(FINISH_REGISTRY_VERSION, [
  { id: 'flat', roughness: 0.95, sheen: 0, specular: 0.02 },
  { id: 'matte', roughness: 0.9, sheen: 0, specular: 0.04 },
  { id: 'eggshell', roughness: 0.7, sheen: 0.1, specular: 0.1 },
  { id: 'satin', roughness: 0.5, sheen: 0.25, specular: 0.2 },
  { id: 'semi-gloss', roughness: 0.3, sheen: 0.5, specular: 0.4 },
  { id: 'gloss', roughness: 0.1, sheen: 0.8, specular: 0.6 },
])
