import {
  buildWallGraph,
  exteriorWalls,
  frameSceneCamera,
  junctionFadeGroups,
  kelvinToLinearRgb,
  withAttachedFurniture,
  DEFAULT_COLOR_TEMPERATURE_K,
  type Bounds3,
  type CameraPose,
  type Point,
  type SceneGraph,
  type SceneNode,
  type SurfaceTreatment,
} from '../../core'
import {
  addGroundPlane,
  assembleFloorRoot,
  buildScene,
  disposeObject,
  isGroundPlane,
  markShadowCasters,
  prepareNearWallTransparency,
  GRADE_ELEVATION_MM,
  PhysicalMaterialProvider,
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
  const materials = new PhysicalMaterialProvider({
    lightColor: kelvinToLinearRgb(DEFAULT_COLOR_TEMPERATURE_K),
    paint,
  })
  const root = buildScene(graph, materials, view)
  markShadowCasters(root)
  const nearWallTargets = prepareNearWallTransparency(
    root,
    // Exterior walls carry their hosted openings and, via the plan-space pairing,
    // the furniture standing against them, so all three fade as one target.
    withAttachedFurniture(
      exteriorWalls(graph.walls, graph.rooms, graph.openings),
      graph.walls,
      graph.furniture,
    ),
    junctionFadeGroups(buildWallGraph(graph.walls), graph.walls, graph.rooms, graph.openings),
  )
  const bounds = sceneBounds(root)
  const pose = frameSceneCamera(bounds)
  const roomPolygons = graph.rooms.map((room) => room.polygon)
  return { root, pose, bounds, nearWallTargets, roomPolygons }
}

/**
 * One floor's contribution to a stacked scene: the floor node (its id and elevation), the
 * ordered sub-group list a floor group is assembled from (wall first, then rooms, openings,
 * furniture), the near-wall fade targets its walls own, and its room outlines. The caching
 * reconciler builds these from its per-floor sub-group caches.
 */
export interface FloorAssembly {
  node: SceneNode
  subgroups: SceneRoot[]
  nearWallTargets: NearWallTarget[]
  roomPolygons: readonly (readonly Point[])[]
}

/**
 * Seats the assembled root on the site ground plane at grade (issue #477; ADR-0131,
 * ADR-0138). The ground is per-scene, sized to the whole footprint already in `root`, so it
 * runs after the floors are stacked. A plane already seated at the requested grade is kept;
 * otherwise every ground plane on the root is removed and disposed before the fresh one is
 * added, so no stale copy survives a grade edit. Camera framing keeps ignoring it
 * (sceneBounds skips isGroundPlane).
 */
export function refreshGroundPlane(root: SceneRoot, gradeElevation: number | undefined): void {
  const grade = gradeElevation ?? GRADE_ELEVATION_MM
  const planes = root.children.filter(isGroundPlane)
  if (planes.length === 1 && planes[0]?.position.y === grade) return
  for (const plane of planes) {
    root.remove(plane)
    disposeObject(plane)
  }
  addGroundPlane(root, grade)
}

// Stacks every floor group under one root, each seated at its elevation (assembleFloorRoot),
// reusing the first floor's assembled root as the shared root and reparenting the rest into
// it, so no Three.js group is constructed in the bridge. The caller passes a non-empty list;
// the final guard only narrows the type.
function stackFloorRoot(floors: FloorAssembly[]): SceneRoot {
  let root: SceneRoot | undefined
  for (const floor of floors) {
    const floorRoot = assembleFloorRoot(floor.node, floor.subgroups)
    if (root === undefined) {
      root = floorRoot
      continue
    }
    const [floorGroup] = floorRoot.children
    if (floorGroup !== undefined) root.add(floorGroup)
  }
  if (root === undefined) throw new Error('cannot frame a scene with no floors')
  return root
}

// A single floor hands back its walls' own targets array unchanged, so an unchanged wall
// keeps the same array reference across reconciles; a stacked building unions every floor's.
function stackedNearWallTargets(floors: FloorAssembly[]): NearWallTarget[] {
  const [only] = floors
  if (floors.length === 1 && only !== undefined) return only.nearWallTargets
  return floors.flatMap((floor) => floor.nearWallTargets)
}

/**
 * Frames pre-built floors into a FramedScene: the shared root of every floor group seated
 * at its elevation, a camera framed over the whole building's bounds, and one site ground
 * plane sized to the whole footprint at the graph grade. Bounds are read before the ground
 * plane is seated (sceneBounds excludes the ground either way). This is the caching
 * reconciler's counterpart to buildScene's stacked, grounded root (issue #479).
 */
export function frameStackedScene(
  floors: FloorAssembly[],
  gradeElevation: number | undefined,
): FramedScene {
  const root = stackFloorRoot(floors)
  // Read the bounds before seating the ground (sceneBounds excludes the ground either way),
  // then seat the shared ground plane sized to the whole footprint already in the root.
  const bounds = sceneBounds(root)
  refreshGroundPlane(root, gradeElevation)
  return {
    root,
    pose: frameSceneCamera(bounds),
    bounds,
    nearWallTargets: stackedNearWallTargets(floors),
    roomPolygons: floors.flatMap((floor) => floor.roomPolygons),
  }
}
