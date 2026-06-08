export type {
  EraId,
  Floor,
  Opening,
  OpeningOrientation,
  Point,
  Project,
  ProjectMeta,
  RoomOverride,
  SchemaVersion,
  Underlay,
  UnderlayPlacement,
  UnitSystem,
  Wall,
} from './model/types'
export type {
  NewFloorOptions,
  NewOpeningOptions,
  NewProjectOptions,
  NewUnderlayOptions,
  NewWallOptions,
} from './model/factories'
export {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_CEILING_HEIGHT_MM,
  DEFAULT_OPENING_HEIGHT_MM,
  DEFAULT_OPENING_WIDTH_MM,
  DEFAULT_UNDERLAY_MM_PER_PIXEL,
  DEFAULT_WALL_THICKNESS_MM,
  createEmptyProject,
  createFloor,
  createOpening,
  createUnderlay,
  createWall,
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
  OpeningFamily,
  OpeningTypeParameters,
  Plan2DSymbol,
  Scene3DReference,
} from './registries/element-types'
export { ELEMENT_TYPE_REGISTRY_VERSION, builtinElementTypes } from './registries/element-types'
export type { Command, CommandHandler } from './commands/command'
export { CommandRegistry } from './commands/command-registry'
export type { DispatcherOptions } from './commands/dispatcher'
export { DEFAULT_MAX_HISTORY, Dispatcher } from './commands/dispatcher'
export type {
  AddFloorParams,
  RemoveFloorParams,
  RenameProjectParams,
  SetFloorCeilingHeightParams,
} from './commands/handlers/project-commands'
export {
  ADD_FLOOR,
  REMOVE_FLOOR,
  RENAME_PROJECT,
  SET_FLOOR_CEILING_HEIGHT,
  addFloor,
  registerProjectCommands,
  removeFloor,
  renameProject,
  setFloorCeilingHeight,
} from './commands/handlers/project-commands'
export type {
  AddWallParams,
  MoveWallEndpointParams,
  SetWallThicknessParams,
  WallEnd,
} from './commands/handlers/wall-commands'
export {
  ADD_WALL,
  MOVE_WALL_ENDPOINT,
  SET_WALL_THICKNESS,
  addWall,
  moveWallEndpoint,
  registerWallCommands,
  setWallThickness,
} from './commands/handlers/wall-commands'
export type {
  CalibrateUnderlayParams,
  PlaceUnderlayParams,
  RemoveUnderlayParams,
  SetUnderlayOpacityParams,
  SetUnderlayVisibilityParams,
} from './commands/handlers/underlay-commands'
export {
  CALIBRATE_UNDERLAY,
  PLACE_UNDERLAY,
  REMOVE_UNDERLAY,
  SET_UNDERLAY_OPACITY,
  SET_UNDERLAY_VISIBILITY,
  calibrateUnderlay,
  placeUnderlay,
  registerUnderlayCommands,
  removeUnderlay,
  setUnderlayOpacity,
  setUnderlayVisibility,
} from './commands/handlers/underlay-commands'
export type {
  FlipOpeningParams,
  MoveOpeningParams,
  OpeningDimensions,
  OpeningOrientationAxis,
  PlaceOpeningParams,
  RemoveOpeningParams,
  ResizeOpeningParams,
} from './commands/handlers/opening-commands'
export {
  FLIP_OPENING,
  MOVE_OPENING,
  PLACE_OPENING,
  REMOVE_OPENING,
  RESIZE_OPENING,
  flipOpening,
  moveOpening,
  placeOpening,
  registerOpeningCommands,
  removeOpening,
  resizeOpening,
} from './commands/handlers/opening-commands'
export type {
  SetRoomCustomPolygonParams,
  SetRoomNameParams,
} from './commands/handlers/room-commands'
export {
  SET_ROOM_CUSTOM_POLYGON,
  SET_ROOM_NAME,
  registerRoomCommands,
  setRoomCustomPolygon,
  setRoomName,
} from './commands/handlers/room-commands'
export type { CapturedInverse } from './commands/inverse-capture'
export { captureInverse } from './commands/inverse-capture'
export type {
  RoomSceneNode,
  SceneGraph,
  SceneNode,
  UnderlaySceneNode,
  WallSceneNode,
} from './scene/scene-graph'
export {
  UNDERLAY_NODE_PREFIX,
  deriveFloorNode,
  deriveRoomNodesForFloor,
  deriveSceneGraph,
  deriveUnderlayNode,
  deriveUnderlayNodesForFloor,
  deriveWallNode,
} from './scene/scene-graph'
export { createSceneGraphDeriver } from './scene/scene-graph-deriver'
export type {
  AssumedUnit,
  DecimalPrecision,
  DisplayPrecision,
  FormatLengthOptions,
  ImperialForm,
  MetricForm,
  Millimeters,
  ParseLengthOptions,
  UnitPreferences,
} from './units'
export {
  DEFAULT_IMPERIAL_PREFERENCES,
  DEFAULT_METRIC_PREFERENCES,
  INCHES_PER_FOOT,
  MM_PER_CENTIMETER,
  MM_PER_FOOT,
  MM_PER_INCH,
  MM_PER_METER,
  centimetersToMillimeters,
  feetToMillimeters,
  formatArea,
  formatLength,
  inchesToMillimeters,
  lengthFormatOptions,
  metersToMillimeters,
  millimetersToCentimeters,
  millimetersToFeet,
  millimetersToInches,
  millimetersToMeters,
  parseLength,
  roundToDecimalPlaces,
  roundToNearestFraction,
} from './units'
export type { MigrateOptions, ProjectShape, RegistryMigration, SchemaMigration } from './migrations'
export {
  MalformedProjectError,
  MigrationFailedError,
  UnsupportedSchemaVersionError,
  migrateProject,
} from './migrations'
export { distance } from './geometry/point'
export type { PixelSegment } from './geometry/calibration'
export { applyCalibration, calibrationScale } from './geometry/calibration'
export { pointInPolygon, polygonArea } from './geometry/polygon'
export { pointOnSegment, segmentIntersection } from './geometry/segment'
export type { GraphEdge, PlanarGraph } from './topology/wall-graph'
export { DEFAULT_JUNCTION_TOLERANCE_MM, buildWallGraph } from './topology/wall-graph'
export type { Room } from './topology/rooms'
export { ROOM_ID_PREFIX, applyRoomOverrides, deriveRooms, roomKey } from './topology/rooms'
