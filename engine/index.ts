export type { SceneRoot } from './scene/build-scene'
export { buildScene } from './scene/build-scene'
export type { EdgeOverlayOptions } from './scene/edge-overlay'
export { buildFurnitureMassing } from './scene/furniture-builder'
export { buildFurnitureModelGroup, parseFurnitureModel } from './scene/furniture-model'
export { disposeObject, releaseCachedObject } from './scene/dispose-object'
export {
  assembleFloorRoot,
  buildFurnitureSubgroup,
  buildOpeningSubgroup,
  buildRoomSubgroup,
  buildWallSubgroup,
} from './scene/floor-subgroups'
export {
  addGroundPlane,
  groundExtent,
  isGroundPlane,
  GRADE_ELEVATION_MM,
} from './scene/ground-plane'
export { applyOpeningMotion, applyOpeningMotionForNode } from './scene/opening-motion'
export { sceneBounds } from './scene/scene-bounds'
export { isGlassPane, markShadowCasters } from './scene/shadow-casters'
export type { OrbitController } from './scene/orbit-controls'
export { createOrbitController } from './scene/orbit-controls'
export type { ScenePick, ScenePickAt } from './scene/pick-scene'
export { pickScene, pickSceneAt } from './scene/pick-scene'
export type { EntityScreenPosition } from './scene/entity-screen-positions'
export { entityScreenPositions } from './scene/entity-screen-positions'
export { createSelectionOutlineGroup, reconcileSelectionOutline } from './scene/selection-outline'
export type { NearWallTarget } from './scene/near-wall-transparency'
export {
  cameraFacesWallOutside,
  prepareNearWallTransparency,
  restoreNearWallTransparency,
  restoreUnenrolledNearWallTargets,
  updateNearWallTransparency,
} from './scene/near-wall-transparency'
export type { NearWallEnrollmentEntities } from './scene/near-wall-transparency-enrollment'
export { enrollNearWallTargets } from './scene/near-wall-transparency-enrollment'
export type { LightingProvider } from './lighting/lighting-provider'
export { BasicLightingProvider } from './lighting/basic-lighting-provider'
export { SolarLightingProvider } from './lighting/solar-lighting-provider'
export {
  SHADOW_MAP_SIZE,
  setLightingColor,
  setSunAndSkyColor,
  fitSunShadowToBounds,
  fitSunShadowToDirection,
} from './lighting/lighting-rig'
export type { RenderBackend } from './renderer/detect-backend'
export { detectRenderBackend } from './renderer/detect-backend'
export type { SceneRendererFactory, SceneRendererOptions } from './renderer/create-renderer'
export { loadSceneRendererFactory } from './renderer/create-renderer'
export { releaseSceneRenderer } from './renderer/release-renderer'
export type { AnimationLoopRenderer } from './renderer/draw-on-next-renderer-frame'
export { drawOnNextRendererFrame } from './renderer/draw-on-next-renderer-frame'
export { applyToneMappingOperator } from './renderer/tone-mapping'
export type { RenderedPixelReader } from './renderer/sample-rendered-color'
export {
  SAMPLE_RADIUS_PX,
  createCanvasPixelReader,
  sampleRenderedColor,
} from './renderer/sample-rendered-color'
export type { MaterialProvider, SurfaceRole } from './materials/material-provider'
export { NeutralMaterialProvider } from './materials/neutral-material-provider'
export type { SurfaceMaterialOptions } from './materials/surface-material-provider'
export { PhysicalMaterialProvider } from './materials/physical-material-provider'
export type { AmbientOcclusionParams } from './postprocessing/ambient-occlusion-params'
export {
  AO_DEFAULT_PARAMS,
  ambientOcclusionParamsFor,
} from './postprocessing/ambient-occlusion-params'
export type { AmbientOcclusionPipeline } from './postprocessing/render-scene-frame'
export { renderSceneFrame } from './postprocessing/render-scene-frame'
export { buildAmbientOcclusionPipeline } from './postprocessing/ambient-occlusion'
