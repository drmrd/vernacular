/* eslint-disable max-lines --
 * Public barrel: a flat aggregation of the core package's public re-exports. It
 * grows with the API surface (five parallel foundation tracks now contribute to
 * it), and the per-file line cap is not a meaningful constraint on a file that is
 * nothing but re-export statements. */
export type {
  Dimension,
  Floor,
  Opening,
  OpeningOrientation,
  PeriodId,
  Point,
  Project,
  ProjectMeta,
  RoomOverride,
  RoomPurposeId,
  SchemaVersion,
  Stair,
  StairConnection,
  StairRunType,
  StyleId,
  StyleTag,
  Underlay,
  UnderlayKind,
  UnderlayPlacement,
  UnderlaySource,
  UnitSystem,
  Wall,
} from './model/types'
export type {
  NewDimensionOptions,
  NewFloorOptions,
  NewOpeningOptions,
  NewProjectOptions,
  NewStairOptions,
  NewUnderlayOptions,
  NewWallOptions,
} from './model/factories'
export {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_CEILING_HEIGHT_MM,
  DEFAULT_OPENING_HEIGHT_MM,
  DEFAULT_OPENING_WIDTH_MM,
  DEFAULT_STAIR_LENGTH_MM,
  DEFAULT_STAIR_WIDTH_MM,
  DEFAULT_UNDERLAY_MM_PER_PIXEL,
  DEFAULT_WALL_THICKNESS_MM,
  createDimension,
  createEmptyProject,
  createFloor,
  createOpening,
  createStair,
  createUnderlay,
  createWall,
} from './model/factories'
export type { AssetReference, AssetScope } from './model/asset-reference'
export { formatAssetReference, parseAssetReference } from './model/asset-reference'
export type {
  AssetFootprint,
  AssetResolution,
  MissingAsset,
  ResolvedAsset,
  ScopeKind,
} from './assets/asset-resolution'
export {
  SCOPE_PRECEDENCE,
  missingAsset,
  orderScopesByPrecedence,
  resolvedAsset,
} from './assets/asset-resolution'
export type { Registry, RegistryEntry } from './registries/registry'
export { createRegistry, getEntry, mergeRegistries } from './registries/registry'
export type { Finish } from './registries/finishes'
export { FINISH_REGISTRY_VERSION, builtinFinishes } from './registries/finishes'
export type { Period } from './registries/periods'
export { PERIOD_REGISTRY_VERSION, builtinPeriods } from './registries/periods'
export type { Style, StyleCategory } from './registries/styles'
export { STYLE_REGISTRY_VERSION, builtinStyles } from './registries/styles'
export type { RoomPurpose } from './registries/room-purposes'
export { ROOM_PURPOSE_REGISTRY_VERSION, builtinRoomPurposes } from './registries/room-purposes'
export { resolvePeriod } from './architecture-era/resolve-period'
export { resolveStyle } from './architecture-era/resolve-style'
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
  RenameFloorParams,
  RenameProjectParams,
  ReorderFloorParams,
  SetFloorCeilingHeightParams,
  SetFloorElevationParams,
  SetFloorPeriodParams,
  SetFloorStyleParams,
  SetProjectPeriodParams,
  SetProjectStyleParams,
  SetUnitsParams,
} from './commands/handlers/project-commands'
export {
  ADD_FLOOR,
  REMOVE_FLOOR,
  RENAME_FLOOR,
  RENAME_PROJECT,
  REORDER_FLOOR,
  SET_FLOOR_CEILING_HEIGHT,
  SET_FLOOR_ELEVATION,
  SET_FLOOR_PERIOD,
  SET_FLOOR_STYLE,
  SET_PROJECT_PERIOD,
  SET_PROJECT_STYLE,
  SET_UNITS,
  addFloor,
  registerProjectCommands,
  removeFloor,
  renameFloor,
  renameProject,
  reorderFloor,
  setFloorCeilingHeight,
  setFloorElevation,
  setFloorPeriod,
  setFloorStyle,
  setProjectPeriod,
  setProjectStyle,
  setUnits,
} from './commands/handlers/project-commands'
export type {
  AddStairParams,
  MoveStairParams,
  RemoveStairParams,
  SetStairRunTypeParams,
} from './commands/handlers/stair-commands'
export {
  ADD_STAIR,
  MOVE_STAIR,
  REMOVE_STAIR,
  SET_STAIR_RUN_TYPE,
  addStair,
  moveStair,
  registerStairCommands,
  removeStair,
  setStairRunType,
} from './commands/handlers/stair-commands'
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
  AddDimensionParams,
  RemoveDimensionParams,
} from './commands/handlers/dimension-commands'
export {
  ADD_DIMENSION,
  REMOVE_DIMENSION,
  addDimension,
  registerDimensionCommands,
  removeDimension,
} from './commands/handlers/dimension-commands'
export type {
  DeleteEntitiesParams,
  PasteEntitiesParams,
  RotateEntitiesParams,
  TranslateEntitiesParams,
} from './commands/handlers/transform-commands'
export {
  DELETE_ENTITIES,
  PASTE_ENTITIES,
  ROTATE_ENTITIES,
  TRANSLATE_ENTITIES,
  deleteEntities,
  pasteEntities,
  registerTransformCommands,
  rotateEntities,
  selectionCenter,
  translateEntities,
} from './commands/handlers/transform-commands'
export type {
  SetRoomCeilingHeightParams,
  SetRoomCustomPolygonParams,
  SetRoomNameParams,
  SetRoomPeriodParams,
  SetRoomPurposeParams,
  SetRoomStyleParams,
  SetRoomSubPurposeParams,
} from './commands/handlers/room-commands'
export {
  SET_ROOM_CEILING_HEIGHT,
  SET_ROOM_CUSTOM_POLYGON,
  SET_ROOM_NAME,
  SET_ROOM_PERIOD,
  SET_ROOM_PURPOSE,
  SET_ROOM_STYLE,
  SET_ROOM_SUB_PURPOSE,
  registerRoomCommands,
  setRoomCeilingHeight,
  setRoomCustomPolygon,
  setRoomName,
  setRoomPeriod,
  setRoomPurpose,
  setRoomStyle,
  setRoomSubPurpose,
} from './commands/handlers/room-commands'
export type { CapturedInverse } from './commands/inverse-capture'
export { captureInverse } from './commands/inverse-capture'
export type {
  DimensionSceneNode,
  OpeningSceneNode,
  RoomSceneNode,
  SceneGraph,
  SceneNode,
  UnderlaySceneNode,
  WallSceneNode,
} from './scene/scene-graph'
export {
  DIMENSION_NODE_PREFIX,
  OPENING_NODE_PREFIX,
  UNDERLAY_NODE_PREFIX,
  WALL_NODE_PREFIX,
  deriveDimensionNode,
  deriveDimensionNodesForFloor,
  deriveFloorNode,
  deriveOpeningNode,
  deriveOpeningNodesForFloor,
  deriveRoomNodesForFloor,
  deriveSceneGraph,
  deriveUnderlayNode,
  deriveUnderlayNodesForFloor,
  deriveWallNode,
} from './scene/scene-graph'
export { createSceneGraphDeriver } from './scene/scene-graph-deriver'
export type { Vector3, Bounds3 } from './scene/vector3'
export { planToWorld } from './scene/plan-to-world'
export type { CameraPose } from './scene/camera-framing'
export { frameSceneCamera, DEFAULT_CAMERA_POSE } from './scene/camera-framing'
export { signedArea, loopWorldNormal, canonicalOuterLoop, canonicalHoleLoop } from './scene/winding'
export { wallVerticalSpan, floorSlabVerticalSpan } from './scene/vertical-datum'
export type { Contour, ContourSegment } from './scene/contour'
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
export { distance, rotatePoint, translatePoint } from './geometry/point'
export type { PixelSegment } from './geometry/calibration'
export { applyCalibration, calibrationScale } from './geometry/calibration'
export type { DimensionGeometry } from './geometry/dimension'
export { dimensionGeometry, dimensionLength } from './geometry/dimension'
export { insetPolygon, pointInPolygon, polygonArea, polygonCentroid } from './geometry/polygon'
export { pointOnSegment, segmentIntersection } from './geometry/segment'
export type { OpeningGeometry } from './topology/openings'
export { deriveOpeningGeometry, openingFootprint } from './topology/openings'
export type { GraphEdge, PlanarGraph } from './topology/wall-graph'
export { DEFAULT_JUNCTION_TOLERANCE_MM, buildWallGraph } from './topology/wall-graph'
export type { Room } from './topology/rooms'
export { ROOM_ID_PREFIX, applyRoomOverrides, deriveRooms, roomKey } from './topology/rooms'
export type { ClipboardSnapshot, InstantiatedEntities } from './clipboard/clipboard'
export {
  buildClipboardSnapshot,
  deserializeClipboard,
  instantiateClipboard,
  serializeClipboard,
} from './clipboard/clipboard'
export type { ExportMediaType, ExportResult, Exporter } from './export/exporter'
export type { PlanBounds, SvgView, SvgViewOptions } from './export/svg/svg-view'
export { createSvgView, planContentBounds } from './export/svg/svg-view'
export type { SvgPlanExportOptions } from './export/svg/svg-plan-exporter'
export { SvgPlanExporter } from './export/svg/svg-plan-exporter'
