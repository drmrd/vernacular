/* eslint-disable max-lines --
 * Public barrel: a flat aggregation of the core package's public re-exports. It
 * grows with the API surface (five parallel foundation tracks now contribute to
 * it), and the per-file line cap is not a meaningful constraint on a file that is
 * nothing but re-export statements. */
export type {
  Dimension,
  Extensions,
  Floor,
  FurnitureFootprint,
  FurnitureInstance,
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
  NewFurnitureOptions,
  NewOpeningOptions,
  NewProjectOptions,
  NewStairOptions,
  NewUnderlayOptions,
  NewWallOptions,
} from './model/factories'
export {
  CURRENT_SCHEMA_REVISION,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_CEILING_HEIGHT_MM,
  DEFAULT_FURNITURE_FOOTPRINT_MM,
  DEFAULT_FURNITURE_HEIGHT_MM,
  DEFAULT_OPENING_HEIGHT_MM,
  DEFAULT_OPENING_WIDTH_MM,
  DEFAULT_STAIR_LENGTH_MM,
  DEFAULT_STAIR_WIDTH_MM,
  DEFAULT_UNDERLAY_MM_PER_PIXEL,
  DEFAULT_WALL_THICKNESS_MM,
  createDimension,
  createEmptyProject,
  createFloor,
  createFurnitureInstance,
  createOpening,
  createStair,
  createUnderlay,
  createWall,
} from './model/factories'
export type { AssetReference, AssetScope } from './model/asset-reference'
export { formatAssetReference, parseAssetReference } from './model/asset-reference'
export { furnitureFootprintCorners } from './model/furniture-footprint'
export {
  DEFAULT_FLOOR_TO_FLOOR_MM,
  defaultBasementName,
  ordinalLabel,
  planBasement,
  planUpperFloor,
} from './model/floor-placement'
export type { PlannedFloor } from './model/floor-placement'
export {
  clampOpeningMove,
  clampOpeningResizeJamb,
  clampOpeningWidth,
  openingWouldOverlap,
} from './model/opening-overlap'
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
export type {
  AssetDescription,
  ColorSpaceName,
  MediaType,
  ModelDescription,
  TextureDescription,
  TextureMediaType,
} from './assets/asset-description'
export {
  assetFileName,
  isModelAsset,
  isTextureAsset,
  packAssetMediaType,
} from './assets/asset-description'
export type { AssetKind, PackValidationResult } from './assets/pack-manifest'
export { ASSET_KINDS, validatePackManifest } from './assets/pack-manifest'
export type { Registry, RegistryEntry } from './registries/registry'
export { createRegistry, getEntry, mergeRegistries } from './registries/registry'
export type { Finish } from './registries/finishes'
export { FINISH_REGISTRY_VERSION, builtinFinishes } from './registries/finishes'
export type { FloorPattern } from './registries/floor-patterns'
export { FLOOR_PATTERN_REGISTRY_VERSION, builtinFloorPatterns } from './registries/floor-patterns'
export type { TrimCategory, TrimProfile, TrimProfileShape } from './registries/trim-profiles'
export { TRIM_PROFILE_REGISTRY_VERSION, builtinTrimProfiles } from './registries/trim-profiles'
export type {
  ConstructionLayer,
  ConstructionProfile,
  ConstructionSystem,
} from './registries/construction-profiles'
export {
  CONSTRUCTION_PROFILE_REGISTRY_VERSION,
  builtinConstructionProfiles,
} from './registries/construction-profiles'
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
  HingeEdge,
  OpeningFamily,
  OpeningTypeParameters,
  Plan2DSymbol,
  Scene3DReference,
  VoidContourKind,
} from './registries/element-types'
export { ELEMENT_TYPE_REGISTRY_VERSION, builtinElementTypes } from './registries/element-types'
export type { OpeningKind } from './registries/opening-kind'
export {
  isMarkedDoor,
  openingKindOfType,
  openingTypeHasFill,
  openingTypeHasHingeSide,
} from './registries/opening-kind'
export { humanizeElementTypeId } from './registries/element-type-label'
export type { AssetDomain, AssetDomainCode, AssetTier } from './registries/asset-domains'
export {
  ASSET_DOMAIN_CODES,
  ASSET_DOMAIN_REGISTRY_VERSION,
  builtinAssetDomains,
  isAssetDomainCode,
  domainRank,
} from './registries/asset-domains'
export type { AssetCategory } from './registries/asset-categories'
export {
  ASSET_CATEGORY_REGISTRY_VERSION,
  builtinAssetCategories,
  categoriesOfDomain,
  defaultCategoryName,
} from './registries/asset-categories'
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
  RotateStairParams,
  SetStairRunTypeParams,
} from './commands/handlers/stair-commands'
export {
  ADD_STAIR,
  MOVE_STAIR,
  REMOVE_STAIR,
  ROTATE_STAIR,
  SET_STAIR_RUN_TYPE,
  addStair,
  moveStair,
  registerStairCommands,
  removeStair,
  rotateStair,
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
  MoveUnderlayParams,
  PlaceUnderlayParams,
  RemoveUnderlayParams,
  SetUnderlayOpacityParams,
  SetUnderlayVisibilityParams,
} from './commands/handlers/underlay-commands'
export {
  CALIBRATE_UNDERLAY,
  MOVE_UNDERLAY,
  PLACE_UNDERLAY,
  REMOVE_UNDERLAY,
  SET_UNDERLAY_OPACITY,
  SET_UNDERLAY_VISIBILITY,
  calibrateUnderlay,
  moveUnderlay,
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
  ResizeOpeningEdgeParams,
  ResizeOpeningParams,
  SetOpeningTypeParams,
} from './commands/handlers/opening-commands'
export {
  FLIP_OPENING,
  MOVE_OPENING,
  PLACE_OPENING,
  REMOVE_OPENING,
  RESIZE_OPENING,
  RESIZE_OPENING_EDGE,
  SET_OPENING_TYPE,
  flipOpening,
  moveOpening,
  placeOpening,
  registerOpeningCommands,
  removeOpening,
  resizeOpening,
  resizeOpeningEdge,
  setOpeningType,
} from './commands/handlers/opening-commands'
export type {
  MoveFurnitureParams,
  PlaceFurnitureParams,
  RemoveFurnitureParams,
  ResizeFurnitureParams,
  RotateFurnitureParams,
  SetFurnitureHeightParams,
  SetFurnitureNameParams,
} from './commands/handlers/furniture-commands'
export {
  MOVE_FURNITURE,
  PLACE_FURNITURE,
  REMOVE_FURNITURE,
  RESIZE_FURNITURE,
  ROTATE_FURNITURE,
  SET_FURNITURE_HEIGHT,
  SET_FURNITURE_NAME,
  moveFurniture,
  placeFurniture,
  registerFurnitureCommands,
  removeFurniture,
  resizeFurniture,
  rotateFurniture,
  setFurnitureHeight,
  setFurnitureName,
} from './commands/handlers/furniture-commands'
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
  FurnitureSceneNode,
  OpeningSceneNode,
  RoomSceneNode,
  SceneGraph,
  SceneNode,
  StairSceneNode,
  UnderlaySceneNode,
  WallSceneNode,
} from './scene/scene-graph'
export {
  DIMENSION_NODE_PREFIX,
  FLOOR_NODE_PREFIX,
  FURNITURE_NODE_PREFIX,
  OPENING_NODE_PREFIX,
  STAIR_NODE_PREFIX,
  UNDERLAY_NODE_PREFIX,
  WALL_NODE_PREFIX,
  deriveDimensionNode,
  deriveDimensionNodesForFloor,
  deriveFloorNode,
  deriveFurnitureNode,
  deriveOpeningNode,
  deriveOpeningNodesForFloor,
  deriveRoomNodesForFloor,
  deriveSceneGraph,
  deriveStairNodes,
  deriveUnderlayNode,
  deriveUnderlayNodesForFloor,
  deriveWallNode,
} from './scene/scene-graph'
export type { ExteriorWall } from './scene/exterior-walls'
export { exteriorWalls } from './scene/exterior-walls'
export { openingRoomSide, withRoomSide } from './scene/opening-room-side'
export type { Entrance, FrontDirectionInput, PlanDirection } from './scene/front-direction'
export { PLAN_DOWN, entranceOf, frontDirection } from './scene/front-direction'
export type { EntranceRole } from './scene/entrance-role'
export { entranceRoleOf } from './scene/entrance-role'
export type { WallPlanSegment } from './scene/wall-attached-furniture'
export {
  furnitureAttachedToWall,
  withAttachedFurniture,
  WALL_ATTACHMENT_TOLERANCE_MM,
} from './scene/wall-attached-furniture'
export { rawWallId } from './scene/wall-id'
export type { JunctionFadeGroup } from './scene/junction-fade'
export { junctionFadeGroups } from './scene/junction-fade'
export type { WallPlace, WallRoomSides, WallStretch } from './scene/wall-room-sides'
export { roomSidesAt, wallStretches } from './scene/wall-room-sides'
export { createSceneGraphDeriver } from './scene/scene-graph-deriver'
export { sceneGraphForFloor } from './scene/scene-graph-for-floor'
export { sceneGraphHasGeometry } from './scene/scene-graph-empty'
export type { Vector3, Bounds3 } from './scene/vector3'
export { planToWorld } from './scene/plan-to-world'
export { cameraOutsideBuilding } from './scene/camera-outside-building'
export type { CameraPose, CameraViewport } from './scene/camera-framing'
export {
  cameraDepthRange,
  cameraFitDistance,
  frameSceneCamera,
  withDepthRangeOf,
  DEFAULT_CAMERA_POSE,
} from './scene/camera-framing'
export type { CameraPreset } from './scene/camera-presets'
export { cameraPresetPose, doorwayPose } from './scene/camera-presets'
export { signedArea, loopWorldNormal, canonicalOuterLoop, canonicalHoleLoop } from './scene/winding'
export { wallVerticalSpan, floorSlabVerticalSpan } from './scene/vertical-datum'
export { wallHeight } from './scene/wall-height'
export { ceilingHeight } from './scene/ceiling-height'
export { DEFAULT_FLOOR_SLAB_THICKNESS_MM, floorSlabThickness } from './scene/floor-slab'
export type { Contour, ContourSegment } from './scene/contour'
export { openingVoidContour, rectangularVoidContour } from './scene/opening-void'
export type {
  HingeMotion,
  NoMotion,
  OpeningMotion,
  OpeningPartId,
  SlideAxis,
  SlideMotion,
} from './scene/opening-motion'
export { openingMotion, openingPartMotion, openingParts } from './scene/opening-motion'
export type { OpeningPose } from './scene/opening-pose'
export {
  advanceOpeningPose,
  openingPartTarget,
  openingTargetPose,
  settledPose,
} from './scene/opening-pose'
export { openingHeadArcs } from './scene/opening-head'
export type { OpeningHeadArc } from './scene/opening-head'
export { resolveTrimProfileSection, trimProfileSection } from './scene/trim-profile'
export {
  constructionTotalThickness,
  effectiveWallThickness,
  resolveConstructionProfile,
} from './scene/construction-profile'
export type { ResolvedConstruction } from './scene/construction-profile'
export {
  openingFill,
  LEAF_REVEAL_GAP_MM,
  DOOR_LEAF_THICKNESS_MM,
  SASH_FRAME_WIDTH_MM,
  SASH_FRAME_THICKNESS_MM,
  GLASS_THICKNESS_MM,
} from './scene/opening-fill'
export type {
  OpeningFillPart,
  OpeningFillRole,
  OpeningFillExtent,
  HungSash,
} from './scene/opening-fill'
export type { OpeningFillKind } from './registries/element-types'
export type { PointerLookDelta, WalkInput, WalkState } from './scene/walk-camera'
export {
  MAX_WALK_PITCH_RAD,
  WALK_EYE_HEIGHT_MM,
  WALK_LOOK_DISTANCE_MM,
  WALK_SPEED_MM_PER_S,
  accumulatePointerLook,
  advanceWalk,
  pointerLookDelta,
  walkLookDirection,
  walkLookTarget,
} from './scene/walk-camera'
export type { PlanarPoint, WallSegment, WalkCollisionWorld } from './scene/walk-collision'
export {
  furnitureSegmentsForWalk,
  passableDoorIds,
  resolveWalkCollision,
  wallSegmentsForWalk,
} from './scene/walk-collision'
export type { OpenParts, OpeningPartRef } from './scene/open-parts'
export {
  keepOpenPartsOfTypes,
  openOpeningIds,
  sameOpenParts,
  toggleOpenPart,
} from './scene/open-parts'
export type { OpeningInteractionState } from './scene/opening-interaction'
export { emptyOpeningInteraction, isOpeningOpen, toggleOpening } from './scene/opening-interaction'
export type { OpeningAimOutline } from './scene/opening-aim-outline'
export { openingAimOutline } from './scene/opening-aim-outline'
export type { OpeningBand, OpeningReachHit } from './scene/opening-reach'
export { DEFAULT_INTERACT_REACH_MM, openingUnderReach } from './scene/opening-reach'
export { OPENNESS_RATE_PER_S, advanceOpenness } from './scene/opening-openness'
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
  formatAdaptiveLength,
  formatArea,
  formatEntryMagnitude,
  formatLength,
  inchesToMillimeters,
  lengthFormatOptions,
  metersToMillimeters,
  millimetersToCentimeters,
  millimetersToFeet,
  millimetersToInches,
  millimetersToMeters,
  parseLength,
  preferencesForUnits,
  roundToDecimalPlaces,
  roundToNearestFraction,
} from './units'
export {
  MAX_LENGTH_MM,
  MIN_POSITIVE_LENGTH_MM,
  InvalidLengthError,
  assertNonNegativeLength,
  assertPositiveLength,
} from './units/length-bounds'
export type { MigrateOptions, ProjectShape, RegistryMigration, SchemaMigration } from './migrations'
export {
  MalformedProjectError,
  MigrationFailedError,
  UnsupportedSchemaVersionError,
  isMigrationPending,
  migrateProject,
} from './migrations'
export { distance, rotatePoint, translatePoint } from './geometry/point'
export type { PixelSegment } from './geometry/calibration'
export { applyCalibration, calibrationScale } from './geometry/calibration'
export type { DimensionGeometry } from './geometry/dimension'
export { dimensionGeometry, dimensionLength } from './geometry/dimension'
export { insetPolygon, pointInPolygon, polygonArea, polygonCentroid } from './geometry/polygon'
export { lineIntersection, pointOnSegment, segmentIntersection } from './geometry/segment'
export { dot, leftNormal, leftPerp, shift, subtract, unit } from './geometry/vector'
export {
  ANGLE_TOLERANCE_RAD,
  CAP_AREA_LIMIT_MM2,
  CROSS_PRODUCT_PARALLEL_LIMIT,
  DEFAULT_JUNCTION_TOLERANCE_MM,
  DEGENERATE_SQUARED_LENGTH_MM2,
  DERIVATION_LENGTH_TOLERANCE_MM,
  DERIVED_COORDINATE_GRID_MM,
  FILL_CORNER_MATCH_MM,
  FRONT_DIRECTION_TIE,
  GROUND_PICK_TIE_MM,
  JOIN_DISTANCE_MM,
  LENGTH_TOLERANCE_MM,
  MIN_FACE_AREA_MM2,
  OUTLINE_TOLERANCE_MM,
  REACH_RAY_PARALLEL_LIMIT,
  ROOM_RING_TOLERANCE_MM,
  SMALLEST_IMPERIAL_DISPLAY_STEP_MM,
  SMALLEST_METRIC_DISPLAY_STEP_MM,
  SNAP_UNITS_PER_MM,
  SUPPORTED_EXTENT_MM,
  UNIT_NORMAL_DOT_LIMIT,
  VOID_SAME_POINT_MM,
  WALK_CONTACT_MM,
  WALL_BOUNDARY_MATCH_MM,
  WALL_FACE_DEGENERATE_LENGTH_MM,
} from './geometry/tolerance'
export { pathEnd, pathStart, wallPath } from './geometry/wall-path'
export type {
  WallFaceCorners,
  WallFaceGap,
  WallFaceRun,
  WallFaceStretch,
} from './geometry/wall-face'
export { wallFaceGeometry } from './geometry/wall-face'
export type { OpeningGeometry } from './topology/openings'
export { deriveOpeningGeometry, openingFootprint, MIN_OPENING_WIDTH_MM } from './topology/openings'
export type { GraphEdge, PlanarGraph } from './topology/wall-graph'
export { buildWallGraph, buildWallGraphWithCoverage } from './topology/wall-graph'
export type { WallCoverage } from './topology/register-wall-stretches'
export type { WallPart } from './topology/uncovered-parts'
export { drawnWallNote, uncoveredParts, uncoveredPartsOf } from './topology/uncovered-parts'
export type { WallFootprint } from './topology/wall-footprint'
export { MITER_LIMIT, wallFootprints } from './topology/wall-footprint'
export type { JunctionFill } from './topology/junction-fill'
export { junctionFills } from './topology/junction-fill'
export type { OpeningPlacement, ResolvedOpeningEdge } from './topology/opening-edge'
export { edgeCarriesWall, resolveOpeningEdge } from './topology/opening-edge'
export type { Room } from './topology/rooms'
export { ROOM_ID_PREFIX, applyRoomOverrides, deriveRooms, roomKey } from './topology/rooms'
export type {
  FloorPlanGeometry,
  NetworkEdge,
  NetworkWall,
  OpeningSpan,
  PlanGeometryRegistries,
  PlanRoom,
  SetAside,
  WallFaceRecord,
  WallNetwork,
  WallSide,
} from './topology/floor-plan-geometry'
export {
  createPlanGeometryDeriver,
  deriveFloorPlanGeometry,
  deriveOpeningSpans,
  derivePlanRooms,
  deriveWallNetwork,
} from './topology/floor-plan-geometry'
export { wallNetworkBuildCount, wallNetworkFor } from './topology/wall-network-memo'
export { junctionFanBuildCount } from './topology/junction-fans'
export { stairWellPolygon } from './topology/stair-well'
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
export { createPlanPreview } from './export/svg/plan-preview'
export type { LinearRgb, OkLab, Srgb } from './color/oklab'
export { linearToSrgb, okLabToSrgb, srgbToLinear, srgbToOkLab } from './color/oklab'
export {
  kelvinToLinearRgb,
  formatColorTemperature,
  colorTemperatureLabel,
  MIN_COLOR_TEMPERATURE_K,
  MAX_COLOR_TEMPERATURE_K,
  DEFAULT_COLOR_TEMPERATURE_K,
} from './color/color-temperature'
export type { ObservationInstant } from './environment/observation-time'
export {
  MINUTES_PER_DAY,
  formatObservationDateTime,
  formatObservationTime,
  isObservationInstantIso,
  observationInstantToIso,
  parseObservationInstant,
} from './environment/observation-time'
export type {
  OpeningConditions,
  OpeningConditionsInput,
  OpeningInstantInput,
} from './environment/opening-instant'
export {
  openingConditions,
  openingInstant,
  storedOpeningConditions,
} from './environment/opening-instant'
export type { SolarAngles, SolarPositionInput } from './environment/solar-position'
export { solarPosition } from './environment/solar-position'
export { utcOffsetMinutesFor } from './environment/timezone-offset'
export { sunWorldDirection } from './environment/sun-world-direction'
export type { ShadowFitInput } from './environment/shadow-fit'
export { MAX_SHADOW_TEXEL_MM, boundsRadius, shadowFitBounds } from './environment/shadow-fit'
export type { SkyLighting } from './environment/sky-model'
export { DEFAULT_CLOUD_COVER, skyLighting } from './environment/sky-model'
export type { SkyDomeInput } from './environment/sky-dome'
export { skyDomeRadiance, sunAltitudeOf } from './environment/sky-dome'
export {
  GROUND_BOUNCE_COLOR,
  GROUND_GRASS_REFERENCE,
  GROUND_SURFACE_COLOR,
  GROUND_SURFACE_HEX,
} from './environment/ground-surface'
export {
  NEUTRAL_DOME_SPHERICAL_HARMONICS,
  SH_COEFFICIENT_COUNT,
  evaluateSphericalHarmonics,
  projectDomeToSphericalHarmonics,
} from './environment/spherical-harmonics'
export type {
  EnvironmentLighting,
  EnvironmentLightingInput,
} from './environment/environment-lighting'
export { computeEnvironmentLighting } from './environment/environment-lighting'
export { agxNeutralInverse, agxNeutralResponse } from './environment/tone-response'
export {
  DAYLIGHT_REFERENCE_INSTANT,
  DAYLIGHT_REFERENCE_PLACE,
  referenceLightingInput,
} from './environment/daylight-reference'
export type { MatteSurface } from './environment/light-model'
export { predictedMatteRadiance, skyAmbientLevel } from './environment/light-model'
export type { DaylightSample, DaylightSite } from './environment/daylight-site'
export { daylightSampleOf, daylightSiteFor } from './environment/daylight-site'
export type { DaylightCalibration, LevelCardLight } from './environment/daylight-calibration'
export {
  DAYLIGHT_CALIBRATION,
  LUX_PER_UNIT_IRRADIANCE,
  NIGHT_DIFFUSE_LEVEL,
  REFERENCE_HORIZONTAL_ILLUMINANCE_LUX,
  SUN_OPTICAL_DEPTH,
  WHITE_CODE_FLOOR,
  diffuseLevelAt,
  directToDiffuseRatio,
  levelCardLight,
  relativeAirMass,
  sunLevelAt,
} from './environment/daylight-calibration'
export type {
  LightingMode,
  EnvironmentState,
  EnvironmentSceneIdentity,
} from './environment/environment-state'
export {
  DEFAULT_ENVIRONMENT_STATE,
  openingEnvironmentFor,
  captureEnvironmentScene,
  applyEnvironmentScene,
  viewingConditionsOf,
} from './environment/environment-state'
export { NEUTRAL_REFERENCE_WHITE, colorCheckLighting } from './environment/color-check'
export type { ToneMappingOperator } from './environment/tone-mapping'
export { toneMappingOperatorFor } from './environment/tone-mapping'
export { formatHex, parseHex } from './color/hex'
export { contrastRatio, linearLuminance, relativeLuminance } from './color/contrast'
export { readableTextColor } from './color/readable-text-color'
export type { Color, NamedColor } from './color/color'
export { colorFromHex, colorFromOkLab } from './color/color'
export { mixColors, nearestColor, oklabChroma, perceptualDistance } from './color/operations'
export type { ToneMapExtremeSwatch } from './color/color-accuracy'
export {
  COLOR_ACCURACY_SWATCHES,
  COLOR_ACCURACY_TOLERANCE,
  TONE_MAP_EXTREME_NEUTRAL_CHROMA_BOUND,
  TONE_MAP_EXTREME_SWATCHES,
  TONE_MAP_EXTREME_TOLERANCE,
  withinColorTolerance,
  withinNeutralChroma,
} from './color/color-accuracy'
export type { PerceivedShift } from './color/perceived-shift'
export {
  PERCEIVED_AXIS_THRESHOLD,
  describePerceivedShift,
  perceivedShiftLabel,
} from './color/perceived-shift'
export type { Palette } from './registries/palettes'
export { PALETTE_REGISTRY_VERSION, builtinPalettes } from './registries/palettes'
export type { ProjectPalette } from './model/types'
export type { SurfaceRef, SurfaceTreatment } from './model/paint'
export { patternTreatment, solidTreatment, surfaceKey, surfaceTintHex } from './model/paint'
export { resolveSurfacePaint } from './paint/resolve-surface-paint'
export type { PaintableSurface } from './paint/paintable-surfaces'
export { paintableSurfaces } from './paint/paintable-surfaces'
export type { LatLong, Obstruction, Site } from './model/site'
export { DEFAULT_GRADE_ELEVATION_MM, resolveGradeElevation } from './model/site'
export type {
  AddPaletteColorParams,
  CreateProjectPaletteParams,
  RemovePaletteColorParams,
  RemoveProjectPaletteParams,
  RenameProjectPaletteParams,
} from './commands/handlers/palette-commands'
export {
  ADD_PALETTE_COLOR,
  CREATE_PROJECT_PALETTE,
  REMOVE_PALETTE_COLOR,
  REMOVE_PROJECT_PALETTE,
  RENAME_PROJECT_PALETTE,
  addPaletteColor,
  createProjectPalette,
  registerPaletteCommands,
  removePaletteColor,
  removeProjectPalette,
  renameProjectPalette,
} from './commands/handlers/palette-commands'
export type {
  AssignSurfaceTreatmentParams,
  ClearSurfacePaintParams,
} from './commands/handlers/paint-commands'
export {
  ASSIGN_SURFACE_TREATMENT,
  CLEAR_SURFACE_PAINT,
  assignSurfacePaint,
  assignSurfaceTreatment,
  clearSurfacePaint,
  registerPaintCommands,
} from './commands/handlers/paint-commands'
export type {
  AddObstructionParams,
  RemoveObstructionParams,
  SetSiteLocationParams,
  SetSiteNorthBearingParams,
  SetSiteTimezoneParams,
} from './commands/handlers/site-commands'
export {
  ADD_OBSTRUCTION,
  REMOVE_OBSTRUCTION,
  SET_SITE_LOCATION,
  SET_SITE_NORTH_BEARING,
  SET_SITE_TIMEZONE,
  addObstruction,
  registerSiteCommands,
  removeObstruction,
  setSiteLocation,
  setSiteNorthBearing,
  setSiteTimezone,
} from './commands/handlers/site-commands'
export type { MarkMainEntranceParams } from './commands/handlers/entrance-commands'
export {
  CLEAR_MAIN_ENTRANCE,
  MARK_MAIN_ENTRANCE,
  clearMainEntrance,
  markMainEntrance,
  registerEntranceCommands,
} from './commands/handlers/entrance-commands'
export { countMarkedDoors, withoutEntranceMark } from './commands/entrance-rule'
export type {
  EnvironmentScene,
  OpeningLight,
  ViewingConditions,
  WeatherConditions,
} from './model/environment-scene'
export type {
  AddEnvironmentSceneParams,
  RemoveEnvironmentSceneParams,
  RenameEnvironmentSceneParams,
} from './commands/handlers/environment-scene-commands'
export {
  ADD_ENVIRONMENT_SCENE,
  REMOVE_ENVIRONMENT_SCENE,
  RENAME_ENVIRONMENT_SCENE,
  addEnvironmentScene,
  registerEnvironmentSceneCommands,
  removeEnvironmentScene,
  renameEnvironmentScene,
} from './commands/handlers/environment-scene-commands'
export type { SetOpeningLightParams } from './commands/handlers/opening-light-commands'
export {
  CLEAR_OPENING_LIGHT,
  SET_OPENING_LIGHT,
  clearOpeningLight,
  registerOpeningLightCommands,
  setOpeningLight,
} from './commands/handlers/opening-light-commands'
export {
  createDocumentValidator,
  createLoadValidationGate,
  createStrictValidator,
  createTolerantValidator,
  isReverseDnsNamespace,
} from './format'
export type {
  DocumentIssueReporter,
  DocumentValidationResult,
  DocumentValidator,
  ExtensionSchemaRegistry,
  LoadValidationGateOptions,
} from './format'
export { KNOWN_KEYS, KNOWN_ROOT_TYPE, typesWithExtensions, variantTypeOf } from './model/known-keys'
export type { KnownKeyTable, KnownType, KnownUnion, KnownValue } from './model/known-keys'
export { registerAllProjectCommands } from './commands/handlers/register-all-project-commands'
export type { DaylightAperture, DaylightField, DaylightRoom } from './daylight/daylight-field'
export {
  createDaylightField,
  DAYLIGHT_FIELD_CELL_SIZE_MM,
  daylightFieldCellIndex,
  DEFAULT_WINDOW_NET_TRANSMITTANCE,
  OPEN_DOORWAY_NET_TRANSMITTANCE,
  sampleSkyVisibility,
  SKY_VISIBILITY_CHANNEL,
} from './daylight/daylight-field'
export type { DaylightFieldSolver, SkyLuminance } from './daylight/sky-visibility'
export {
  createDaylightFieldSolver,
  DAYLIGHT_WORK_PLANE_HEIGHT_MM,
  UNIFORM_SKY,
  UNPAINTED_SURFACE_REFLECTANCE,
} from './daylight/sky-visibility'
export type { Reveal, WallRectangle } from './daylight/form-factor'
export { horizontalPointToWallRectangle, visibleThroughReveal } from './daylight/form-factor'
export type { FormatFault } from './format/codec/codec-types'
export type {
  CodecOptions,
  DecodedDocument,
  DecodeFailure,
  DecodeResult,
  EncodedDocument,
  GraftDropped,
  ReadFailure,
} from './format/codec/codec-types'
export { decodeDocument } from './format/codec/decode-document'
export { encodeDocument } from './format/codec/encode-document'
export { bestEffortProjectName, readStoredFacts } from './format/best-effort-read'
export type { CatalogId, CatalogIdParse } from './assets/catalog-id'
export {
  parseCatalogId,
  formatCatalogId,
  categoryOf,
  RESERVED_NAMESPACE_PREFIXES,
} from './assets/catalog-id'
export type { SocketPredicate, SocketPredicateParse } from './assets/socket-predicate'
export { parseSocketPredicate, matchesPredicate } from './assets/socket-predicate'
export type { SubResource, SubResourceKind, SubResourceParse } from './assets/sub-resource'
export {
  SUB_RESOURCE_KINDS,
  SUB_RESOURCE_SEPARATOR,
  isSubResourceName,
  formatSubResource,
  parseSubResourceText,
} from './assets/sub-resource'
export type { DataRemovingRepair, RepairOffer } from './repairs/repair-list'
export { DATA_REMOVING_REPAIRS, findRepairOffer } from './repairs/repair-list'
export { repairOfferFor } from './repairs/find-repair-offer'
