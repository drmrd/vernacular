export type { EraId, Floor, Project, ProjectMeta, SchemaVersion, UnitSystem } from './model/types'
export type { NewFloorOptions, NewProjectOptions } from './model/factories'
export {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_CEILING_HEIGHT_MM,
  createEmptyProject,
  createFloor,
} from './model/factories'
export type { AssetReference, AssetScope } from './model/asset-reference'
export { formatAssetReference, parseAssetReference } from './model/asset-reference'
export type { Registry, RegistryEntry } from './registries/registry'
export { createRegistry, getEntry, mergeRegistries } from './registries/registry'
export type { Finish } from './registries/finishes'
export { FINISH_REGISTRY_VERSION, builtinFinishes } from './registries/finishes'
export type {
  ElementCategory,
  ElementType,
  Plan2DSymbol,
  Scene3DReference,
} from './registries/element-types'
export { ELEMENT_TYPE_REGISTRY_VERSION, builtinElementTypes } from './registries/element-types'
export type { Command, CommandHandler } from './commands/command'
export { CommandRegistry } from './commands/command-registry'
export type { CapturedInverse } from './commands/inverse-capture'
export { captureInverse } from './commands/inverse-capture'
