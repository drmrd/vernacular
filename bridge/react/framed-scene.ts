import {
  buildWallGraph,
  exteriorWalls,
  frameSceneCamera,
  junctionFadeGroups,
  kelvinToLinearRgb,
  DEFAULT_COLOR_TEMPERATURE_K,
  type Bounds3,
  type CameraPose,
  type Point,
  type SceneGraph,
  type SurfaceTreatment,
} from '../../core'
import {
  buildScene,
  markShadowCasters,
  prepareNearWallTransparency,
  PaintMaterialProvider,
  sceneBounds,
  type EdgeOverlayOptions,
  type NearWallTarget,
  type SceneRoot,
} from '../../engine'

export interface FramedScene {
  root: SceneRoot
  pose: CameraPose
  bounds: Bounds3 | null
  nearWallTargets: NearWallTarget[]
  // The floor's room outlines, in plan millimeters, so the per-frame near-wall
  // fade can tell whether the orbit camera sits inside the building footprint.
  roomPolygons: readonly (readonly Point[])[]
}

/**
 * Builds the Three.js scene from the graph through the PaintMaterial seam, flags its
 * meshes as shadow casters and receivers, and frames a camera on its world bounds.
 * Lighting is no longer added here: the lights live on the persistent render scene via
 * <SceneLighting> so the color-temperature slider updates them without a rebuild, and
 * keeping the lights out of the build keeps them out of the framed bounds. The view
 * options carry the surface-edge overlay toggle, off by default (ADR-0132).
 */
export function buildFramedScene(
  graph: SceneGraph,
  paint: Record<string, SurfaceTreatment> = {},
  view: EdgeOverlayOptions = {},
): FramedScene {
  const materials = new PaintMaterialProvider({
    lightColor: kelvinToLinearRgb(DEFAULT_COLOR_TEMPERATURE_K),
    paint,
  })
  const root = buildScene(graph, materials, view)
  markShadowCasters(root)
  const nearWallTargets = prepareNearWallTransparency(
    root,
    exteriorWalls(graph.walls, graph.rooms, graph.openings),
    junctionFadeGroups(buildWallGraph(graph.walls), graph.walls, graph.rooms, graph.openings),
  )
  const bounds = sceneBounds(root)
  const pose = frameSceneCamera(bounds)
  const roomPolygons = graph.rooms.map((room) => room.polygon)
  return { root, pose, bounds, nearWallTargets, roomPolygons }
}
