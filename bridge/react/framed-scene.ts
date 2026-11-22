import {
  ceilingHeight,
  frameSceneCamera,
  kelvinToLinearRgb,
  withDepthRangeOf,
  DEFAULT_CEILING_HEIGHT_MM,
  DEFAULT_COLOR_TEMPERATURE_K,
  FLOOR_NODE_PREFIX,
  type Bounds3,
  type CameraPose,
  type Point,
  type RoomSceneNode,
  type SceneGraph,
  type SceneNode,
  type SurfaceTreatment,
} from '../../core'
import {
  addGroundPlane,
  assembleFloorRoot,
  buildScene,
  disposeObject,
  enrollNearWallTargets,
  isGroundPlane,
  markShadowCasters,
  GRADE_ELEVATION_MM,
  PhysicalMaterialProvider,
  sceneBounds,
  type EdgeOverlayOptions,
  type NearWallEnrollmentEntities,
  type NearWallTarget,
  type SceneRoot,
} from '../../engine'

export interface FramedScene {
  root: SceneRoot
  pose: CameraPose
  bounds: Bounds3 | null
  // The box the camera frames: the framed floor's built content, or every drawn floor's when
  // no floor is framed or the framed floor is absent or has no built content. It equals
  // `bounds` in the building scope.
  framingBounds: Bounds3 | null
  nearWallTargets: NearWallTarget[]
  // The floor's room outlines, in plan millimeters, so the per-frame near-wall
  // fade can tell whether the orbit camera sits inside the building footprint.
  roomPolygons: readonly (readonly Point[])[]
  // The building's top elevation, in Three.js world millimeters, so the near-wall fade
  // can also treat a camera hovering above the roof as outside even when its plan
  // position falls within a room's footprint. Computed per floor by floorTopWorld
  // (issue #609).
  buildingTopWorld?: number
}

/** The two boxes the camera reads: the one it frames and the one of everything drawn. */
export type FramingBoxes = Pick<FramedScene, 'framingBounds' | 'bounds'>

/**
 * A floor's reach toward the building top, in Three.js world millimeters: its elevation
 * plus the tallest of its rooms' ceiling heights, or DEFAULT_CEILING_HEIGHT_MM when it has
 * no rooms. Shared by buildFramedScene's single-floor case and the reconciler's per-floor
 * assembly (issue #609) so the two stay in lockstep by construction.
 */
export function floorTopWorld(elevation: number, rooms: readonly RoomSceneNode[]): number {
  const ceilingHeights = rooms.map((room) => ceilingHeight(room))
  return (
    elevation +
    (ceilingHeights.length > 0 ? Math.max(...ceilingHeights) : DEFAULT_CEILING_HEIGHT_MM)
  )
}

/**
 * Builds the Three.js scene from the graph through the material-provider seam
 * (ADR-0067), flags its meshes as shadow casters and receivers, and frames a
 * camera on its world bounds.
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
  // Exterior walls carry their hosted openings and, through the plan-space pairing, the
  // furniture standing against them, so all three fade as one target. The reconciler
  // enrolls per assembled floor group through this same seam.
  const nearWallTargets = enrollNearWallTargets(root, graph)
  const bounds = sceneBounds(root)
  const pose = frameSceneCamera(bounds)
  const roomPolygons = graph.rooms.map((room) => room.polygon)
  // Callers pass zero or one floor node; a multi-floor graph would only pick up the
  // first node's elevation here.
  const floorElevation = graph.nodes[0]?.elevation ?? 0
  const buildingTopWorld = floorTopWorld(floorElevation, graph.rooms)
  return {
    root,
    pose,
    bounds,
    framingBounds: bounds,
    nearWallTargets,
    roomPolygons,
    buildingTopWorld,
  }
}

/**
 * One floor's contribution to a stacked scene: the floor node (its id and elevation), the
 * ordered sub-group list a floor group is assembled from (wall first, then rooms, openings,
 * furniture), the entities its near-wall fade targets are enrolled from, and its room
 * outlines. The caching reconciler builds these from its per-floor sub-group caches.
 *
 * The floor carries enrollment inputs rather than finished targets because enrollment
 * needs the assembled floor group, where a wall stands next to the sub-groups that fade
 * with it, and only `frameStackedScene` has that (issue #437).
 */
