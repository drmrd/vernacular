export type { SceneRoot } from './scene/build-scene'
export { buildScene } from './scene/build-scene'
export {
  assembleFloorRoot,
  buildOpeningSubgroup,
  buildRoomSubgroup,
  buildWallSubgroup,
} from './scene/floor-subgroups'
export { sceneBounds } from './scene/scene-bounds'
export { markShadowCasters } from './scene/shadow-casters'
export type { OrbitController } from './scene/orbit-controls'
export { createOrbitController } from './scene/orbit-controls'
export { pickEntityId, pickEntityIdAt } from './scene/pick-entity'
export type { EntityScreenPosition } from './scene/entity-screen-positions'
export { entityScreenPositions } from './scene/entity-screen-positions'
export { createSelectionOutlineGroup, reconcileSelectionOutline } from './scene/selection-outline'
export type { NearWallTarget } from './scene/near-wall-transparency'
export {
  cameraFacesWallOutside,
  prepareNearWallTransparency,
  updateNearWallTransparency,
} from './scene/near-wall-transparency'
export type { LightingProvider } from './lighting/lighting-provider'
export { BasicLightingProvider } from './lighting/basic-lighting-provider'
export { setLightingColor, removeLighting, fitSunShadowToBounds } from './lighting/lighting-rig'
export type { RenderBackend } from './renderer/detect-backend'
export { detectRenderBackend } from './renderer/detect-backend'
export type { SceneRendererOptions } from './renderer/create-renderer'
export { createSceneRenderer } from './renderer/create-renderer'
export type { MaterialProvider, SurfaceRole } from './materials/material-provider'
export { NeutralMaterialProvider } from './materials/neutral-material-provider'
export type { PaintMaterialOptions } from './materials/paint-material-provider'
export { PaintMaterialProvider } from './materials/paint-material-provider'
