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