export interface FloorAssembly {
  node: SceneNode
  subgroups: SceneRoot[]
  entities: NearWallEnrollmentEntities
  roomPolygons: readonly (readonly Point[])[]
  // This floor's own reach toward the building top, in world millimeters (floorTopWorld).
  // frameStackedScene takes the highest of these across every floor.
  topWorld: number
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

/** The stacked floor groups under one root, with the fade targets every floor enrolled. */
interface StackedFloors {
  root: SceneRoot
  nearWallTargets: NearWallTarget[]
  // The box of the framed floor's group alone, read before it joins the shared root.
  framedFloorBounds: Bounds3 | null
}

// Stacks every floor group under one root, each seated at its elevation (assembleFloorRoot),
// reusing the first floor's assembled root as the shared root and reparenting the rest into
// it, so no Three.js group is constructed in the bridge. Each floor enrolls its fade targets
// as soon as its group is assembled, while the floor's own sub-groups are the ones under it,
// and the scene unions them. The caller passes a non-empty list; the final guard only
// narrows the type.
function stackFloorRoot(floors: FloorAssembly[], framedNodeId?: string): StackedFloors {
  let root: SceneRoot | undefined
  let framedFloorBounds: Bounds3 | null = null
  const nearWallTargets: NearWallTarget[] = []
  for (const floor of floors) {
    const floorRoot = assembleFloorRoot(floor.node, floor.subgroups)
    if (floor.node.id === framedNodeId) {
      framedFloorBounds = sceneBounds(floorRoot)
    }
    nearWallTargets.push(...enrollNearWallTargets(floorRoot, floor.entities))
    if (root === undefined) {
      root = floorRoot
      continue
    }
    const [floorGroup] = floorRoot.children
    if (floorGroup !== undefined) root.add(floorGroup)
  }
  if (root === undefined) throw new Error('cannot frame a scene with no floors')
  return { root, nearWallTargets, framedFloorBounds }
}

/**
 * Frames pre-built floors into a FramedScene: the shared root of every floor group seated
 * at its elevation, a camera framed on the framed floor's box (every drawn floor's when no
 * floor is framed, or when the framed floor is absent or has no built content) with near and far
 * planes from the box of everything drawn, and one site ground plane sized to the whole
 * footprint at the graph grade. Bounds are read before the ground
 * plane is seated (sceneBounds excludes the ground either way). This is the caching
 * reconciler's counterpart to buildScene's stacked, grounded root (issue #479).
 */
export function frameStackedScene(
  floors: FloorAssembly[],
  gradeElevation: number | undefined,
  framedFloorId?: string | null,
): FramedScene {
  const framedNodeId = framedFloorId == null ? undefined : `${FLOOR_NODE_PREFIX}${framedFloorId}`
  const { root, nearWallTargets, framedFloorBounds } = stackFloorRoot(floors, framedNodeId)
  // Read the bounds before seating the ground (sceneBounds excludes the ground either way),
  // then seat the shared ground plane sized to the whole footprint already in the root.
  const bounds = sceneBounds(root)
  const framingBounds = framedFloorBounds ?? bounds
  refreshGroundPlane(root, gradeElevation)
  return {
    root,
    pose: withDepthRangeOf(frameSceneCamera(framingBounds), bounds),
    bounds,
    framingBounds,
    nearWallTargets,
    roomPolygons: floors.flatMap((floor) => floor.roomPolygons),
    buildingTopWorld: Math.max(...floors.map((floor) => floor.topWorld)),
  }
}
